//SPDX-License-Identifier: Unlicense
pragma solidity =0.7.6;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "@uniswap/v3-core/contracts/libraries/FullMath.sol";

import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";
import "@uniswap/v3-periphery/contracts/libraries/PositionKey.sol";

library UniswapV3Oracle {
    using SafeMath for uint256;

    /**
     * @notice Gets time weighted tick to calculate price
     * @param _pool Address of the pool
     * @param _period Seconds to query data from
     */
    function getTick(address _pool, uint32 _period)
        internal
        view
        returns (int24 timeWeightedAverageTick)
    {
        require(_period != 0, "BP");

        uint32[] memory secondAgos = new uint32[](2);
        secondAgos[0] = _period;
        secondAgos[1] = 0;

        (int56[] memory tickCumulatives, ) = IUniswapV3Pool(_pool).observe(
            secondAgos
        );
        int56 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];

        timeWeightedAverageTick = int24(tickCumulativesDelta / _period);

        // Always round to negative infinity
        if (tickCumulativesDelta < 0 && (tickCumulativesDelta % _period != 0))
            timeWeightedAverageTick--;
    }

    /**
     * @notice Consults V3 TWAP oracle
     * @param _pool Address of the pool
     * @param _period Seconds from which the data needs to be queried
     * @return price Price of the assets calculated from Uniswap V3 Oracle
     */
    function consult(address _pool, uint32 _period)
        internal
        view
        returns (uint256 price)
    {
        int24 tick = getTick(_pool, _period);

        uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);

        uint256 ratioX192 = uint256(sqrtRatioX96) * sqrtRatioX96;

        price = FullMath.mulDiv(ratioX192, 1, 1 << 192);
    }
}
