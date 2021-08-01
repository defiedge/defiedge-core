//SPDX-License-Identifier: Unlicense
pragma solidity =0.7.6;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "../interfaces/IStrategy.sol";

import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";
import "@uniswap/v3-periphery/contracts/libraries/PositionKey.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "hardhat/console.sol";

library LiquidityHelper {
    using SafeMath for uint256;

    struct Tick {
        uint256 amount0;
        uint256 amount1;
        int24 tickLower;
        int24 tickUpper;
    }

    /**
     * @notice Calculates the liquidity amount using current ranges
     * @param _pool Pool address
     * @param _tickLower Lower tick
     * @param _tickUpper Upper tick
     * @param _amount0 Amount to be added for token0
     * @param _amount1 Amount to be added for token1
     * @return liquidity Liquidity amount derived from token amounts
     */
    function getLiquidityForAmounts(
        address _pool,
        int24 _tickLower,
        int24 _tickUpper,
        uint256 _amount0,
        uint256 _amount1
    ) internal view returns (uint128 liquidity) {
        IUniswapV3Pool pool = IUniswapV3Pool(_pool);

        // get sqrtRatios required to calculate liquidity
        (uint160 sqrtRatioX96, , , , , , ) = pool.slot0();

        // calculate liquidity needs to be added
        liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtRatioX96,
            TickMath.getSqrtRatioAtTick(_tickLower),
            TickMath.getSqrtRatioAtTick(_tickUpper),
            _amount0,
            _amount1
        );
    }

    /**
     * @notice Calculates the liquidity amount using current ranges
     * @param _pool Address of the pool
     * @param _tickLower Lower tick
     * @param _tickUpper Upper tick
     * @param _liquidity Liquidity of the pool
     */
    function getAmountsForLiquidity(
        address _pool,
        int24 _tickLower,
        int24 _tickUpper,
        uint128 _liquidity
    ) internal view returns (uint256 amount0, uint256 amount1) {
        IUniswapV3Pool pool = IUniswapV3Pool(_pool);

        // get sqrtRatios required to calculate liquidity
        (uint160 sqrtRatioX96, , , , , , ) = pool.slot0();

        // calculate liquidity needs to be added
        (amount0, amount1) = LiquidityAmounts.getAmountsForLiquidity(
            sqrtRatioX96,
            TickMath.getSqrtRatioAtTick(_tickLower),
            TickMath.getSqrtRatioAtTick(_tickUpper),
            _liquidity
        );
    }

    // /**
    //  * @notice Get's assets under management with realtime fees
    //  */
    // function getAUMWithFees(address _pool, address _strategy)
    //     internal
    //     returns (uint256 amount0, uint256 amount1)
    // {
    //     IUniswapV3Pool pool = IUniswapV3Pool(_pool);
    //     // get balances of amount0 and amount1
    //     amount0 = IERC20(pool.token0()).balanceOf(_strategy);
    //     amount1 = IERC20(pool.token1()).balanceOf(_strategy);

    //     uint256 totalAmount0;
    //     uint256 totalAmount1;

    //     IUnboundStrategy strategy = IUnboundStrategy(_strategy);

    //     // get fees accumulated in each tick
    //     for (uint256 i = 0; i < strategy.tickLength(); i++) {
    //         (, , int24 tickLower, int24 tickUpper) = strategy.ticks(i);

    //         (uint128 currentLiquidity, , , , ) = pool.positions(
    //             PositionKey.compute(_strategy, tickLower, tickUpper)
    //         );

    //         // update fees earned in Uniswap pool
    //         // Uniswap recalculates the fees and updates the variables when amount is passed as 0
    //         if (currentLiquidity > 0) {
    //             pool.burn(tickLower, tickUpper, 0);
    //         }

    //         (, , , uint128 tokensOwed0, uint128 tokensOwed1) = pool.positions(
    //             PositionKey.compute(_strategy, tickLower, tickUpper)
    //         );

    //         (uint256 position0, uint256 position1) = LiquidityHelper
    //             .getAmountsForLiquidity(
    //                 _strategy,
    //                 tickLower,
    //                 tickUpper,
    //                 currentLiquidity
    //             );

    //         // add fees to the amounts
    //         totalAmount0 = totalAmount0.add(tokensOwed0).add(position0);
    //         totalAmount1 = totalAmount1.add(tokensOwed1).add(position1);
    //     }

    //     amount0 = amount0.add(totalAmount0);
    //     amount1 = amount1.add(totalAmount1);
    // }
}
