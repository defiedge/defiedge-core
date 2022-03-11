//SPDX-License-Identifier: Unlicense
pragma solidity ^0.7.6;
pragma abicoder v2;

// contracts
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../DefiEdgeStrategy.sol";

// libraries
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";
import "@uniswap/v3-periphery/contracts/libraries/PositionKey.sol";

// interfaces
import "../interfaces/IStrategy.sol";
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
    ) public view returns (uint128 liquidity) {
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
    ) public view returns (uint256 amount0, uint256 amount1) {
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
    //  * @dev Replaces old ticks with new ticks
    //  * @param _ticks New ticks
    //  */
    // function invalidTicks(DefiEdgeStrategy.Tick[] memory _ticks)
    //     external
    //     pure
    //     returns (bool isInvalid)
    // {
    //     // checks for valid ticks length
    //     require(_ticks.length <= 5, "ITL");
    //     for (uint256 i = 0; i < _ticks.length; i++) {
    //         int24 tickLower = _ticks[i].tickLower;
    //         int24 tickUpper = _ticks[i].tickUpper;

    //         // check that two tick upper and tick lowers are not in array cannot be same
    //         for (uint256 j = 0; j < i; j++) {
    //             if (i != j) {
    //                 if (tickLower == _ticks[j].tickLower) {
    //                     if (tickUpper != _ticks[j].tickUpper == true) {
    //                         isInvalid = true;
    //                     }
    //                 }
    //             }
    //         }
    //     }
    // }
}
