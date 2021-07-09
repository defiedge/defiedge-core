// const { expect } = require("chai");

// const { BigNumber, utils } = require("ethers");
// const { ethers } = require("hardhat");
// const bn = require("bignumber.js");

// bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

// // TODOs
// // Add liquidity from 3 user accounts and check share wise
// // Gas costs for providing liquidity, rebalance and remove liquidity
// // Rebalance with new range orders
// // Rebalance with swap
// // Rebalance with hold
// // Burn liquidity: Full
// // Remove liquidiy from user point of view, remove from limit, range and unused
// // Pachapute's formula testing
// // total liquidity by adding with new 3 accounts
// // fees earned by strategy
// // rebalance 3 conditions
// // remove and make sure
// // protocol fees

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

// const amountB = "200000000000000000000000";
// const amountA = "100000000000000000000";

// beforeEach(async function () {
//   [owner, userA, userB, userC] = await ethers.getSigners();

//   const TickMath = await ethers.getContractFactory(
//     "contracts/test/core/libraries/TickMath.sol:TickMath"
//   );

//   const tickMath = await TickMath.deploy();

//   const Factory = await ethers.getContractFactory("UniswapV3Factory", {});

//   factory = await Factory.deploy();

//   // create a pool

//   const TestToken = await ethers.getContractFactory("ERC20");
//   TestStrategy = await ethers.getContractFactory("TestStrategy");
//   const Aggregator = await ethers.getContractFactory("Aggregator");

//   aggregator = await Aggregator.deploy(owner.address);

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
//   tickLower = calculateTick(2950, 60);
//   tickUpper = calculateTick(3600, 60);

//   secondaryTickLower = calculateTick(2000, 60);
//   secondaryTickUpper = calculateTick(4000, 60);

//   // console.log(getPriceFromTick(tickLower));
//   // console.log(getPriceFromTick(tickUpper));

//   // deploy strategy contract
//   strategy = await TestStrategy.deploy(
//     tickLower,
//     tickUpper,
//     secondaryTickLower,
//     secondaryTickUpper,
//     pool.address,
//     "0",
//     owner.address,
//     aggregator.address
//   );

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

//   const slot0 = await pool.slot0();

//   console.log({
//     price: slot0.sqrtPriceX96.toString(),
//     tickLower: tickLower,
//     tickUpper: tickUpper,
//   });

//   if (token0AddressFromPool.toLowerCase() == testToken0.address.toLowerCase()) {
//     token0 = testToken0;
//     token1 = testToken1;
//   } else {
//     token1 = testToken0;
//     token0 = testToken1;
//   }

//   // // deploy strategy contract
//   // const demoStrategy = await TestStrategy.deploy(
//   //   tickLower,
//   //   tickUpper,
//   //   secondaryTickLower,
//   //   secondaryTickUpper,
//   //   pool.address,
//   //   "0"
//   // );

//   const balanceOf0 = await token0.balanceOf(owner.address);
//   const balanceOf1 = await token1.balanceOf(owner.address);

//   await token0.approve(aggregator.address, balanceOf0);
//   await token1.approve(aggregator.address, balanceOf1);

//   // add some liquidity to the pool
//   await aggregator.addLiquidity(
//     strategy.address,
//     initialEthReserve,
//     initialDaiReserve,
//     "0",
//     "0"
//   );

//   // // add some liquidity to the pool
//   // await aggregator.addLiquidity(
//   //   demoStrategy.address,
//   //   initialEthReserve,
//   //   initialDaiReserve,
//   //   "0",
//   //   "0"
//   // );
// });

// // 2nd
// // Simulate bolingers band on loop

// describe("Base Functionality", function () {
//   it("Should add and remove liquidity", async function () {
//     await token0
//       .connect(userA)
//       .approve(aggregator.address, "3333333333000000000000000000");
//     await token1
//       .connect(userA)
//       .approve(aggregator.address, "3333333333000000000000000000");

//     // calculate new ticks
//     const newTickLower = calculateTick(2100, 60);
//     const newTickUpper = calculateTick(3200, 60);

//     // launch new strategy
//     const newStrategy = await TestStrategy.deploy(
//       newTickLower,
//       newTickUpper,
//       0,
//       0,
//       pool.address,
//       0,
//       owner.address,
//       aggregator.address
//     );

//     await aggregator
//       .connect(userA)
//       .addLiquidity(
//         newStrategy.address,
//         "5000000000000000000",
//         "60000000000000000000000",
//         "0",
//         "0"
//       );

//     let sharesOfUser;
//     let totalAmount0;
//     let totalAmount1;

//     const strategyData = await aggregator.strategies(newStrategy.address);
//     sharesOfUser = await aggregator.shares(newStrategy.address, userA.address);

//     // values after adding the liquidity
//     console.log({
//       "shares beforee remove 1st liquidity": sharesOfUser.toString(),
//       totalAmount0: strategyData.amount0.toString(),
//       totalAmount1: strategyData.amount1.toString(),
//     });

//     // first remove the liquidity
//     await aggregator
//       .connect(userA)
//       .removeLiquidity(newStrategy.address, toGwei(30000), 0, 0);

//     sharesOfUser = await aggregator.shares(newStrategy.address, userA.address);

//     const rebalanceLowerTick = calculateTick(2700, 60);
//     const rebalanceUpperTick = calculateTick(3200, 60);

//     await newStrategy.changeTicks(
//       rebalanceLowerTick,
//       rebalanceUpperTick,
//       0,
//       0,
//       0
//     );

//     // const rebalanceLowerTick0 = calculateTick(2900, 60);
//     // const rebalanceUpperTick1 = calculateTick(3100, 60);
//     // await newStrategy.changeTicks(
//     //   rebalanceLowerTick0,
//     //   rebalanceUpperTick1,
//     //   0,
//     //   0,
//     //   0
//     // );

//     const unused = await aggregator.unused(newStrategy.address);
//     const balanceOfAggregatorAfterInToken0 = await token0.balanceOf(
//       aggregator.address
//     );
//     const balanceOfAggregatorAfterInToken1 = await token1.balanceOf(
//       aggregator.address
//     );

//     const positionKey = getPositionKey(
//       aggregator.address,
//       rebalanceLowerTick,
//       rebalanceUpperTick
//     );

//     console.log({positionKey})

//     const position = await pool.positions(positionKey);

//     // values after removing shares of the user for first time
//     console.log({
//       position: position,
//       "shares of user before second remove liquidity": sharesOfUser.toString(),
//       unusedAmount0: unused.amount0.toString(),
//       unusedAmount1: unused.amount1.toString(),
//       balanceAmount0: balanceOfAggregatorAfterInToken0.toString(),
//       balanceAmount1: balanceOfAggregatorAfterInToken1.toString(),
//     });

//     await aggregator
//       .connect(userA)
//       .removeLiquidity(newStrategy.address, toGwei(875), 0, 0);

//     // sharesOfUser = await aggregator.shares(strategy.address, userA.address);
//     // console.log(
//     //   "shares of user before first remove liquidity",
//     //   sharesOfUser.toString()
//     // );

//     // const sharesOfUser = await aggregator.shares(
//     //   strategy.address,
//     //   userA.address
//     // );

//     // console.log({
//     //   sharesOfUser: sharesOfUser.toString(),
//     // });
//   });
// });

// // it("Swap and Burn", async function () {
// //   const poolBal0 = await token0.balanceOf(pool.address);
// //   const poolBal1 = await token1.balanceOf(pool.address);

// //   console.log({
// //     poolBal0: poolBal0.toString(),
// //     poolBal1: poolBal1.toString(),
// //   });

// //   await token0
// //     .connect(userA)
// //     .approve(aggregator.address, "3333333333000000000000000000");
// //   await token1
// //     .connect(userA)
// //     .approve(aggregator.address, "3333333333000000000000000000");

// //   await token0
// //     .connect(userB)
// //     .approve(aggregator.address, "3333333333000000000000000000");
// //   await token1
// //     .connect(userB)
// //     .approve(aggregator.address, "3333333333000000000000000000");

// //   await token0
// //     .connect(userC)
// //     .approve(aggregator.address, "3333333333000000000000000000");
// //   await token1
// //     .connect(userC)
// //     .approve(aggregator.address, "3333333333000000000000000000");

// //   console.log({
// //     poolBal0: poolBal0.toString(),
// //     poolBal1: poolBal1.toString(),
// //   });

// //   const newTickLower = calculateTick(2100, 60);
// //   const newTickUpper = calculateTick(3200, 60);

// //   // launch new strategy
// //   const newStrategy = await TestStrategy.deploy(
// //     newTickLower,
// //     newTickUpper,
// //     0,
// //     0,
// //     pool.address,
// //     0
// //   );

// //   await aggregator
// //     .connect(userA)
// //     .addLiquidity(
// //       newStrategy.address,
// //       "5000000000000000000",
// //       "60000000000000000000000",
// //       "0",
// //       "0"
// //     );

// //   const newTick0 = calculateTick(2850, 60);
// //   const newTick1 = calculateTick(4000, 60);

// //   const unused = await aggregator.unused(newStrategy.address);

// //   //   // get swap amount using formula
// //   const swapAmt = calculateSwapAmount(
// //     newTick0,
// //     newTick1,
// //     4230083192099712779,
// //     59999999999999999999996,
// //     0,
// //     0.3
// //   );

// //   console.log({ swapAmt });

// //   // const zeroToOne = await newStrategy.zeroToOne();
// //   // const swapAmount = await newStrategy.swapAmount();
// //   // const sqrtPriceLimitX96 = await newStrategy.sqrtPriceLimitX96();

// //   // console.log({
// //   //   zeroToOne: zeroToOne.toString(),
// //   //   swapAmount: swapAmount.toString(),
// //   //   sqrtPriceLimitX96: sqrtPriceLimitX96.toString()
// //   // })

// //   // await newStrategy.changeTicks(newTick0, newTick1, 0, 0, 0);
// //   // await newStrategy.changeTicks(newTick0, newTick1, 0, 0, 0);
// //   await newStrategy.swapFunds(newTick0, newTick1, swapAmt, "1", false);
// //   await aggregator.rebalance(newStrategy.address);

// //   const balanceOfAggregatorAfterInToken0 = await token0.balanceOf(
// //     aggregator.address
// //   );
// //   const balanceOfAggregatorAfterInToken1 = await token1.balanceOf(
// //     aggregator.address
// //   );

// //   console.log({
// //     balanceOfAggregatorAfterInToken0:
// //       balanceOfAggregatorAfterInToken0.toString(),
// //     balanceOfAggregatorAfterInToken1:
// //       balanceOfAggregatorAfterInToken1.toString(),
// //     unusedAmount0: unused.amount0.toString(),
// //     unusedAmount1: unused.amount1.toString(),
// //   });

// //   it("Mint and Remove Liquidity", async function () {});

// // const swapAmt = calculateSwapAmount(
// //   newTickLower,
// //   newTickUpper,
// //   "9999999999999999999",
// //   "13249651415825697010944",
// //   0,
// //   0.3
// // );

// // await aggregator
// //   .connect(userB)
// //   .addLiquidity(
// //     newStrategy.address,
// //     "10000000000000000000",
// //     "45000000000000000000000",
// //     "0",
// //     "0"
// //   );

// // // console.log("userC is interacting");

// // await aggregator
// //   .connect(userC)
// //   .addLiquidity(
// //     newStrategy.address,
// //     "20000000000000000000",
// //     "30000000000000000000000",
// //     "0",
// //     "0"
// //   );

// // const strategyData = await aggregator.strategies(newStrategy.address);

// // console.log({
// //   strategyData,
// // });

// // const poolBalAfter0 = await token0.balanceOf(pool.address);
// // const poolBalAfter1 = await token1.balanceOf(pool.address);

// // const sharesOfUserA = await aggregator.shares(
// //   newStrategy.address,
// //   userA.address
// // );
// // const sharesOfUserB = await aggregator.shares(
// //   newStrategy.address,
// //   userB.address
// // );
// // const sharesOfUserC = await aggregator.shares(
// //   newStrategy.address,
// //   userC.address
// // );
// // const totalLiquidityOfStrategy = await aggregator.strategies(
// //   newStrategy.address
// // );

// // console.log({
// //   initialTickUpper: newTickLower,
// //   initialTickLower: newTickLower,
// //   totalLiquidityOfStrategy: {
// //     amount0: totalLiquidityOfStrategy.amount0.toString(),
// //     amount1: totalLiquidityOfStrategy.amount1.toString(),
// //   },
// //   sharesOfUserA: sharesOfUserA.toString(),
// //   sharesOfUserB: sharesOfUserB.toString(),
// //   sharesOfUserC: sharesOfUserC.toString(),
// // });

// // await aggregator.connect(userC).removeLiquidity(
// //   newStrategy.address,
// //   "60000000000000000000000",
// //   0,
// //   0
// // )

// // const balanceOfAggregatorAfterInToken0 = await token0.balanceOf(
// //   aggregator.address
// // );
// // const balanceOfAggregatorAfterInToken1 = await token0.balanceOf(
// //   aggregator.address
// // );

// // const getAmountsForLiquidity = await aggregator.getAmountsForLiquidity(
// //   pool.address,
// //   newTickLower,
// //   newTickUpper,
// //   "32208242666285621817165"
// // );

// // console.log({
// //   newTickLower,
// //   newTickUpper,
// //   tickUpper,
// //   tickLower,
// //   // getAmountsForLiquidity: getAmountsForLiquidity.toString(),
// //   poolBalAfter0: poolBalAfter0.toString(),
// //   poolBalAfter1: poolBalAfter1.toString(),
// // });

// // const newStrategyData = await aggregator.strategies(newStrategy.address);

// // console.log({
// //   newStrategyData,
// // });

// // await newStrategy.changeTicks(tickLower, tickUpper, 0, 0, 0);

// // await aggregator.rebalance(newStrategy.address);

// // console.log({
// //   poolBalAfter0: poolBalAfter0.toString(),
// //   poolBalAfter1: poolBalAfter1.toString(),
// //   balanceOfAggregatorAfterInToken0:
// //     balanceOfAggregatorAfterInToken0.toString(),
// //   balanceOfAggregatorAfterInToken1:
// //     balanceOfAggregatorAfterInToken1.toString(),
// // });

// // starts of tests
// // it("Should add liquidity from 3 different accounts", async function () {
// //   await token0
// //     .connect(userA)
// //     .approve(aggregator.address, "3333333333000000000000000000");
// //   await token1
// //     .connect(userA)
// //     .approve(aggregator.address, "3333333333000000000000000000");

// //   await token0
// //     .connect(userB)
// //     .approve(aggregator.address, "3333333333000000000000000000");
// //   await token1
// //     .connect(userB)
// //     .approve(aggregator.address, "3333333333000000000000000000");

// //   await token0
// //     .connect(userC)
// //     .approve(aggregator.address, "3333333333000000000000000000");
// //   await token1
// //     .connect(userC)
// //     .approve(aggregator.address, "3333333333000000000000000000");

// //   // add liquidity from 3 accounts and check if all of them are getting right amount of shares
// //   await aggregator
// //     .connect(userA)
// //     .addLiquidity(
// //       strategy.address,
// //       "10000000000000000000000",
// //       "10000000000000000000000",
// //       "0",
// //       "0"
// //     );

// //   await aggregator
// //     .connect(userB)
// //     .addLiquidity(
// //       strategy.address,
// //       "10000000000000000000000",
// //       "10000000000000000000000",
// //       "0",
// //       "0"
// //     );

// //   const tx = await aggregator
// //     .connect(userC)
// //     .addLiquidity(
// //       strategy.address,
// //       "10000000000000000000000",
// //       "10000000000000000000000",
// //       "0",
// //       "0"
// //     );

// //   const sharesOfA = await aggregator.shares(
// //     strategy.address,
// //     userA.address
// //   );
// //   const sharesOfB = await aggregator.shares(
// //     strategy.address,
// //     userB.address
// //   );
// //   const sharesOfC = await aggregator.shares(
// //     strategy.address,
// //     userC.address
// //   );

// //   expect(parseInt(sharesOfA)).to.equal(1000);
// //   expect(parseInt(sharesOfB)).to.equal(1000);
// //   expect(parseInt(sharesOfC)).to.equal(1000);
// // });

// // it("Should rebalance using new ranges", async function () {
// //   // add liquidity
// //   await aggregator.addLiquidity(
// //     strategy.address,
// //     "10000000000000000000000",
// //     "10000000000000000000000",
// //     "0",
// //     "0"
// //   );

// //   // calculate new ticks
// //   const newTickLower = calculateTick(2100, 60);
// //   const newTickUpper = calculateTick(3100, 60);

// //   // calculate new secondary ticks
// //   const newSecondaryTickLower = 0;
// //   const newSecondaryTickUpper = 0;

// //   // add primary and secondary ticks
// //   await strategy.changeTicks(
// //     newTickLower,
// //     newTickUpper,
// //     newSecondaryTickLower,
// //     newSecondaryTickUpper,
// //     0
// //   );

// //   // rebalance the pool
// //   await aggregator.rebalance(strategy.address);

// //   // get unused tokens
// //   const unused = await aggregator.unused(strategy.address);

// //   const balanceOfContractInToken0 = await token0.balanceOf(
// //     aggregator.address
// //   );
// //   const balanceOfContractInToken1 = await token1.balanceOf(
// //     aggregator.address
// //   );

// //   // console.log({
// //   //   balanceOfContractInToken0: balanceOfContractInToken0.toString(),
// //   //   balanceOfContractInToken1: balanceOfContractInToken1.toString(),
// //   //   unusedAmount0: unused.amount0.toString(),
// //   //   unusedAmount1: unused.amount1.toString()
// //   // })

// //   expect(parseInt(unused.amount0)).to.equal(
// //     parseInt(balanceOfContractInToken0)
// //   );
// //   expect(parseInt(unused.amount1)).to.equal(
// //     parseInt(balanceOfContractInToken1)
// //   );
// // });

// // it("Should rebalance using range and limit orders", async function () {
// //   // Add liquidity, rebalance and calculate
// //   await aggregator.addLiquidity(
// //     strategy.address,
// //     "10000000000000000000000",
// //     "10000000000000000000000",
// //     "0",
// //     "0"
// //   );

// //   // calculate new ticks
// //   const newTickLower = calculateTick(2900, 60);
// //   const newTickUpper = calculateTick(3100, 60);

// //   // calculate new secondary ticks
// //   const newSecondaryTickLower = calculateTick(3100, 60);
// //   const newSecondaryTickUpper = calculateTick(4000, 60);

// //   // add primary and secondary ticks
// //   strategy.changeTicks(
// //     newTickLower,
// //     newTickUpper,
// //     newSecondaryTickLower,
// //     newSecondaryTickUpper,
// //     0
// //   );

// //   // rebalance the pool
// //   await aggregator.rebalance(strategy.address);

// //   const balanceOfContractInToken0 = await token0.balanceOf(
// //     aggregator.address
// //   );
// //   const balanceOfContractInToken1 = await token1.balanceOf(
// //     aggregator.address
// //   );

// //   console.log({
// //     balanceOfContractInToken0,
// //     balanceOfContractInToken0
// //   })

// //   expect(parseInt(balanceOfContractInToken0)).to.equal(0);
// //   expect(parseInt(balanceOfContractInToken1)).to.equal(406);
// // });

// // it("Should remove and hold liquidity", async function () {
// //   // balance of user before adding liquidity
// //   const balanceOfUserBeforeInToken0 = await token0.balanceOf(owner.address);
// //   const balanceOfUserBeforeInToken1 = await token1.balanceOf(owner.address);

// //   const secondStrategy = await TestStrategy.deploy(
// //     tickLower,
// //     tickUpper,
// //     secondaryTickLower,
// //     secondaryTickUpper,
// //     pool.address,
// //     "0"
// //   );

// //   // add liquidity
// //   await aggregator.addLiquidity(
// //     secondStrategy.address,
// //     "10000000000000000000000",
// //     "10000000000000000000000",
// //     "0",
// //     "0"
// //   );

// //   // balance of user after adding liquidity
// //   const balanceOfUserAfterInToken0 = await token0.balanceOf(owner.address);
// //   const balanceOfUserAfterInToken1 = await token1.balanceOf(owner.address);

// //   const differenceToken0 =
// //     balanceOfUserBeforeInToken0 - balanceOfUserAfterInToken0;
// //   const differenceToken1 =
// //     balanceOfUserBeforeInToken1 - balanceOfUserAfterInToken1;

// //   // add primary and secondary ticks
// //   await secondStrategy.holdFunds();

// //   // rebalance the pool
// //   await aggregator.rebalance(secondStrategy.address);

// //   const balanceOfAggregatorAfterInToken0 = await token0.balanceOf(
// //     aggregator.address
// //   );
// //   const balanceOfAggregatorAfterInToken1 = await token1.balanceOf(
// //     aggregator.address
// //   );
// //   // check if unused balances are equal to balances
// //   const unused = await aggregator.unused(strategy.address);

// //   // console.log({
// //   //   balanceOfUserAfterInToken0: balanceOfUserAfterInToken0.toString(),
// //   //   balanceOfUserAfterInToken1: balanceOfUserAfterInToken0.toString(),
// //   //   balanceOfAggregatorAfterInToken0:
// //   //     balanceOfAggregatorAfterInToken0.toString(),
// //   //   balanceOfAggregatorAfterInToken1:
// //   //     balanceOfAggregatorAfterInToken1.toString(),
// //   //   differenceToken0: differenceToken0.toString(),
// //   //   differenceToken1: differenceToken1.toString(),
// //   //   unusedToken0: unused.amount0.toString(),
// //   //   unusedToken1: unused.amount1.toString(),
// //   // });

// //   expect(parseInt(balanceOfAggregatorAfterInToken0)).to.be.closeTo(
// //     parseInt(balanceOfAggregatorAfterInToken0),
// //     parseInt(differenceToken0)
// //   );
// //   expect(parseInt(balanceOfAggregatorAfterInToken1)).to.be.closeTo(
// //     parseInt(balanceOfAggregatorAfterInToken1),
// //     parseInt(differenceToken1)
// //   );
// // });

// // it("Should swap and rebalance", async function () {

// //   console.log("🔥 🔥 🔥 🔥 🔥 🔥 🔥 🔥 🔥 ")
// //   console.log("============ SWAP AND REBALANCE START ==================")

// //   // calculate new ticks
// //   const newTickLower = calculateTick(2800, 60);
// //   const newTickUpper = calculateTick(3300, 60);

// //   // await strategy.changeTicks(newTickLower, newTickUpper, 0, 0, 0);
// //   // await strategy.changeTicks(newTickLower, newTY)
// //   // add liquidity
// //   // Add liquidity, rebalance and calculate
// //   await aggregator.addLiquidity(
// //     strategy.address,
// //     "10000000000000000000",
// //     "30000000000000000000000",
// //     "0",
// //     "0"
// //   );

// //   const balanceOfAggregatorBeforeInToken0 = await token0.balanceOf(
// //     aggregator.address
// //   );
// //   const balanceOfAggregatorBeforeInToken1 = await token1.balanceOf(
// //     aggregator.address
// //   );

// //   console.log({
// //     tickLower,
// //     tickUpper,
// //     balanceOfPoolBeforeInToken0: balanceOfAggregatorBeforeInToken0.toString(),
// //     balanceOfPoolBeforeInToken1: balanceOfAggregatorBeforeInToken1.toString()
// //   })

// //   // // add primary and secondary ticks

// //   // await aggregator.rebalance(strategy.address);

// //   // await aggregator.rebalance(strategy.address);

// //   // console.log({
// //   //   unusedAmount0: unused.amount0.toString(),
// //   //   unusedAmount1: unused.amount1.toString(),
// //   // });

// //   // get swap amount using formula
// //   const swapAmt = calculateSwapAmount(
// //     newTickLower,
// //     newTickUpper,
// //     "9999999999999999999",
// //     "13249651415825697010944",
// //     0,
// //     0.3
// //   );

// //   // // change ticks and rebalance to get amounts
// //   console.log({
// //     storingTickLower: newTickLower,
// //     storingTickUpper: newTickUpper
// //   })
// //   await strategy.swapFunds(newTickLower, newTickUpper, swapAmt, "1", true);
// //   // await strategy.changeTicks(newTickLower, newTickUpper, 0, 0, 0);
// //   await aggregator.rebalance(strategy.address);

// //   console.log("callled rebalance");

// //   const unusedBefore = await aggregator.unused(strategy.address);
// //   const balanceOfToken0Before = await token0.balanceOf(aggregator.address);
// //   const balanceOfToken1Before = await token1.balanceOf(aggregator.address);

// //   console.log({
// //     unused0Before: unusedBefore.amount0.toString(),
// //     unused1Before: unusedBefore.amount1.toString(),
// //     balanceOfToken0Before: balanceOfToken0Before.toString(),
// //     balanceOfToken1Before: balanceOfToken1Before.toString(),
// //   });

// //   // 1. Pool with some liquidity
// //   // 2. Add liquidty using aggregator
// //   // 3. Swap and new rnages
// //   // 4. Rebalance

// //   console.log({ swapAmt });

// //   // swap funds and rebalance with swap amount received from above formula
// //   // await strategy.swapFunds(newTickLower, newTickUpper, "1323301810000000000", "10", true);
// //   // await strategy.changeTicks(tickLower, tickUpper, 0, 0, 0);
// //   // await aggregator.rebalance(strategy.address);

// //   const tickLowerFromStrategy = await strategy.tickLower();
// //   const tickUpperFromStrategy = await strategy.tickUpper();

// //   console.log({
// //     tickLowerFromStrategy: tickLowerFromStrategy.toString(),
// //     tickUpperFromStrategy: tickUpperFromStrategy.toString()
// //   })

// //   // check unused balances, unused amount should be zero
// //   const unused = await aggregator.unused(strategy.address);
// //   const balanceOfToken0After = await token0.balanceOf(aggregator.address);
// //   const balanceOfToken1After = await token1.balanceOf(aggregator.address);

// //   console.log({
// //     unusedAfter0: unused.amount0.toString(),
// //     unusedAfter1: unused.amount1.toString(),
// //     balanceOfToken0After: balanceOfToken0After.toString(),
// //     balanceOfToken1After: balanceOfToken1After.toString(),
// //   });

// //   // const getAmountsForLiquidity = await aggregator.getAmountsForLiquidity(
// //   //   pool.address,
// //   //   newTickLower,
// //   //   newTickUpper,
// //   //   "8965475544520995265371"
// //   // )

// //   // const newSlot0 = await pool.slot0();

// //   // console.log({
// //   //   getAmountsForLiquidity0: getAmountsForLiquidity.amount0.toString(),
// //   //   getAmountsForLiquidity1: getAmountsForLiquidity.amount1.toString(),
// //   //   sqrtRatio: newSlot0.sqrtPriceX96.toString()
// //   // })

// //   console.log("============ SWAP AND REBALANCE END ==================")
// //   console.log("🔥 🔥 🔥 🔥 🔥 🔥 🔥 🔥 🔥 ")

// //   // console.log({
// //   //   balanceOfAggregatorBeforeInToken0:
// //   //     balanceOfAggregatorBeforeInToken0.toString(),
// //   //   balanceOfAggregatorBeforeInToken1:
// //   //     balanceOfAggregatorBeforeInToken1.toString(),
// //   //   balanceOfAggregatorAfterInToken0:
// //   //     balanceOfAggregatorAfterInToken0.toString(),
// //   //   balanceOfAggregatorAfterInToken1:
// //   //     balanceOfAggregatorAfterInToken1.toString(),
// //   // });
// // });

// // it("Should remove liquidity successfully", async function () {
// //   await token0
// //     .connect(userA)
// //     .approve(aggregator.address, "3333333333000000000000000000");
// //   await token1
// //     .connect(userA)
// //     .approve(aggregator.address, "3333333333000000000000000000");

// //   // balance of user after adding liquidity
// //   const balanceOfUserBeforeInToken0 = await token0
// //     .connect(userA)
// //     .balanceOf(userA.address);
// //   const balanceOfUserBeforeInToken1 = await token1
// //     .connect(userA)
// //     .balanceOf(userA.address);

// //   await aggregator
// //     .connect(userA)
// //     .addLiquidity(
// //       strategy.address,
// //       "10000000000000000000000",
// //       "10000000000000000000000",
// //       "0",
// //       "0"
// //     );

// //   // calculate new ticks
// //   const newTickLower = calculateTick(2800, 60);
// //   const newTickUpper = calculateTick(3200, 60);

// //   // add primary and secondary ticks
// //   await strategy.changeTicks(newTickLower, newTickUpper, 0, 0, 0);

// //   // rebalance the pool
// //   await aggregator.rebalance(strategy.address);

// //   // get shares
// //   const shares = await aggregator.shares(strategy.address, userA.address);

// //   // remove liquidity
// //   await aggregator
// //     .connect(userA)
// //     .removeLiquidity(strategy.address, shares, 0, 0);

// //   // balance of user after adding liquidity
// //   const balanceOfUserAfterInToken0 = await token0.balanceOf(userA.address);
// //   const balanceOfUserAfterInToken1 = await token1.balanceOf(userA.address);

// //   // console.log({
// //   //   shares: shares.toString(),
// //   //   balanceOfUserBeforeInToken0: balanceOfUserBeforeInToken0.toString(),
// //   //   balanceOfUserBeforeInToken1: balanceOfUserBeforeInToken1.toString(),
// //   //   balanceOfUserAfterInToken0: balanceOfUserAfterInToken0.toString(),
// //   //   balanceOfUserAfterInToken1: balanceOfUserAfterInToken1.toString()
// //   // });

// //   expect(parseInt(balanceOfUserBeforeInToken0)).to.equal(
// //     parseInt(balanceOfUserAfterInToken0)
// //   );
// //   expect(parseInt(balanceOfUserBeforeInToken1)).to.equal(
// //     parseInt(balanceOfUserAfterInToken1)
// //   );
// // });

// // it("Should remove liquidity when the liquidity is in limit order", async function () {});

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
