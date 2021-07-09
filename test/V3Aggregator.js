// const { expect } = require("chai");

// const { BigNumber } = require("ethers");
// const { ethers } = require("hardhat");
// const bn = require("bignumber.js");

// bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

// let factory;
// let v3Aggregator;
// let testToken0;
// let testToken1;
// let pool;
// let strategy;
// let owner;
// let tickLower;
// let tickUpper;
// let secondaryTickLower;
// let secondaryTickUpper;

// const amountB = "200000000000000000000000";
// const amountA = "100000000000000000000";

// beforeEach(async function () {
//   [owner] = await ethers.getSigners();

//   const TickMath = await ethers.getContractFactory(
//     "contracts/test/core/libraries/TickMath.sol:TickMath"
//   );

//   const tickMath = await TickMath.deploy();

//   const Factory = await ethers.getContractFactory("UniswapV3Factory", {
//     libraries: {
//       TickMath: tickMath.address,
//     },
//   });

//   factory = await Factory.deploy();

//   // create a pool

//   const TestToken = await ethers.getContractFactory("ERC20");
//   const TestStrategy = await ethers.getContractFactory("TestStrategy");
//   const Aggregator = await ethers.getContractFactory("Aggregator");

//   v3Aggregator = await Aggregator.deploy(owner.address);

//   // deployments
//   testToken0 = await TestToken.deploy(
//     "Test Token 0",
//     "TST0",
//     18,
//     "100000000000000000000000000000",
//     owner.address
//   );

//   testToken1 = await TestToken.deploy(
//     "Test Token 1",
//     "TST1",
//     18,
//     "100000000000000000000000000000",
//     owner.address
//   );

//   await factory.createPool(testToken0.address, testToken1.address, "3000");

//   // initialize the pool
//   const poolAddress = await factory.getPool(
//     testToken0.address,
//     testToken1.address,
//     "3000"
//   );

//   pool = await ethers.getContractAt("UniswapV3Pool", poolAddress);

//   // add initial liquidity to start the pool
//   tickLower = calculateTick(2800, 60);
//   tickUpper = calculateTick(3500, 60);

//   secondaryTickLower = calculateTick(3500, 60);
//   secondaryTickUpper = calculateTick(4000, 60);

//   // console.log(getPriceFromTick(tickLower));
//   // console.log(getPriceFromTick(tickUpper));

//   // deploy strategy contract
//   strategy = await TestStrategy.deploy(
//     "2500",
//     "4500",
//     tickLower,
//     tickUpper,
//     secondaryTickLower,
//     secondaryTickUpper,
//     pool.address,
//     testToken0.address,
//     "0"
//   );

//   let reserve0, reserve1;
//   let ethAddress, daiAddress;

//   // set reserves at ETH price of 3000 DAI per ETh
//   const initialEthReserve = "33333333333333330000";
//   const initialDaiReserve = "100000000000000000000000";

//   reserve0 = initialEthReserve;
//   reserve1 = initialDaiReserve;

//   const sqrtPriceX96 = encodePriceSqrt(reserve0, reserve1);
//   await pool.initialize(sqrtPriceX96);

//   // deploy strategy contract
//   const demoStrategy = await TestStrategy.deploy(
//     "2500",
//     "4500",
//     tickLower,
//     tickUpper,
//     secondaryTickLower,
//     secondaryTickUpper,
//     pool.address,
//     testToken0.address,
//     "0"
//   );

//   const balanceOf0 = await testToken0.balanceOf(owner.address);
//   const balanceOf1 = await testToken1.balanceOf(owner.address);

//   await testToken0.approve(v3Aggregator.address, balanceOf0);
//   await testToken1.approve(v3Aggregator.address, balanceOf1);

//   // add some liquidity to the pool
//   await v3Aggregator.addLiquidity(
//     demoStrategy.address,
//     initialEthReserve,
//     initialDaiReserve,
//     "0",
//     "0"
//   );
// });

// // TODOs
// // Add liquidity from 3 user accounts and check share wise
// // Gas costs for providing liquidity, rebalance and remove liquidity
// // Rebalance with new range orders
// // Rebalance with swap
// // Rebalance with hold
// // Burn liquidity: Full
// // Remove liquidiy from user point of view, remove from limit, range and unused
// // Pachapute's formula testing

// // 2nd
// // Simulate bolingers band on loop

// describe("Aggregator", function () {
//   it("Should add right amount of successfully", async function () {
//     // add liquidity using aggregator contract
//     await v3Aggregator.addLiquidity(
//       strategy.address,
//       amountA,
//       amountB,
//       "0",
//       "0"
//     );

//     const bal0 = await testToken0.balanceOf(pool.address);
//     const bal1 = await testToken1.balanceOf(pool.address);
//     const share = await v3Aggregator.shares(strategy.address, owner.address);
//     const slot0 = await pool.slot0();

//     console.log({
//       tickLower,
//       tickUpper,
//       secondaryTickLower,
//       secondaryTickUpper,
//     });

//     const newTickLower = calculateTick(2900, 60);
//     const newTickUpper = calculateTick(3100, 60);
//     const newSecondaryTickLower = calculateTick(2000, 60);
//     const newSecondaryTickUpper = calculateTick(2900, 60);

//     // await strategy.changeTicks(
//     //   newTickLower,
//     //   newTickUpper,
//     //   newSecondaryTickLower,
//     //   newSecondaryTickUpper,
//     //   0
//     // );

//     await strategy.swapFunds(
//       newTickLower,
//       newTickUpper,
//       "1000000000",
//       10,
//       true
//     );

//     const swapAmount = await strategy.swapAmount();
//     console.log(swapAmount.toString());

//     const tickLower0 = await strategy.tickLower();
//     const tickLower1 = await strategy.tickUpper();

//     console.log(tickLower0, tickLower1);

//     // get contract balance
//     const contractToken0BalBefore = await testToken0.balanceOf(
//       v3Aggregator.address
//     );
//     const contractToken1BalBefore = await testToken1.balanceOf(
//       v3Aggregator.address
//     );

//     await v3Aggregator.rebalance(strategy.address);

//     // get pool addresses
//     const bal0After = await testToken0.balanceOf(pool.address);
//     const bal1After = await testToken1.balanceOf(pool.address);

//     // get contract balance
//     const contractToken0Bal = await testToken0.balanceOf(v3Aggregator.address);
//     const contractToken1Bal = await testToken1.balanceOf(v3Aggregator.address);
//     const unusedAmounts = await v3Aggregator.unused(strategy.address);

//     // await v3Aggregator.removeLiquidity(strategy.address, 1000, 0, 0);

//     console.log({
//       sqrtPriceX96: slot0.sqrtPriceX96.toString(),
//       bal0: bal0.toString(),
//       bal1: bal1.toString(),
//       bal0After: bal0After.toString(),
//       bal1After: bal1After.toString(),
//       share: share.toString(),
//       contractToken0BalBefore: contractToken0BalBefore.toString(),
//       contractToken1BalBefore: contractToken1BalBefore.toString(),
//       contractToken0Bal: contractToken0Bal.toString(),
//       contractToken1Bal: contractToken1Bal.toString(),
//       unusedAmounts: {
//         amount0: unusedAmounts.amount0.toString(),
//         amount1: unusedAmounts.amount1.toString(),
//       },
//     });

//     expect(share).to.equal(1000);
//   });

//   it("Should issue right amount of shares", async function () {
//     // await testToken0.approve(v3Aggregator.address, amountA);
//     // await testToken1.approve(v3Aggregator.address, amountB);
//     // // add liquidity using aggregator contract
//     // await v3Aggregator.addLiquidity(
//     //   strategy.address,
//     //   amountA,
//     //   amountB,
//     //   "0",
//     //   "0"
//     // );
//     // const bal0 = await testToken0.balanceOf(pool.address);
//     // const bal1 = await testToken1.balanceOf(pool.address);
//     // const share = await v3Aggregator.shares(strategy.address, owner.address);
//     // const slot0 = await pool.slot0();
//     // // await strategy.changeTicks(tickLower - 180, tickUpper);
//     // await v3Aggregator.rebalance(strategy.address);
//     // console.log({
//     //   sqrtPriceX96: slot0.sqrtPriceX96.toString(),
//     //   bal0: bal0.toString(),
//     //   bal1: bal1.toString(),
//     //   share: share.toString(),
//     //   remainingAmount0: parseInt(bal0) + 7631345995416115,
//     //   remainingAmount1: parseInt(bal1) + 32658636142600801666,
//     // });
//     // expect(share).to.equal(1000);
//   });

//   it("Should remove the liquidity", async function () {
//     // await testToken0.approve(v3Aggregator.address, amountA);
//     // await testToken1.approve(v3Aggregator.address, amountB);
//     // // add liquidity using aggregator contract
//     // await v3Aggregator.addLiquidity(
//     //   strategy.address,
//     //   amountA,
//     //   amountB,
//     //   "0",
//     //   "0"
//     // );
//     // const newTickLower = calculateTick(3200, 60);
//     // const newTickUpper = calculateTick(4200, 60);
//     // await strategy.changeTicks(newTickLower, newTickUpper);
//     // await v3Aggregator.rebalance(strategy.address, tickLower, tickUpper);
//     // const bal0 = await testToken0.balanceOf(pool.address);
//     // const bal1 = await testToken1.balanceOf(pool.address);
//     // const share = await v3Aggregator.shares(strategy.address, owner.address);
//     // console.log({
//     //   bal0: bal0.toString(),
//     //   bal1: bal1.toString(),
//     //   share: share.toString(),
//     // });
//     // await v3Aggregator.removeLiquidity(strategy.address, 1000, 0, 0);
//     // const bal0 = await testToken0.balanceOf(pool.address);
//     // const bal1 = await testToken1.balanceOf(pool.address);
//     // const share = await v3Aggregator.shares(strategy.address, owner.address);
//     // console.log({
//     //   bal0: bal0.toString(),
//     //   bal1: bal1.toString(),
//     //   share: share.toString(),
//     // });
//   });

//   it("Should rebalance", async function () {
//     // calculate new ticks
//     // const newTickLower = calculateTick(3200, 60);
//     // const newTickUpper = calculateTick(4200, 60);
//     // // add liquidity using aggregator contract
//     // await v3Aggregator.addLiquidity(
//     //   strategy.address,
//     //   amountA,
//     //   amountB,
//     //   "0",
//     //   "0"
//     // );
//     // // change ticks in strategy
//     // await strategy.changeTicks(newTickLower, newTickUpper);
//     // await v3Aggregator.rebalance(strategy.address);
//     // const bal0 = await testToken0.balanceOf(pool.address);
//     // const bal1 = await testToken1.balanceOf(pool.address);
//     // const share = await v3Aggregator.shares(strategy.address, owner.address);
//     // console.log({
//     //   bal0: bal0.toString(),
//     //   bal1: bal1.toString(),
//     //   share: share.toString(),
//     // });
//   });
// });

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
