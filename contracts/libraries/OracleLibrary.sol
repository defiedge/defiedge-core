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

// interfaces
import "@chainlink/contracts/src/v0.7/interfaces/FeedRegistryInterface.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "../interfaces/IStrategyFactory.sol";

interface IERC20Minimal {
    function decimals() external view returns (uint256);
}

library OracleLibrary {
    uint256 public constant BASE = 1e18;

    using SafeMath for uint256;

    /**
     * @notice Gets latest Uniswap price in the pool
     * @notice _pool Address of the Uniswap V3 pool
     */
    function getUniswapPrice(address _pool)
        public
        view
        returns (uint256 price)
    {
        IUniswapV3Pool pool = IUniswapV3Pool(_pool);

        (uint160 sqrtPriceX96, , , , , , ) = pool.slot0();
        uint256 priceX192 = uint256(sqrtPriceX96).mul(sqrtPriceX96);
        price = FullMath.mulDiv(priceX192, BASE, 1 << 192);

        uint256 token0Decimals = 18 - IERC20Minimal(pool.token0()).decimals();
        uint256 token1Decimals = 18 - IERC20Minimal(pool.token1()).decimals();

        uint256 decimalsDelta = token0Decimals >= token1Decimals
            ? token0Decimals - token1Decimals
            : token1Decimals - token0Decimals;

        // normalise the price to 18 decimals
        if(token0Decimals >= token1Decimals){
            price = price.mul(10**(decimalsDelta));
        } else {
            price = price.div(10**(decimalsDelta));
        }        

    }

    /**
     * @notice Returns latest Chainlink price, and normalise it
     * @param _registry registry
     * @param _base Base Asset
     * @param _quote Quote Asset
     */
    function getChainlinkPrice(
        address _registry,
        address _base,
        address _quote
    ) public view returns (uint256 price) {
        FeedRegistryInterface registry = FeedRegistryInterface(_registry);
        (, int256 _price, , , ) = registry.latestRoundData(_base, _quote);

        // normalise the price to 18 decimals
        price = uint256(_price) * (10**(18 - registry.decimals(_base, _quote)));

        return price;
    }

    /**
     * @notice Gets price in USD, if USD feed is not available use ETH feed
     * @param _registry Address of the Chainlink registry
     * @param _token the token we want to convert into USD
     * @param _isBase if the token supports base as USD or requires conversion from ETH
     */
    function getPriceInUSD(
        address _registry,
        address _token,
        bool _isBase
    ) public view returns (uint256 price) {
        if (_isBase) {
            price = getChainlinkPrice(_registry, _token, Denominations.USD);
        } else {
            price = getChainlinkPrice(_registry, _token, Denominations.ETH);
            price = price
                .mul(
                    getChainlinkPrice(
                        _registry,
                        Denominations.ETH,
                        Denominations.USD
                    )
                )
                .div(BASE);
        }
    }

    /**
     * @notice Checks if the the current price has deviation from the pool price
     * @param _pool Address of the pool
     * @param _registry Chainlink registry
     * @param _usdAsBase checks if pegged to USD
     * @param _allowedDeviation Allowed deviation for the pool
     */
    function hasDeviation(
        address _pool,
        address _registry,
        bool[] memory _usdAsBase,
        uint256 _allowedDeviation
    ) public view returns (bool) {
        IUniswapV3Pool pool = IUniswapV3Pool(_pool);

        // get price of token0 Uniswap and convert it to USD
        uint256 uniswapPriceInUSD = getUniswapPrice(_pool)
            .mul(getPriceInUSD(_registry, pool.token1(), _usdAsBase[1]))
            .div(BASE);

        // get price of token0 from Chainlink in USD
        uint256 chainlinkPriceInUSD = getPriceInUSD(
            _registry,
            pool.token0(),
            _usdAsBase[0]
        );

        uint256 diff;

        diff = uniswapPriceInUSD.mul(BASE).div(chainlinkPriceInUSD);

        // check if the price is above deviation
        if (
            diff > (BASE.add(_allowedDeviation)) ||
            diff < (BASE.sub(_allowedDeviation))
        ) {
            return true;
        }

        return false;
    }

    /**
     * @notice Checks for price slippage at the time of swap
     * @param _factory Address of the DefiEdge strategy factory
     * @param _amountIn Amount to be swapped
     * @param _amountOut Amount received after swap
     * @param _tokenIn Token to be swapped
     * @param _tokenOut Token to which tokenIn should be swapped
     * @return true if the swap is allowed, else false
     */
    function allowSwap(
        address _factory,
        uint256 _amountIn,
        uint256 _amountOut,
        address _tokenIn,
        address _tokenOut,
        bool[2] memory _isBase
    ) public view returns (bool) {
        IStrategyFactory factory = IStrategyFactory(_factory);

        uint256 amountInUSD = _amountIn.mul(
            getPriceInUSD(factory.chainlinkRegistry(), _tokenIn, _isBase[0])
        );
        uint256 amountOutUSD = _amountOut.mul(
            getPriceInUSD(factory.chainlinkRegistry(), _tokenOut, _isBase[1])
        );

        uint256 diff;

        diff = amountInUSD.mul(BASE).div(amountOutUSD);

        // check if the price is above deviation
        if (
            diff > (BASE.add(factory.allowedSlippage())) ||
            diff < (BASE.sub(factory.allowedSlippage()))
        ) {
            return false;
        }

        return true;
    }
}
