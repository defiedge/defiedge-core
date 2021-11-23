//SPDX-License-Identifier: BSL
pragma solidity =0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/utils/SafeCast.sol";

import "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol";
// import "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";

import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

// import libraries
import "../libraries/LiquidityHelper.sol";

import "../base/StrategyBase.sol";

contract UniswapV3LiquidityManager is StrategyBase, IUniswapV3MintCallback {
    using SafeMath for uint256;
    using SafeCast for uint256;

    ISwapRouter public swapRouter;

    event Swap(uint256 amountIn, uint256 amountOut, bool zeroToOne);

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
    ) internal hasDeviation returns (uint256 amount0, uint256 amount1) {
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
        hasDeviation
        returns (
            uint256 collect0,
            uint256 collect1,
            uint256 fee0,
            uint256 fee1
        )
    {
        uint256 tokensBurned0;
        uint256 tokensBurned1;

        if (_shares > 0) {
            (_currentLiquidity, , , , ) = pool.positions(
                PositionKey.compute(address(this), _tickLower, _tickUpper)
            );
            if (_currentLiquidity > 0) {
                uint256 liquidity = uint256(_currentLiquidity).mul(_shares).div(
                    totalSupply()
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

        // transfer performance fee to manager
        uint256 performanceFee = manager.performanceFee();
        if (fee0 > 0) {
            TransferHelper.safeTransfer(
                pool.token0(),
                manager.feeTo(),
                fee0.mul(performanceFee).div(1e8)
            );
        }

        if (fee1 > 0) {
            TransferHelper.safeTransfer(
                pool.token1(),
                manager.feeTo(),
                fee1.mul(performanceFee).div(1e8)
            );
        }

        emit FeesClaimed(address(this), fee0, fee1);
    }

    /**
     * @notice Burns all the liquidity and collects fees
     * @param _ticks Array of the ticks
     */
    function burnAllLiquidity(Tick[] memory _ticks) internal {
        for (uint256 i = 0; i < _ticks.length; i++) {
            (uint128 currentLiquidity, , , , ) = pool.positions(
                PositionKey.compute(
                    address(this),
                    _ticks[i].tickLower,
                    _ticks[i].tickUpper
                )
            );
            burnLiquidity(
                _ticks[i].tickLower,
                _ticks[i].tickUpper,
                0,
                currentLiquidity
            );
        }
    }

    /**
     * @notice Swaps through the path calculated by Uniswap auto-router
     */
    function swapExactInput(
        bool zeroForOne,
        bytes memory path,
        uint256 deadline,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) external {
        address tokenIn;
        address tokenOut;
        bool[2] memory isBase; // is direct USD feed is available for the token?
        if (zeroForOne) {
            tokenIn = pool.token0();
            tokenOut = pool.token1();
            isBase = [true, false];
        } else {
            tokenIn = pool.token1();
            tokenOut = pool.token0();
            isBase = [false, true];
        }
        IERC20(tokenIn).approve(address(swapRouter), amountIn);
        uint256 amountOut = swapRouter.exactInput(
            ISwapRouter.ExactInputParams({
                path: path,
                recipient: address(this),
                deadline: deadline,
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum
            })
        );
        uint256 amountInUSD = amountIn.mul(
            OracleLibrary.getPriceInUSD(
                factory.chainlinkRegistry(),
                tokenIn,
                isBase[0]
            )
        );
        uint256 amountOutUSD = amountOut.mul(
            OracleLibrary.getPriceInUSD(
                factory.chainlinkRegistry(),
                tokenOut,
                isBase[1]
            )
        );
        // allow only 2% of slippage via autorouter
        // TODO: make this splippage controlled by governance
        require(
            amountInUSD <= amountOutUSD.add(amountOutUSD.mul(2).div(100)),
            "S"
        );
    }

    // /**
    //  * @notice Swap one token to another
    //  */
    // function swapExactInputSingle(
    //     bool _zeroForOne,
    //     uint256 _deadline,
    //     uint256 _amountIn,
    //     uint256 _amountOutMinimum,
    //     uint160 _sqrtPriceLimitX96
    // ) external onlyOperator isValidStrategy hasDeviation {
    //     address tokenIn;
    //     address tokenOut;
    //     if (_zeroForOne) {
    //         tokenIn = pool.token0();
    //         tokenOut = pool.token1();
    //     } else {
    //         tokenIn = pool.token1();
    //         tokenOut = pool.token0();
    //     }
    //     IERC20(tokenIn).approve(address(swapRouter), _amountIn);
    //     swapRouter.exactInputSingle(
    //         ISwapRouter.ExactInputSingleParams({
    //             tokenIn: tokenIn,
    //             tokenOut: tokenOut,
    //             fee: pool.fee(),
    //             recipient: address(this),
    //             deadline: _deadline,
    //             amountIn: _amountIn,
    //             amountOutMinimum: _amountOutMinimum,
    //             sqrtPriceLimitX96: _sqrtPriceLimitX96
    //         })
    //     );
    // }

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

            (uint128 currentLiquidity, , , , ) = pool.positions(
                PositionKey.compute(
                    address(this),
                    tick.tickLower,
                    tick.tickUpper
                )
            );

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
                (uint256 tokensOwed0, uint256 tokensOwed1) = pool.burn(
                    tick.tickLower,
                    tick.tickUpper,
                    0
                );

                totalFee0 = totalFee0.add(tokensOwed0);
                totalFee1 = totalFee1.add(tokensOwed1);
                amount0 = amount0.add(tokensOwed0).add(position0);
                amount1 = amount1.add(tokensOwed1).add(position1);
            }
        }
    }
}
