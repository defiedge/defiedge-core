//SPDX-License-Identifier: Unlicense
pragma solidity =0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol";
import "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";

import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

// import libraries
import "../libraries/LiquidityHelper.sol";

import "../base/StrategyBase.sol";

contract UniswapPoolActions is
    StrategyBase,
    IUniswapV3MintCallback,
    IUniswapV3SwapCallback
{
    using SafeMath for uint256;

    event FeesClaimed(
        address indexed strategy,
        uint256 amount0,
        uint256 amount1
    );

    struct MintCallbackData {
        address payer;
        address pool;
    }

    struct SwapCallbackData {
        address pool;
        bool zeroToOne;
    }

    /**
     * @notice Mints liquidity from V3 Pool
     * @param _tickLower Lower tick
     * @param _tickUpper Upper tick
     * @param _amount0 Amount of token0
     * @param _amount1 Amount of token1
     * @param _payer Address which is adding the liquidity
     */
    function mintLiquidity(
        int24 _tickLower,
        int24 _tickUpper,
        uint256 _amount0,
        uint256 _amount1,
        address _payer
    ) internal returns (uint256 amount0, uint256 amount1) {
        uint128 liquidity = LiquidityHelper.getLiquidityForAmounts(
            address(pool),
            _tickLower,
            _tickUpper,
            _amount0,
            _amount1
        );

        // add liquidity to Uniswap pool
        (amount0, amount1) = pool.mint(
            address(this),
            _tickLower,
            _tickUpper,
            liquidity,
            abi.encode(MintCallbackData({payer: _payer, pool: address(pool)}))
        );
    }

    /**
     * @notice Burns liquidity in the given range
     * @param _tickLower Lower Tick
     * @param _tickUpper Upper Tick
     * @param _amount0 Amount 0 to burn
     * @param _amount1 Amount to burn
     */
    function burnLiquidity(
        int24 _tickLower,
        int24 _tickUpper,
        uint256 _amount0,
        uint256 _amount1
    )
        internal
        returns (
            uint256 collect0,
            uint256 collect1,
            uint128 liquidity
        )
    {
        // calculate current liquidity
        liquidity = LiquidityHelper.getLiquidityForAmounts(
            address(pool),
            _tickLower,
            _tickUpper,
            _amount0 > 100 ? _amount0.sub(100) : _amount0,
            _amount1 > 100 ? _amount1.sub(100) : _amount1
        );

        uint256 tokensBurned0;
        uint256 tokensBurned1;

        // burn liquidity
        if (liquidity > 0) {
            (tokensBurned0, tokensBurned1) = pool.burn(
                _tickLower,
                _tickUpper,
                liquidity
            );
        }

        (, , , uint128 tokensOwed0, uint128 tokensOwed1) = pool.positions(
            PositionKey.compute(address(this), _tickLower, _tickUpper)
        );

        // collect fees
        (collect0, collect1) = pool.collect(
            address(this),
            _tickLower,
            _tickUpper,
            uint128(tokensOwed0),
            uint128(tokensOwed1)
        );

        emit FeesClaimed(
            msg.sender,
            collect0 > tokensBurned0 ? uint256(collect0).sub(tokensBurned0) : 0,
            collect1 > tokensBurned1 ? uint256(collect1).sub(tokensBurned1) : 0
        );
    }

    /**
     * @notice Burns all the liquidity and collects fees
     * @param _ticks Array of the ticks
     */
    function burnAllLiquidity(Tick[] memory _ticks)
        internal
        returns (
            uint256 collect0,
            uint256 collect1,
            uint128 liquidity
        )
    {
        for (uint256 i = 0; i < ticks.length; i++) {
            Tick memory tick = _ticks[i];

            // Burn liquidity for range order
            (
                uint256 amount0,
                uint256 amount1,
                uint128 burnedLiquidity
            ) = burnLiquidity(
                tick.tickLower,
                tick.tickUpper,
                tick.amount0,
                tick.amount1
            );

            collect0 = collect0.add(amount0);
            collect1 = collect1.add(amount1);
            liquidity = liquidity + burnedLiquidity;
        }
    }

    /**
     * @dev Callback for Uniswap V3 pool.
     */
    function uniswapV3SwapCallback(
        int256 amount0,
        int256 amount1,
        bytes calldata data
    ) external override {
        SwapCallbackData memory decoded = abi.decode(data, (SwapCallbackData));
        // check if the callback is received from Uniswap V3 Pool
        require(msg.sender == address(pool));

        if (decoded.zeroToOne) {
            TransferHelper.safeTransfer(
                pool.token0(),
                msg.sender,
                uint256(amount0)
            );
        } else {
            TransferHelper.safeTransfer(
                pool.token1(),
                msg.sender,
                uint256(amount1)
            );
        }
    }

    // swaps with exact input single functionality
    function swap(
        bool _zeroToOne,
        int256 _amount,
        uint256 _allowedPriceSlippage,
        uint160 _sqrtPriceLimitX96
    ) internal returns (uint256 amountOut) {
        (uint160 sqrtRatioX96, , , , , , ) = pool.slot0();

        (amountOut) = swapExactInput(_zeroToOne, _amount, _sqrtPriceLimitX96);

        (uint160 newSqrtRatioX96, , , , , , ) = pool.slot0();

        uint160 difference = sqrtRatioX96 < newSqrtRatioX96
            ? sqrtRatioX96 / newSqrtRatioX96
            : newSqrtRatioX96 / sqrtRatioX96;

        if (_allowedPriceSlippage > 0) {
            // check price P slippage
            require(uint256(difference) <= _allowedPriceSlippage.div(1e8));
        }
    }

    function swapExactInput(
        bool _zeroToOne,
        int256 _amount,
        uint160 sqrtPriceLimitX96
    ) internal returns (uint256 amountOut) {
        (int256 amount0, int256 amount1) = pool.swap(
            address(this),
            _zeroToOne,
            _amount,
            sqrtPriceLimitX96,
            abi.encode(
                SwapCallbackData({pool: address(pool), zeroToOne: _zeroToOne})
            )
        );

        return uint256(-(_zeroToOne ? amount1 : amount0));
    }

    /**
     * @dev Callback for Uniswap V3 pool.
     */
    function uniswapV3MintCallback(
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external override {
        MintCallbackData memory decoded = abi.decode(data, (MintCallbackData));

        // check if the callback is received from Uniswap V3 Pool
        require(msg.sender == address(pool));

        if (decoded.payer == address(this)) {
            // transfer tokens already in the contract
            if (amount0 > 0) {
                TransferHelper.safeTransfer(pool.token0(), msg.sender, amount0);
            }
            if (amount1 > 0) {
                TransferHelper.safeTransfer(pool.token1(), msg.sender, amount1);
            }
        } else {
            // take and transfer tokens to Uniswap V3 pool from the user
            if (amount0 > 0) {
                TransferHelper.safeTransferFrom(
                    pool.token0(),
                    decoded.payer,
                    msg.sender,
                    amount0
                );
            }
            if (amount1 > 0) {
                TransferHelper.safeTransferFrom(
                    pool.token1(),
                    decoded.payer,
                    msg.sender,
                    amount1
                );
            }
        }
    }

    function getAUMWithFees()
        internal
        returns (uint256 amount0, uint256 amount1)
    {
        // get balances of amount0 and amount1
        amount0 = IERC20(pool.token0()).balanceOf(msg.sender);
        amount1 = IERC20(pool.token1()).balanceOf(msg.sender);

        // get fees accumulated in each tick
        for (uint256 i = 0; i < ticks.length; i++) {
            Tick memory tick = ticks[i];

            (uint128 currentLiquidity, , , , ) = pool.positions(
                PositionKey.compute(
                    address(this),
                    tick.tickLower,
                    tick.tickUpper
                )
            );

            // update fees earned in Uniswap pool
            // Uniswap recalculates the fees and updates the variables when amount is passed as 0
            if (currentLiquidity > 0) {
                pool.burn(tick.tickLower, tick.tickUpper, 0);
            }

            (, , , uint128 tokensOwed0, uint128 tokensOwed1) = pool.positions(
                PositionKey.compute(
                    address(this),
                    tick.tickLower,
                    tick.tickUpper
                )
            );

            // add fees to the amounts
            amount0 = amount0.add(tokensOwed0);
            amount1 = amount1.add(tokensOwed1);
        }
    }
}
