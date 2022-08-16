//SPDX-License-Identifier: Unlicense
pragma solidity ^0.7.6;
pragma abicoder v2;
import "hardhat/console.sol";

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "@uniswap/v3-core/contracts/libraries/FullMath.sol";

import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";
import "@uniswap/v3-periphery/contracts/libraries/PositionKey.sol";

import "@openzeppelin/contracts/math/Math.sol";
import "@chainlink/contracts/src/v0.7/interfaces/FeedRegistryInterface.sol";

import "../../twap/libraries/TwapOracleLibrary.sol";

contract TwapShareHelperTest {
    using SafeMath for uint256;
    uint256 public constant DIVISOR = 100e18;

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
     * @param _registry Chainlink registry interface
     * @param _pool The token0
     * @param _amount0 Amount of token0
     * @param _amount1 Amount of token1
     * @param _totalAmount0 Total amount of token0
     * @param _totalAmount1 Total amount of token1
     * @param _totalShares Total Number of shares
     */
    function calculateShares(
        address _registry,
        address _pool,
        address _manager,
        bool[2] memory _useTwap,
        uint256 _amount0,
        uint256 _amount1,
        uint256 _totalAmount0,
        uint256 _totalAmount1,
        uint256 _totalShares
    ) public view returns (uint256 share) {

        require(_amount0 > 0 && _amount1 > 0, 'INSUFFICIENT_AMOUNT');

        IUniswapV3Pool pool = IUniswapV3Pool(_pool);
        FeedRegistryInterface registry = FeedRegistryInterface(_registry);

        _amount0 = TwapOracleLibrary.normalise(pool.token0(), _amount0);
        _amount1 = TwapOracleLibrary.normalise(pool.token1(), _amount1);
        _totalAmount0 = TwapOracleLibrary.normalise(pool.token0(), _totalAmount0);
        _totalAmount1 = TwapOracleLibrary.normalise(pool.token1(), _totalAmount1);

        (uint256 token0Price, uint256 token1Price) = _getPrice(pool, registry, _useTwap, _manager);

        if (_totalShares > 0) {
            
            if(_amount0 < _amount1){
                share = FullMath.mulDiv(_amount1, _totalShares, _totalAmount1);
            } else {
                share = FullMath.mulDiv(_amount0, _totalShares, _totalAmount0);
            }

        } else {

            share = ((token0Price.mul(_amount0)).add(token1Price.mul(_amount1)))
                .div(DIVISOR);
        }
    }

    function getOptimalAmounts(
        uint256 _amount0,
        uint256 _amount1,
        uint256 _amount0Min,
        uint256 _amount1Min,
        uint256 _totalAmount0,
        uint256 _totalAmount1
    ) 
        external 
        pure
        returns(
            uint256 amount0,
            uint256 amount1
        )
    {
        require(_amount0 > 0 && _amount1 > 0, 'INSUFFICIENT_AMOUNT');

        if (_totalAmount0 == 0 && _totalAmount1 == 0) {
            (amount0, amount1) = (_amount0, _amount1);
        } else {
            uint amount1Optimal = _amount0.mul(_totalAmount1).div(_totalAmount0);
            if (amount1Optimal <= _amount1) {
                require(amount1Optimal >= _amount1Min, 'INSUFFICIENT_AMOUNT_1');
                (amount0, amount1) = (_amount0, amount1Optimal);
            } else {
                uint amount0Optimal = _amount1.mul(_totalAmount0).div(_totalAmount1);
                assert(amount0Optimal <= _amount0);
                require(amount0Optimal >= _amount0Min, 'INSUFFICIENT_AMOUNT_0');
                (amount0, amount1) = (amount0Optimal, _amount1);
            }
        }

    }

    // to resolve stack too deep error
    function _getPrice(
        IUniswapV3Pool _pool,
        FeedRegistryInterface _registry,
        bool[2] memory _useTwap,
        address _manager
    ) 
        internal 
        view 
        returns (
            uint256 token0Price,
            uint256 token1Price
        )
    {
        // price in USD
        token0Price = TwapOracleLibrary.getPriceInUSD(
            _pool,
            _registry,
            _pool.token0(),
            _useTwap,
            ITwapStrategyManager(_manager)
        );

        token1Price = TwapOracleLibrary.getPriceInUSD(
            _pool,
            _registry,
            _pool.token1(),
            _useTwap,
            ITwapStrategyManager(_manager)
        );
    }
}
