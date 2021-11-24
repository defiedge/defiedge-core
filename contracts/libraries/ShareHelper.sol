//SPDX-License-Identifier: BSL
pragma solidity =0.7.6;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "@openzeppelin/contracts/math/Math.sol";

import "./OracleLibrary.sol";

library ShareHelper {
    using SafeMath for uint256;

    uint256 public constant BASE = 1e18;

    /**
     * @dev Calculates the shares to be given for specific position
     * @param _registry Chainlink registry
     * @param _token The token0
     * @param _isBase Is USD used as base
     * @param _amount0 Amount of token0
     * @param _amount1 Amount of token1
     * @param _totalAmount0 Total amount of token0
     * @param _totalAmount1 Total amount of token1
     * @param _totalShares Total Number of shares
     */
    function calculateShares(
        address _registry,
        address _token,
        bool _isBase,
        uint256 _amount0,
        uint256 _amount1,
        uint256 _totalAmount0,
        uint256 _totalAmount1,
        uint256 _totalShares
    ) public view returns (uint256 share) {
        uint256 price = OracleLibrary.getPriceInUSD(_registry, _token, _isBase);

        uint256 totalShares = _totalShares;

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
}
