//SPDX-License-Identifier: BSL
pragma solidity 0.7.6;
pragma abicoder v2;

// contracts
import "@chainlink/contracts/src/v0.7/Denominations.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";

// libraries
import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";
import "@uniswap/v3-periphery/contracts/libraries/PositionKey.sol";
import "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "../../libraries/CommonMath.sol";

// interfaces
import "@chainlink/contracts/src/v0.7/interfaces/FeedRegistryInterface.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "../../twap/interfaces/ITwapStrategyFactory.sol";
import "../../twap/interfaces/ITwapStrategyManager.sol";
import "../../interfaces/IERC20Minimal.sol";

import "hardhat/console.sol";


contract TwapOracleLibraryTest {
    uint256 public constant BASE = 1e18;

    using SafeMath for uint256;

    function normalise(address _token, uint256 _amount)
        public
        view
        returns (uint256 normalised)
    {
        // return uint256(_amount) * (10**(18 - IERC20Minimal(_token).decimals()));
        normalised = _amount;
        uint256 _decimals = IERC20Minimal(_token).decimals();

        if (_decimals < 18) {
            uint256 missingDecimals = uint256(18).sub(_decimals);
            normalised = uint256(_amount).mul(10**(missingDecimals));
        } else if (_decimals > 18) {
            uint256 extraDecimals = _decimals.sub(uint256(18));
            normalised = uint256(_amount).div(10**(extraDecimals));
        }
    }

    /**
     * @notice Gets latest Uniswap price in the pool, price of token1 represented in token0
     * @notice pool Address of the Uniswap V3 pool
     */
    function getUniswapPrice(address pool)
        public
        view
        returns (uint256 price)
    {
        IUniswapV3Pool _pool = IUniswapV3Pool(pool);

        (uint160 sqrtPriceX96, , , , , , ) = _pool.slot0();
        uint256 priceX192 = uint256(sqrtPriceX96).mul(sqrtPriceX96);
        price = FullMath.mulDiv(priceX192, BASE, 1 << 192);

        uint256 token0Decimals = IERC20Minimal(_pool.token0()).decimals();
        uint256 token1Decimals = IERC20Minimal(_pool.token1()).decimals();

        bool decimalCheck = token0Decimals > token1Decimals;

        uint256 decimalsDelta = decimalCheck
            ? token0Decimals - token1Decimals
            : token1Decimals - token0Decimals;

        // normalise the price to 18 decimals

        if (token0Decimals == token1Decimals) {
            return price;
        }

        if (decimalCheck) {
            price = price.mul(CommonMath.safePower(10, decimalsDelta));
        } else {
            price = price.div(CommonMath.safePower(10, decimalsDelta));
        }
    }

    /**
     * @notice Returns latest Chainlink price, and normalise it
     * @param registry registry
     * @param _base Base Asset
     * @param _quote Quote Asset
     */
    function getChainlinkPrice(
        address registry,
        address _base,
        address _quote,
        uint256 _validPeriod
    ) public view returns (uint256 price) {

        FeedRegistryInterface _registry = FeedRegistryInterface(registry);

        (, int256 _price, , uint256 updatedAt, ) = _registry.latestRoundData(_base, _quote);
        
        require(block.timestamp.sub(updatedAt) < _validPeriod, "OLD_PRICE");

        if (_price <= 0) {
            return 0;
        }

        // normalise the price to 18 decimals
        uint256 _decimals = _registry.decimals(_base, _quote);

        if (_decimals < 18) {
            uint256 missingDecimals = uint256(18).sub(_decimals);
            price = uint256(_price).mul(10**(missingDecimals));
        } else if (_decimals > 18) {
            uint256 extraDecimals = _decimals.sub(uint256(18));
            price = uint256(_price).div(10**(extraDecimals));
        }

        return price;
    }

    /**
     * @notice Gets latest Uniswap price in the pool, price of _token represented in USD
     * @param pool Address of the Uniswap V3 pool
     * @param registry Interface of the Chainlink registry
     * @param _priceOf the token we want to convert into USD
     */
    function getPriceInUSD(
        address factory,
        address pool,
        address registry,
        address _priceOf,
        bool[2] memory _useTwap,
        address _manager
    )
        public
        view
        returns (
            uint256 price
        )
    {

        IUniswapV3Pool _pool = IUniswapV3Pool(pool);
        ITwapStrategyFactory _factory = ITwapStrategyFactory(factory);
        uint256 _period = ITwapStrategyManager(_manager).twapPricePeriod();

        // price of token0 denominated in token1
        uint256 _price = consult(address(_pool), uint32(_period)); // 1 token0 = _price token1

        if(_useTwap[0]){
            // token0 - twap , token1 - chainlink
            uint256 token1ChainlinkPrice = getChainlinkPrice(registry, _pool.token1(), Denominations.USD, _factory.getHeartBeat(_pool.token1(), Denominations.USD));

            if (_priceOf == _pool.token1()) {
                price = token1ChainlinkPrice;
            } else {
                price = _price.mul(token1ChainlinkPrice).div(BASE);
            }


        } else {
            // token0 - chainlink , token1 - twap

            uint256 token0ChainlinkPrice = getChainlinkPrice(registry, _pool.token0(), Denominations.USD, _factory.getHeartBeat(_pool.token0(), Denominations.USD));

            if (_priceOf == _pool.token0()) {
                price = token0ChainlinkPrice;
            } else {
                _price = 1e36 / _price;
                price = _price.mul(token0ChainlinkPrice).div(BASE);
            }

        }
    }

    /**
     * @notice Checks the if swap exceed allowed swap deviation or not
     * @param pool Address of the pool
     * @param registry Chainlink registry interface
     * @param _amountIn Amount to be swapped
     * @param _amountOut Amount received after swap
     * @param _tokenIn Token to be swapped
     * @param _tokenOut Token to which tokenIn should be swapped
     * @param _manager Manager contract address to check allowed deviation
     */
    function isSwapExceedDeviation(
        address factory,
        address pool,
        address registry,
        uint256 _amountIn,
        uint256 _amountOut,
        address _tokenIn,
        address _tokenOut,
        address _manager,
        bool[2] memory _useTwap
    ) public view returns (bool) {
        IUniswapV3Pool _pool = IUniswapV3Pool(pool);

        _amountIn = normalise(_tokenIn, _amountIn);
        _amountOut = normalise(_tokenOut, _amountOut);


        if(_pool.token0() == _tokenIn) {
            _useTwap = [_useTwap[0], _useTwap[1]]; 
        } else {
            _useTwap = [_useTwap[1], _useTwap[0]];
        }

        // get tokenIn prce in USD fron chainlink
        uint256 amountInUSD = _amountIn.mul(
            getPriceInUSD(factory, pool, registry, _tokenIn, _useTwap, _manager)
        );

        // get tokenout prce in USD fron chainlink
        uint256 amountOutUSD = _amountOut.mul(
            getPriceInUSD(factory, pool, registry, _tokenOut, _useTwap, _manager)
        );

        uint256 diff;

        diff = amountInUSD.div(amountOutUSD.div(BASE));

        // check price deviation
        uint256 deviation;
        if (diff > BASE) {
            deviation = diff.sub(BASE);
        } else {
            deviation = BASE.sub(diff);
        }

        if (deviation > ITwapStrategyManager(_manager).allowedSwapDeviation()) {
            return true;
        }
        return false;
    }

    /**
     * @notice Checks for price slippage at the time of swap
     * @param pool Address of the pool
     * @param factory Address of the DefiEdge strategy factory
     * @param _amountIn Amount to be swapped
     * @param _amountOut Amount received after swap
     * @param _tokenIn Token to be swapped
     * @param _tokenOut Token to which tokenIn should be swapped
     * @return true if the swap is allowed, else false
     */
    function allowSwap(
        address pool,
        address factory,
        uint256 _amountIn,
        uint256 _amountOut,
        address _tokenIn,
        address _tokenOut,
        address _manager,
        bool[2] memory _useTwap
    ) public view returns (bool) {
        IUniswapV3Pool _pool = IUniswapV3Pool(pool);
        ITwapStrategyFactory _factory = ITwapStrategyFactory(factory);

        _amountIn = normalise(_tokenIn, _amountIn);
        _amountOut = normalise(_tokenOut, _amountOut);

        if(_pool.token0() == _tokenIn) {
            _useTwap = [_useTwap[0], _useTwap[1]]; 
        } else {
            _useTwap = [_useTwap[1], _useTwap[0]];
        }

        // get price of _tokenIn in USD
        uint256 amountInUSD = _amountIn.mul(
            getPriceInUSD(
                factory,
                pool,
                address(_factory.chainlinkRegistry()),
                _tokenIn,
                _useTwap,
                _manager
            )
        );

        // get price of _tokenOut in USD
        uint256 amountOutUSD = _amountOut.mul(
            getPriceInUSD(
                factory,
                pool,
                address(_factory.chainlinkRegistry()),
                _tokenOut,
                _useTwap,
                _manager
            )
        );

        uint256 diff;

        diff = amountInUSD.div(amountOutUSD.div(BASE));

        uint256 _allowedSlippage = _factory.allowedSlippage();
        // check if the price is above deviation
        if (
            diff > (BASE.add(_allowedSlippage)) ||
            diff < (BASE.sub(_allowedSlippage))
        ) {
            return false;
        }

        return true;
    }


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

        // Calculate price with better precision if it doesn't overflow when multiplied by itself
        if (sqrtRatioX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtRatioX96).mul(sqrtRatioX96);
            price = FullMath.mulDiv(ratioX192, BASE, 1 << 192);
        } else {
            uint256 ratioX128 = FullMath.mulDiv(sqrtRatioX96, sqrtRatioX96, 1 << 64);
            price = FullMath.mulDiv(ratioX128, BASE, 1 << 128);
        }

        uint256 token0Decimals = IERC20Minimal(IUniswapV3Pool(_pool).token0()).decimals();
        uint256 token1Decimals = IERC20Minimal(IUniswapV3Pool(_pool).token1()).decimals();

        bool decimalCheck = token0Decimals > token1Decimals;

        uint256 decimalsDelta = decimalCheck
            ? token0Decimals - token1Decimals
            : token1Decimals - token0Decimals;

        // normalise the price to 18 decimals
        if (token0Decimals == token1Decimals) {
            return price;
        }

        if (decimalCheck) {
            price = price.mul(CommonMath.safePower(10, decimalsDelta));
        } else {
            price = price.div(CommonMath.safePower(10, decimalsDelta));
        }
    }
}
