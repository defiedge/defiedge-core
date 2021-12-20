//SPDX-License-Identifier: BSL
pragma solidity =0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/utils/SafeCast.sol";

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
    using SafeCast for uint256;

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
     * @param _shares The amount of liquidity to be burned based on shares
     */
    function burnLiquidity(
        int24 _tickLower,
        int24 _tickUpper,
        uint256 _shares,
        uint128 _currentLiquidity
    )
        internal
        returns (
            uint256 collect0,
            uint256 collect1,
            uint256 fee0,
            uint256 fee1
        )
    {
        uint256 tokensBurned0;
        uint256 tokensBurned1;
        uint128 currentLiquidity;

        if (_shares > 0) {
            (currentLiquidity, , , , ) = pool.positions(
                PositionKey.compute(address(this), _tickLower, _tickUpper)
            );

            if (currentLiquidity > 0) {
                uint256 liquidity = uint256(currentLiquidity).mul(_shares).div(
                    getTotalSupply()
                );

                (tokensBurned0, tokensBurned1) = pool.burn(
                    _tickLower,
                    _tickUpper,
                    liquidity.toUint128()
                );
            }
        } else {
            (tokensBurned0, tokensBurned1) = pool.burn(
                _tickLower,
                _tickUpper,
                _currentLiquidity
            );
        }

        // collect fees
        (collect0, collect1) = pool.collect(
            address(this),
            _tickLower,
            _tickUpper,
            type(uint128).max,
            type(uint128).max
        );

        fee0 = collect0 > tokensBurned0
            ? uint256(collect0).sub(tokensBurned0)
            : 0;
        fee1 = collect1 > tokensBurned1
            ? uint256(collect1).sub(tokensBurned1)
            : 0;

        collect0 = tokensBurned0;
        collect1 = tokensBurned1;
    }

    /**
     * @notice Burns all the liquidity and collects fees
     * @param _ticks Array of the ticks
     */
    function burnAllLiquidity(Tick[] memory _ticks) internal {
        uint256 totalCollected0;
        uint256 totalCollected1;

        uint256 totalBurned0;
        uint256 totalBurned1;

        for (uint256 i = 0; i < _ticks.length; i++) {
            Tick memory tick = _ticks[i];

            (uint128 currentLiquidity, , , , ) = pool.positions(
                PositionKey.compute(
                    address(this),
                    tick.tickLower,
                    tick.tickUpper
                )
            );

            uint256 tokensBurned0;
            uint256 tokensBurned1;
            uint256 collect0;
            uint256 collect1;

            (tokensBurned0, tokensBurned0, collect0, collect1) = burnLiquidity(
                tick.tickLower,
                tick.tickUpper,
                0,
                currentLiquidity
            );

            totalBurned0 = totalBurned0.add(tokensBurned0);
            totalBurned1 = totalBurned1.add(tokensBurned1);

            totalCollected0 = totalCollected0.add(collect0);
            totalCollected1 = totalCollected1.add(collect1);
        }

        emit FeesClaimed(
            msg.sender,
            totalCollected0 > totalBurned0
                ? uint256(totalCollected0).sub(totalBurned0)
                : 0,
            totalCollected1 > totalBurned1
                ? uint256(totalCollected1).sub(totalBurned1)
                : 0
        );
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

    /**
     * @notice Get's assets under management with realtime fees
     */
    function getAUMWithFees()
        external
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 totalFee0,
            uint256 totalFee1
        )
    {
        amount0 = IERC20(pool.token0()).balanceOf(address(this));
        amount1 = IERC20(pool.token1()).balanceOf(address(this));
        // get fees accumulated in each tick
        for (uint256 i = 0; i < ticks.length; i++) {
            Tick memory tick = ticks[i];

            bytes32 positionKey = PositionKey.compute(
                address(this),
                tick.tickLower,
                tick.tickUpper
            );

            // get current liquidity
            (uint128 currentLiquidity, , , , ) = pool.positions(positionKey);

            if (currentLiquidity > 0) {
                // calculate current positions in the pool from currentLiquidity
                (uint256 position0, uint256 position1) = LiquidityHelper
                    .getAmountsForLiquidity(
                        address(pool),
                        tick.tickLower,
                        tick.tickUpper,
                        currentLiquidity
                    );

                // update fees earned in Uniswap pool
                // Uniswap recalculates the fees and updates the variables when amount is passed as 0
                pool.burn(tick.tickLower, tick.tickUpper, 0);

                (, , , uint256 tokensOwed0, uint256 tokensOwed1) = pool
                    .positions(positionKey);

                // collect fees
                pool.collect(
                    address(this),
                    tick.tickLower,
                    tick.tickUpper,
                    type(uint128).max,
                    type(uint128).max
                );

                totalFee0 = totalFee0.add(tokensOwed0);
                totalFee1 = totalFee1.add(tokensOwed1);

                amount0 = amount0.add(tokensOwed0).add(position0);
                amount1 = amount1.add(tokensOwed1).add(position1);
            }
        }
    }
}
