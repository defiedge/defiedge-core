// const { expect } = require("chai");

// const { BigNumber, utils } = require("ethers");
// const { ethers } = require("hardhat");
// const bn = require("bignumber.js");

// bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

// let factory;
// let aggregator;
// let token0;
// let token1;
// let pool;
// let strategy;
// let owner;
// let userA;
// let userB;
// let userC;
// let tickLower;
// let tickUpper;
// let secondaryTickLower;
// let secondaryTickUpper;
// let TestStrategy;
// let strategyFactory;

// const amountB = "200000000000000000000000";
// const amountA = "100000000000000000000";

// beforeEach(async function () {
//   [owner, userA, userB, userC] = await ethers.getSigners();

//   //   const TickMath = await ethers.getContractFactory(
//   //     "contracts/test/core/libraries/TickMath.sol:TickMath"
//   //   );
//   //   const tickMath = await TickMath.deploy();

//   const Factory = await ethers.getContractFactory("UniswapV3Factory");
//   const StrategyFactory = await ethers.getContractFactory("StrategyFactory");

//   factory = await Factory.deploy();

//   // create a pool
//   const TestToken = await ethers.getContractFactory("ERC20");
//   const TestStrategy = await ethers.getContractFactory("DefiEdgeStrategy");
//   const Aggregator = await ethers.getContractFactory("Aggregator");

//   aggregator = await Aggregator.deploy(owner.address);
//   strategyFactory = await StrategyFactory.deploy(aggregator.address);

//   // deployments
//   const testToken0 = await TestToken.deploy(
//     "Test Token 0",
//     "TST0",
//     18,
//     "100000000000000000000000000000",
//     owner.address
//   );

//   const testToken1 = await TestToken.deploy(
//     "Test Token 1",
//     "TST1",
//     18,
//     "100000000000000000000000000000",
//     owner.address
//   );

//   // trasfer tokens to userA
//   testToken0.transfer(userA.address, "3333333333000000000000000000");
//   testToken1.transfer(userA.address, "3333333333000000000000000000");

//   // transfer tokens to userB
//   testToken0.transfer(userB.address, "3333333333000000000000000000");
//   testToken1.transfer(userB.address, "3333333333000000000000000000");

//   // transfer tokens to userC
//   testToken0.transfer(userC.address, "3333333333000000000000000000");
//   testToken1.transfer(userC.address, "3333333333000000000000000000");

//   await factory.createPool(testToken0.address, testToken1.address, "3000");

//   // initialize the pool
//   const poolAddress = await factory.getPool(
//     testToken0.address,
//     testToken1.address,
//     "3000"
//   );

//   pool = await ethers.getContractAt("UniswapV3Pool", poolAddress);

//   // add initial liquidity to start the pool
//   tickLower = calculateTick(2500, 60);
//   tickUpper = calculateTick(3500, 60);

//   secondaryTickLower = calculateTick(2700, 60);
//   secondaryTickUpper = calculateTick(3300, 60);

//   // deploy strategy contract
//   strategy = await TestStrategy.deploy(
//     aggregator.address,
//     pool.address,
//     owner.address
//   );

//   // intialize the strategy
//   await strategy.initialize([[0, 0, tickLower, tickUpper]]);

//   let reserve0, reserve1;
//   let ethAddress, daiAddress;

//   // set reserves at ETH price of 3000 DAI per ETh
//   const initialEthReserve = "500000000000000000000000";
//   const initialDaiReserve = "1500000000000000000000000000";

//   reserve0 = initialEthReserve;
//   reserve1 = initialDaiReserve;

//   const sqrtPriceX96 = encodePriceSqrt(reserve0, reserve1);
//   await pool.initialize(sqrtPriceX96);

//   const token0AddressFromPool = await pool.token0();

//   if (token0AddressFromPool.toLowerCase() == testToken0.address.toLowerCase()) {
//     token0 = testToken0;
//     token1 = testToken1;
//   } else {
//     token1 = testToken0;
//     token0 = testToken1;
//   }

//   const balanceOf0 = await token0.balanceOf(owner.address);
//   const balanceOf1 = await token1.balanceOf(owner.address);

//   await token0.approve(aggregator.address, balanceOf0);
//   await token1.approve(aggregator.address, balanceOf1);

//   const tick = await aggregator.getTicks(strategy.address);
//   console.log(tick);

//   // add some liquidity to the pool
//   await aggregator.addLiquidity(
//     strategy.address,
//     initialEthReserve,
//     initialDaiReserve,
//     "0",
//     "0",
//     0
//   );
// });

// describe("Add Liquidity", function () {
//   it("should add liquidity in the current primary ranges", async function () {});
// });

// // describe("Remove Liquidity", function () {
// //   beforeEach(async function () {});
// //   it("should be able to remove whole liquidity", async function () {
// //     const shares = await aggregator.shares(strategy.address, owner.address);
// //     await aggregator.removeLiquidity(strategy.address, shares, 0, 0);
// //   });
// // });

// describe("Factory Test", function () {
//   it("should deploy the strategy from factory and add liquidity", async function () {
//     console.log("owner address from test script", owner.address);

//     await strategyFactory.createStrategy(pool.address, owner.address);

//     const strategy0 = await ethers.getContractAt(
//       "DefiEdgeStrategy",
//       "0x553bed26a78b94862e53945941e4ad6e4f2497da"
//     );

//     // console.log("strategy fee", await strategy0.fee());

//     // await strategy0.initialize([[0, 0, tickLower, tickUpper]]);

//     await aggregator.addLiquidity(
//       strategy.address,
//       "100000000000000000000",
//       "100000000000000000000",
//       0,
//       0,
//       0
//     );

//     const swapAmt = ethers.BigNumber.from(100000000000000);
//     const sqrtPriceLimitX96 = ethers.BigNumber.from(1000000);
//     const allowedPriceSlippage = ethers.BigNumber.from(1000000);
//     const amount0 = ethers.BigNumber.from(toGwei(0.010156660656490624));
//     const amount1 = ethers.BigNumber.from(toGwei(10));

//     await strategy
//       .connect(owner)
//       .swapAndRebalance(swapAmt, sqrtPriceLimitX96, allowedPriceSlippage, true, [
//         [amount0, amount1, secondaryTickLower, secondaryTickUpper],
//       ]);

//     console.log("====== final add liquidity =====");

//     await aggregator.addLiquidity(
//       strategy.address,
//       "100000000000000000000",
//       "100000000000000000000",
//       0,
//       0,
//       0
//     );

//     await strategy
//       .connect(owner)
//       .changeTicksAndRebalance([
//         [amount0, amount1, tickLower, tickUpper],
//         [amount0, amount1, secondaryTickLower, secondaryTickUpper],
//       ]);
//   });
// });

// describe("Rebalance", function () {
//   beforeEach(async function () {});
//   it("should rebalance using normal range order and store unused", async function () {
//     const liquidityInRange = await aggregator.getTicks(strategy.address);
//     console.log(liquidityInRange);

//     // change the ticks
//     await strategy.changeTicksAndRebalance([
//       [
//         toGwei(226173.97000201),
//         toGwei(750000050),
//         secondaryTickLower,
//         secondaryTickUpper,
//       ],
//     ]);
//   });

//   it("should swap and rebalance", async function () {
//     aggregator.addLiquidity(
//       strategy.address,
//       "100000000000000000000",
//       "100000000000000000000",
//       0,
//       0,
//       0
//     );

//     // // change the ticks
//     // await strategy.changeTicksAndRebalance([
//     //   [
//     //     toGwei(226173.97000201),
//     //     toGwei(750000050),
//     //     secondaryTickLower,
//     //     secondaryTickUpper,
//     //   ],
//     //   [toGwei(226173.97000201), toGwei(750000050), tickLower, tickUpper],
//     // ]);

//     // // // change the ticks
//     // await strategy.changeTicksAndRebalance([
//     //   [
//     //     toGwei(226173.97000201),
//     //     toGwei(750000050),
//     //     secondaryTickLower,
//     //     secondaryTickUpper,
//     //   ],
//     //   [toGwei(226173.97000201), toGwei(750000050), tickLower, tickUpper],
//     // ]);

//     // await strategy.swapAndRebalance(
//     //   ethers.utils.BigNumber.from("1000000000000000000"),
//     //   ethers.utils.BigNumber.from("10000000"),
//     //   ethers.utils.BigNumber.from("10000000"),
//     //   [
//     //     "1000000000000000000",
//     //     "1000000000000000000",
//     //     secondaryTickLower,
//     //     secondaryTickUpper,
//     //   ]
//     // );
//   });
// });

// function getPositionKey(address, lowerTick, upperTick) {
//   return utils.keccak256(
//     utils.solidityPack(
//       ["address", "int24", "int24"],
//       [address, lowerTick, upperTick]
//     )
//   );
// }

// function calculateSwapAmount(_tickLower, _tickUpper, _amount0, _amount1, _fee) {
//   const currentPrice = 3006.003;
//   const range0 = 1.0001 ** _tickLower;
//   const range1 = 1.0001 ** _tickUpper;
//   const fee = 0.3;
//   const sqrtP = Math.sqrt(currentPrice);
//   let sellAmt;

//   const numerator = sqrtP * (sqrtP - Math.sqrt(range0));
//   const denominator = 1 - Math.sqrt(currentPrice / range1);
//   const ratio = numerator / denominator;

//   console.log({
//     currentPrice,
//     range0,
//     range1,
//     fee,
//     sqrtP,
//     ratio,
//     _amount0,
//     _amount1,
//   });

//   let num, deno;

//   if (_amount1 / _amount0 < ratio) {
//     num = ratio * _amount0 - _amount1;
//     deno = ratio + currentPrice * (1 - _fee);
//     sellAmt = num / deno;
//     // sell ETh
//   } else {
//     num = _amount1 - ratio * _amount0;
//     deno = 1 + (ratio * (1 - fee)) / currentPrice;

//     sellAmt = num / deno;
//     // sell DAI
//   }
//   // sellAmt = toGwei(sellAmt * 1e18);
//   return toGwei(sellAmt).toString();
// }

// // test TODOs:
// // 1. Check protocol fees and strategy fees

// function encodePriceSqrt(reserve0, reserve1) {
//   return BigNumber.from(
//     new bn(reserve1.toString())
//       .div(reserve0.toString())
//       .sqrt()
//       .multipliedBy(new bn(2).pow(96))
//       .integerValue(3)
//       .toString()
//   );
// }

// function toGwei(_number) {
//   return (_number * 1e18).toLocaleString("fullwide", { useGrouping: false }); // returns "4000000000000000000000000000"
// }

// function calculateTick(price, tickSpacing) {
//   const logTick = 46054 * Math.log10(Math.sqrt(price));
//   return parseInt(logTick) + tickSpacing - (parseInt(logTick) % tickSpacing);
// }

// function expandTo18Decimals(number) {
//   return BigNumber.from(number).mul(BigNumber.from(10).pow(18));
// }

// function getPriceFromTick(tick) {
//   return 1.0001 ** tick;
// }
