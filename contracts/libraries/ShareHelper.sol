//SPDX-License-Identifier: Unlicense
pragma solidity =0.7.6;
pragma abicoder v2;
import "hardhat/console.sol";

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "@uniswap/v3-core/contracts/libraries/FullMath.sol";

import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";
import "@uniswap/v3-periphery/contracts/libraries/PositionKey.sol";

import "@openzeppelin/contracts/math/Math.sol";

library ShareHelper {
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

        uint256 ratioX192 = uint256(sqrtRatioX96).mul(sqrtRatioX96);

        price = FullMath.mulDiv(ratioX192, 1e18, 1 << 192);
    }

    /**
     * @dev Calculates the shares to be given for specific position
     * @param _pool Address of the pool
     * @param _amount0 Amount of token0
     * @param _amount1 Amount of token1
     * @param _totalAmount0 Total amount of token0
     * @param _totalAmount1 Total amount of token1
     * @param _totalShares Total Number of shares
     */
    function calculateShares(
        address _pool,
        uint256 _amount0,
        uint256 _amount1,
        uint256 _totalAmount0,
        uint256 _totalAmount1,
        uint256 _totalShares
    ) internal view returns (uint256 share) {
        uint256 totalShares = _totalShares;
        uint256 price = consult(_pool, 60);

        if (totalShares > 0) {
            uint256 numerator = (_amount0.mul(price)).add(_amount1.mul(1e18));
            uint256 denominator = (_totalAmount0.mul(price)).add(
                _totalAmount1.mul(1e18)
            );
            share = totalShares.mul(numerator).div(denominator);
        } else {
            // mint initial shares based on threshold of 10000
            uint256 threshold = uint256(10000).mul(1e18);
            if (price >= 1e18) {
                uint256 m;
                m = 1;
                if (price >= threshold) {
                    m = (price).div(threshold);
                    share = (_amount0.mul(price).add(_amount1.mul(1e18))).div(
                        m.mul(1e18)
                    );
                } else {
                    m = 1;
                    if (price.mul(threshold) <= 1e36) {
                        m = uint256(1e36).div(price.mul(threshold));
                    }
                    share = (_amount0.mul(price).add(_amount1.mul(1e18))).div(
                        price.mul(m)
                    );
                }
            }
            share = Math.max(_amount0, _amount1);
        }
    }
}
