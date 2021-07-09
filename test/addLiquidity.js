// const { expect } = require("chai");

// const { BigNumber, utils } = require("ethers");

// const {
//   encodePriceSqrt,
//   toGwei,
//   calculateTick,
//   getPriceFromTick,
// } = require("./utils/");

// let UniswapV3Factory;
// let StrategyFactory;
// let TestToken;
// let DefiEdgeStrategy;
// let Aggregator;

// // import artifacts
// async function loadContracts() {
//   UniswapV3Factory = await ethers.getContractFactory("UniswapV3Factory");
//   StrategyFactory = await ethers.getContractFactory("StrategyFactory");
//   TestToken = await ethers.getContractFactory("ERC20");
//   DefiEdgeStrategy = await ethers.getContractFactory("DefiEdgeStrategy");
//   Aggregator = await ethers.getContractFactory("Aggregator");
// }

// let token0;
// let token1;
// let owner;
// let uniswapFactory;
// let aggregator;
// let strategy0;
// let strategy1;

// let tickLower;
// let tickUpper;
// let secondaryTickLower;
// let secondaryTickUpper;

// beforeEach(async () => {
//   [owner] = await ethers.getSigners();

//   await loadContracts();
//   await deployTestTokens();

//   // create and initialize the pool
//   uniswapFactory = await UniswapV3Factory.deploy();
//   await uniswapFactory.createPool(token0.address, token1.address, "3000");
//   const poolAddress = await uniswapFactory.getPool(
//     token0.address,
//     token1.address,
//     "3000"
//   );
//   pool = await ethers.getContractAt("UniswapV3Pool", poolAddress);
//   await pool.initialize(
//     encodePriceSqrt("500000000000000000000000", "1500000000000000000000000000")
//   );

//   // set token0 and token1 accordinfg to the pool
//   if (token1.address < token0.address) {
//     token0 = token1;
//     token1 = token0;
//   }

//   // deploy aggregator contract
//   aggregator = await Aggregator.deploy(owner.address);

//   // add some liquidity in the pool
//   // deploy strategy contract
//   strategy0 = await DefiEdgeStrategy.deploy(
//     aggregator.address,
//     pool.address,
//     owner.address
//   );

//   // add initial liquidity to start the pool
//   tickLower = calculateTick(2500, 60);
//   tickUpper = calculateTick(3500, 60);
//   secondaryTickLower = calculateTick(2700, 60);
//   secondaryTickUpper = calculateTick(3300, 60);

//   await strategy0.initialize([[0, 0, tickLower, tickUpper]]);

//   // approve tokens for aggregator
//   // approve tokens for aggregator
//   await token0.approve(
//     aggregator.address,
//     await token0.balanceOf(owner.address)
//   );
//   await token1.approve(
//     aggregator.address,
//     await token1.balanceOf(owner.address)
//   );
//   // add some liquiditu
//   await aggregator.addLiquidity(
//     strategy0.address,
//     "500000000000000000000000",
//     "1500000000000000000000000000",
//     0,
//     0,
//     0
//   );
// });

// describe("Success Cases", function () {});

// describe("Revert Cases", function () {});

// // deploy test tokens
// async function deployTestTokens() {
//   token0 = await TestToken.deploy(
//     "tstToken",
//     "TST0",
//     18,
//     "100000000000000000000000000000",
//     owner.address
//   );

//   token1 = await TestToken.deploy(
//     "tstToken",
//     "TST0",
//     18,
//     "100000000000000000000000000000",
//     owner.address
//   );
// }

// async function deployStrategy() {}
