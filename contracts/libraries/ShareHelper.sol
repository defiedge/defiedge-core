//SPDX-License-Identifier: BSL
pragma solidity =0.7.6;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "@uniswap/v3-core/contracts/libraries/FullMath.sol";

import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";
import "@uniswap/v3-periphery/contracts/libraries/PositionKey.sol";

import "@openzeppelin/contracts/math/Math.sol";

import "../base/StrategyBase.sol";

library ShareHelper {
    using SafeMath for uint256;

    uint256 public constant BASE = 1e18;

    struct Tick {
        uint256 amount0;
        uint256 amount1;
        int24 tickLower;
        int24 tickUpper;
    }

    /**
     * @notice Gets time weighted tick to calculate price
     * @param _pool Address of the pool
     * @param _period Seconds to query data from
     */
    function getTick(address _pool, uint32 _period)
        public
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
        public
        view
        returns (uint256 price)
    {
        int24 tick = getTick(_pool, _period);

        uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);

        uint256 ratioX192 = uint256(sqrtRatioX96).mul(sqrtRatioX96);

        price = FullMath.mulDiv(ratioX192, BASE, 1 << 192);
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
    ) public view returns (uint256 share) {
        uint256 totalShares = _totalShares;
        uint256 price = consult(_pool, 1800);

        if (totalShares > 0) {
            uint256 numerator = (_amount0.mul(price)).add(_amount1.mul(BASE));
            uint256 denominator = (_totalAmount0.mul(price)).add(
                _totalAmount1.mul(BASE)
            );
            share = totalShares.mul(numerator).div(denominator);
        } else {
            // mint initial shares based on threshold of 10000
            uint256 threshold = uint256(10000).mul(BASE);
            if (price >= BASE) {
                uint256 m;
                m = 1;
                if (price >= threshold) {
                    m = (price).div(threshold);
                    share = (_amount0.mul(price).add(_amount1.mul(BASE))).div(
                        m.mul(BASE)
                    );
                } else {
                    m = 1;
                    if (price.mul(threshold) <= 1e36) {
                        m = uint256(1e36).div(price.mul(threshold));
                    }
                    share = (_amount0.mul(price).add(_amount1.mul(BASE))).div(
                        price.mul(m)
                    );
                }
            }
            share = Math.max(_amount0, _amount1);
        }
    }

    /**
     * @notice Checks if the the current price has deviation from the pool price
     * @param _pool Address of the pool
     * @param _allowedDeviation Allowed deviation for the pool
     */
    function hasDeviation(address _pool, uint256 _allowedDeviation)
        public
        view
        returns (bool)
    {
        uint256 price = consult(_pool, 1800);
        IUniswapV3Pool pool = IUniswapV3Pool(_pool);

        (uint160 sqrtPriceX96, , , , , , ) = pool.slot0();
        uint256 priceX192 = uint256(sqrtPriceX96).mul(sqrtPriceX96);
        uint256 currentPrice = FullMath.mulDiv(priceX192, BASE, 1 << 192);

        uint256 diff;

        diff = currentPrice.mul(BASE).div(price);

        // check if the price is above deviation
        if (
            diff > (BASE.add(_allowedDeviation)) ||
            diff < (BASE.sub(_allowedDeviation))
        ) {
            return true;
        }

        return false;
    }
}
