// pragma solidity =0.7.6;

// import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
// import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
// import "@openzeppelin/contracts/math/SafeMath.sol";

// import "@uniswap/v3-core/contracts/libraries/FullMath.sol";

// import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";
// import "@uniswap/v3-periphery/contracts/libraries/PositionKey.sol";

// import "@openzeppelin/contracts/math/Math.sol";

// import "../libraries/OracleLibrary.sol";

// /**
//  * Goal is to return price in USD from the TWAP
//  * We can get price of base token from Chainlink, the pool need to have pairs with one of famous tokens
//  * which price we should be able to get into
//  */

// contract UniswapV3Twap {
//     using SafeMath for uint256;
//     uint256 public constant BASE = 1e18;

//     FeedRegistryInterface public chainlinkRegistry;
//     IUniswapV3Pool public pool;
//     address public priceOf;
//     uint256 public period; // TWAP Period

//     /**
//      * @param _registry Chainlink registry
//      * @param _pool Address of the pool
//      * @param _priceOf Currency which price needs to be fetched in USD
//      */
//     constructor(
//         FeedRegistryInterface _registry,
//         address _pool,
//         address _priceOf
//     ) {
//         pool = IUniswapV3Pool(_pool);
//         priceOf = _priceOf;
//         chainlinkRegistry = _registry;
//         period = 1800;
//     }

//     function latestRoundData()
//         public
//         view
//         returns (
//             uint80 roundId,
//             int256 answer,
//             uint256 startedAt,
//             uint256 updatedAt,
//             uint80 answeredInRound
//         )
//     {
//         // price of token0 denominated in token1
//         uint256 price = consult(address(pool), uint32(period));

//         // if priceOf is token1, convert the `price` reverse the price
//         if (priceOf == pool.token1()) {
//             price = 1e36 / price;

//             // if priceOf is token1, multiply the price by chainlink price of token0
//             uint256 token0ChainlinkPrice = OracleLibrary.getPriceInUSD(
//                 chainlinkRegistry,
//                 pool.token0(),
//                 true
//             );

//             // price of token1 in USD
//             answer = int256(price.mul(token0ChainlinkPrice).div(BASE));

//         } else {

//             // if priceOf is token0, multiply the price by chainlink price of token1
//             uint256 token1ChainlinkPrice = OracleLibrary.getPriceInUSD(
//                 chainlinkRegistry,
//                 pool.token1(),
//                 true
//             );

//             // price of token0 in USD
//             answer = int256(price.mul(token1ChainlinkPrice).div(BASE));
//         }
//     }

//     /**
//      * @notice Gets time weighted tick to calculate price
//      * @param _pool Address of the pool
//      * @param _period Seconds to query data from
//      */
//     function getTick(address _pool, uint32 _period)
//         public
//         view
//         returns (int24 timeWeightedAverageTick)
//     {
//         require(_period != 0, "BP");

//         uint32[] memory secondAgos = new uint32[](2);
//         secondAgos[0] = _period;
//         secondAgos[1] = 0;

//         (int56[] memory tickCumulatives, ) = IUniswapV3Pool(_pool).observe(
//             secondAgos
//         );
//         int56 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];

//         timeWeightedAverageTick = int24(tickCumulativesDelta / _period);

//         // Always round to negative infinity
//         if (tickCumulativesDelta < 0 && (tickCumulativesDelta % _period != 0))
//             timeWeightedAverageTick--;
//     }

//     /**
//      * @notice Consults V3 TWAP oracle
//      * @param _pool Address of the pool
//      * @param _period Seconds from which the data needs to be queried
//      * @return price Price of the assets calculated from Uniswap V3 Oracle
//      */
//     function consult(address _pool, uint32 _period)
//         public
//         view
//         returns (uint256 price)
//     {
//         int24 tick = getTick(_pool, _period);

//         uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);

//         uint256 ratioX192 = uint256(sqrtRatioX96).mul(sqrtRatioX96);

//         // return price from TWAP in 1e18
//         price = FullMath.mulDiv(ratioX192, BASE, 1 << 192);
//     }
// }
