//SPDX-License-Identifier: BSL
pragma solidity =0.7.6;
pragma abicoder v2;

// contracts
import "@openzeppelin/contracts/utils/SafeCast.sol";
import "../base/StrategyBase.sol";

// interfaces
import "../libraries/LiquidityHelper.sol";
import "../libraries/OneInchHelper.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "../interfaces/IOneInch.sol";

// libraries
import "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol";

contract UniswapV3LiquidityManager is StrategyBase, IUniswapV3MintCallback {
    using SafeMath for uint256;
    using SafeCast for uint256;

    event Swap(uint256 amountIn, uint256 amountOut, bool _zeroForOne);

    event FeesClaimed(
        address indexed strategy,
        uint256 amount0,
        uint256 amount1
    );

    struct MintCallbackData {
        address payer;
        address pool;
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

        // mint performance fees
        addPerformanceFees(fee0, fee1);
    }

    function addPerformanceFees(uint256 _fee0, uint256 _fee1) internal {
        // transfer performance fee to manager
        uint256 performanceFee = manager.performanceFee();
        // address feeTo = manager.feeTo();

        // get total amounts with fees
        (uint256 totalAmount0, uint256 totalAmount1, , ) = this
            .getAUMWithFees();

        accPerformanceFee = accPerformanceFee.add(
            ShareHelper.calculateShares(
                chainlinkRegistry,
                address(pool),
                usdAsBase,
                _fee0.mul(performanceFee).div(1e8),
                _fee1.mul(performanceFee).div(1e8),
                totalAmount0,
                totalAmount1,
                totalSupply()
            )
        );

        emit FeesClaimed(address(this), _fee0, _fee1);
    }

    /**
     * @notice Burns all the liquidity and collects fees
     * @param _ticks Array of the ticks
     */
    function burnAllLiquidity(Tick[] memory _ticks) internal {
        for (uint256 i = 0; i < _ticks.length; i++) {
            this.burnLiquiditySingle(_ticks[i].tickLower, _ticks[i].tickUpper);
        }
    }

    function burnLiquiditySingle(int24 _tickLower, int24 _tickUpper)
        external
        hasDeviation
    {
        require(manager.isAllowedToBurn(msg.sender), "N");
        (uint128 currentLiquidity, , , , ) = pool.positions(
            PositionKey.compute(address(this), _tickLower, _tickUpper)
        );
        if (currentLiquidity > 0) {
            burnLiquidity(_tickLower, _tickUpper, 0, currentLiquidity);
        }
    }

    /**
     * @notice Swap the fudns to 1Inch
     */
    function swap(bytes calldata data) external onlyOperator hasDeviation {
        (address srcToken, address dstToken, uint256 amount) = OneInchHelper
            .decodeData(token0, token1, data);

        require(srcToken == token0 || srcToken == token1, "IT");
        require(dstToken == token0 || dstToken == token1, "IT");

        address tokenIn = srcToken == token0 ? token0 : token1;
        address tokenOut = dstToken == token0 ? token0 : token1;

        uint256 tokenInBalBefore = IERC20(tokenIn).balanceOf(address(this));
        uint256 tokenOutBalBefore = IERC20(tokenOut).balanceOf(address(this));

        IERC20(srcToken).approve(address(oneInchRouter), amount);

        // Interact with 1inch through contract call with data
        (bool success, bytes memory returnData) = address(oneInchRouter).call{
            value: 0
        }(data);

        // Verify return status and data
        if (!success) {
            if (returnData.length < 68) {
                // If the returnData length is less than 68, then the transaction failed silently.
                revert("swap");
            } else {
                // Look for revert reason and bubble it up if present
                assembly {
                    returnData := add(returnData, 0x04)
                }
                revert(abi.decode(returnData, (string)));
            }
        }

        uint256 tokenInBalAfter = IERC20(tokenIn).balanceOf(address(this));
        uint256 tokenOutBalAfter = IERC20(tokenOut).balanceOf(address(this));

        uint256 amountIn = tokenInBalBefore.sub(tokenInBalAfter);
        uint256 amountOut = tokenOutBalAfter.sub(tokenOutBalBefore);

        require(
            OracleLibrary.allowSwap(
                address(pool),
                address(factory),
                amountIn,
                amountOut,
                tokenIn,
                tokenOut,
                [usdAsBase[0], usdAsBase[1]]
            ),
            "S"
        );
    }

    // /**
    //  * @notice Swaps through the path calculated by Uniswap auto-router
    //  */
    // function swap(
    //     bool _usePath,
    //     bool _zeroForOne,
    //     bytes memory _path,
    //     uint256 _deadline,
    //     uint256 _amountIn,
    //     uint256 _amountOutMinimum,
    //     uint160 _sqrtPriceLimitX96
    // ) external onlyOperator hasDeviation {
    //     if (ticks.length > 0) {
    //         onHold = true;
    //         // burn all liquidity
    //         burnAllLiquidity(ticks);
    //         // delete ticks
    //         delete ticks;
    //     }

    //     // check if swap exceed allowed deviation and revert if maximum swap limits reached
    //     if (
    //         OracleLibrary.isSwapExceedDeviation(
    //             address(pool),
    //             chainlinkRegistry,
    //             usdAsBase,
    //             address(manager)
    //         )
    //     ) {
    //         require(manager.increamentSwapCounter(), "LR");
    //     }

    //     address tokenIn;
    //     address tokenOut;
    //     bool[2] memory isBase; // is direct USD feed is available for the token?

    //     if (_zeroForOne) {
    //         tokenIn = token0;
    //         tokenOut = token1;
    //         isBase = [usdAsBase[0], usdAsBase[1]];
    //     } else {
    //         tokenIn = token1;
    //         tokenOut = token0;
    //         isBase = [usdAsBase[1], usdAsBase[0]];
    //     }

    //     IERC20(tokenIn).approve(address(swapRouter), _amountIn);

    //     uint256 amountOut;

    //     if (_usePath) {
    //         amountOut = swapRouter.exactInput(
    //             ISwapRouter.ExactInputParams({
    //                 path: _path,
    //                 recipient: address(this),
    //                 deadline: _deadline,
    //                 amountIn: _amountIn,
    //                 amountOutMinimum: _amountOutMinimum
    //             })
    //         );
    //     } else {
    //         amountOut = swapRouter.exactInputSingle(
    //             ISwapRouter.ExactInputSingleParams({
    //                 tokenIn: tokenIn,
    //                 tokenOut: tokenOut,
    //                 fee: pool.fee(),
    //                 recipient: address(this),
    //                 deadline: _deadline,
    //                 amountIn: _amountIn,
    //                 amountOutMinimum: _amountOutMinimum,
    //                 sqrtPriceLimitX96: _sqrtPriceLimitX96
    //             })
    //         );
    //     }

    //     require(
    //         OracleLibrary.allowSwap(
    //             address(pool),
    //             address(factory),
    //             _amountIn,
    //             amountOut,
    //             tokenIn,
    //             tokenOut,
    //             isBase
    //         ),
    //         "S"
    //     );

    //     emit Swap(_amountIn, amountOut, _zeroForOne);
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
                TransferHelper.safeTransfer(token0, msg.sender, amount0);
            }
            if (amount1 > 0) {
                TransferHelper.safeTransfer(token1, msg.sender, amount1);
            }
        } else {
            // take and transfer tokens to Uniswap V3 pool from the user
            if (amount0 > 0) {
                TransferHelper.safeTransferFrom(
                    token0,
                    decoded.payer,
                    msg.sender,
                    amount0
                );
            }
            if (amount1 > 0) {
                TransferHelper.safeTransferFrom(
                    token1,
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
        // get unused amounts
        amount0 = IERC20(token0).balanceOf(address(this));
        amount1 = IERC20(token1).balanceOf(address(this));

        // get fees accumulated in each tick
        for (uint256 i = 0; i < ticks.length; i++) {
            Tick memory tick = ticks[i];

            // get current liquidity from the pool
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
                pool.burn(tick.tickLower, tick.tickUpper, 0);

                // fees are credited as tokensOwed in Uniswap when burn is called with 0
                // https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolActions.sol#L43
                (, , , uint256 tokensOwed0, uint256 tokensOwed1) = pool
                    .positions(
                        PositionKey.compute(
                            address(this),
                            tick.tickLower,
                            tick.tickUpper
                        )
                    );

                totalFee0 = totalFee0.add(tokensOwed0);
                totalFee1 = totalFee1.add(tokensOwed1);

                amount0 = amount0.add(tokensOwed0).add(position0);
                amount1 = amount1.add(tokensOwed1).add(position1);
            }
        }
    }
}
