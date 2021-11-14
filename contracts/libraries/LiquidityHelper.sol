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

    // function getPosition(
    //     address _pool,
    //     address _strategy,
    //     int24 _tickLower,
    //     int24 _tickUpper
    // )
    //     internal
    //     view
    //     returns (
    //         uint128 currentLiquidity,
    //         uint256 tokensOwed0,
    //         uint256 tokensOwed1,
    //         uint256 position0,
    //         uint256 position1
    //     )
    // {
    //     IUniswapV3Pool pool = IUniswapV3Pool(_pool);

    //     bytes32 positionKey = PositionKey.compute(
    //         _strategy,
    //         _tickLower,
    //         _tickUpper
    //     );

    //     (currentLiquidity, , , , ) = pool.positions(positionKey);

    //     (, , , tokensOwed0, tokensOwed1) = pool.positions(positionKey);

    //     (position0, position1) = LiquidityHelper.getAmountsForLiquidity(
    //         address(pool),
    //         _tickLower,
    //         _tickUpper,
    //         currentLiquidity
    //     );
    // }
}
