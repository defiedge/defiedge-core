const { expect } = require("chai");

const { BigNumber, utils } = require("ethers");

const { ethers } = require("hardhat");
// const { pool } = require("../scripts/config");

const {
  encodePriceSqrt,
  toGwei,
  calculateTick,
  getPriceFromTick,
} = require("./utils");

let UniswapV3Factory;
let StrategyFactory;
let TestToken;
let DefiEdgeStrategy;
let Aggregator;
let SwapRouter;

let userA;
let userB;

let feeTo;

let LiquidityHelper;

// import artifacts
async function loadContracts() {
  UniswapV3Factory = await ethers.getContractFactory("UniswapV3Factory");
  StrategyFactory = await ethers.getContractFactory("StrategyFactory");
  TestToken = await ethers.getContractFactory("ERC20");
  DefiEdgeStrategy = await ethers.getContractFactory("DefiEdgeStrategy");
  Aggregator = await ethers.getContractFactory("Aggregator");
  LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");
  SwapRouter = await ethers.getContractFactory("TestSwap");
}

let token0;
let token1;
let weth9;
let owner;
let uniswapFactory;
let aggregator;
let strategy0;
let strategy1;

let tickLower;
let tickUpper;
let secondaryTickLower;
let secondaryTickUpper;
let swapRouter;

beforeEach(async () => {
  [owner, userA, userB, feeTo] = await ethers.getSigners();
  await loadContracts();
  await deployTestTokens();
  // create and initialize the pool
  uniswapFactory = await UniswapV3Factory.deploy();
  await uniswapFactory.createPool(token0.address, token1.address, "3000");
  const poolAddress = await uniswapFactory.getPool(
    token0.address,
    token1.address,
    "3000"
  );
  console.log("pool address from the script", poolAddress);
  pool = await ethers.getContractAt("UniswapV3Pool", poolAddress);
  let sqrtPriceX96 = encodePriceSqrt("500000", "1500000000");
  sqrtPriceX96 = sqrtPriceX96.toLocaleString("fullwide", {
    useGrouping: false,
  });
  await pool.initialize(sqrtPriceX96);
  // set token0 and token1 accordinfg to the pool
  if (token1.address < token0.address) {
    const oldToken0 = token0;
    const oldToken1 = token1;
    token0 = oldToken1;
    token1 = oldToken0;
  }
  // deploy aggregator contract
  aggregator = await Aggregator.deploy(owner.address);
  // add some liquidity in the pool
  // deploy strategy contract
  const strategyFactory = await StrategyFactory.deploy(aggregator.address);
  await aggregator.addFactory(strategyFactory.address);
  await strategyFactory.createStrategy(pool.address, owner.address);
  await strategyFactory.createStrategy(pool.address, owner.address);
  const _strategy0 = await strategyFactory.strategyByIndex(1);
  const _strategy1 = await strategyFactory.strategyByIndex(2);
  strategy0 = await ethers.getContractAt("DefiEdgeStrategy", _strategy0);
  strategy1 = await ethers.getContractAt("DefiEdgeStrategy", _strategy1);
  // add initial liquidity to start the pool
  tickLower = calculateTick(2500, 60);
  tickUpper = calculateTick(3500, 60);
  secondaryTickLower = calculateTick(2700, 60);
  secondaryTickUpper = calculateTick(3300, 60);
  await strategy0.initialize([[0, 0, tickLower, tickUpper]]);
  await strategy1.initialize([[0, 0, secondaryTickLower, secondaryTickUpper]]);
  const approveAmt = "100000000000000000000000000000";
  // approve tokens for aggregator
  await token0.approve(aggregator.address, approveAmt);
  await token1.approve(aggregator.address, approveAmt);
  // approve tokens for aggregator
  await token0.connect(userA).approve(aggregator.address, approveAmt);
  await token1.connect(userA).approve(aggregator.address, approveAmt);
  // approve tokens for aggregator
  await token0.transfer(userA.address, "1000000000000000000000000");
  await token1.transfer(userA.address, "1000000000000000000000000");

  // approve tokens for aggregator
  await token0.approve(aggregator.address, approveAmt);
  await token1.approve(aggregator.address, approveAmt);

  swapRouter = await SwapRouter.deploy();
  // approve tokens for aggregator
  await token0.approve(swapRouter.address, approveAmt);
  await token1.approve(swapRouter.address, approveAmt);

  await swapRouter.mintLiquidity(
    pool.address,
    tickLower,
    tickUpper,
    "10000000000000000000000000",
    "10000000000000000000000000",
    owner.address
  );

  // // adds 5000 token0 and 16580085.099454967 token1

  //   await aggregator
  //     .connect(owner)
  //     .addLiquidity(
  //       strategy0.address,
  //       "5000000000000000000000",
  //       "1500000000000000000000000000",
  //       0,
  //       0,
  //       0
  //     );
  // // adds 5000 token0 and 16580085.099454967 token1
  // await aggregator
  //   .connect(owner)
  //   .addLiquidity(
  //     strategy0.address,
  //     "50000000000000000000000",
  //     "15000000000000000000000000000",
  //     0,
  //     0,
  //     0
  //   );

  // swap tokens
  const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;
  const sqrtPriceLimitX96 =
    parseInt(sqrtRatioX96) + parseInt(sqrtRatioX96) * 0.9;
  const sqrtPriceLimitX96New =
    parseInt(sqrtRatioX96) - parseInt(sqrtRatioX96) * 0.9;
  // await swapRouter.swap(
  //   pool.address,
  //   false,
  //   "350000000000000000000",
  //   toGwei(sqrtPriceLimitX96 / 1e18)
  // );
  // await ethers.provider.send("evm_increaseTime", [10]);
  // await swapRouter.swap(
  //   pool.address,
  //   false,
  //   "10000000000000000000",
  //   toGwei(sqrtPriceLimitX96New / 1e18)
  // );

  // increase cardinary
  await pool.increaseObservationCardinalityNext(65);

  let slot0;
  slot0 = await pool.slot0();
  // increase oracle space
  await swapRouter.swap(
    pool.address,
    true,
    "10000000000000000000",
    toGwei(sqrtPriceLimitX96New / 1e18)
  );

  slot0 = await pool.slot0();
});

describe("🟢  Oracle Test", function () {
  beforeEach("Tests Oracle", async () => {
    const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;

    const sqrtPriceLimitX96New =
      parseInt(sqrtRatioX96) - parseInt(sqrtRatioX96) * 0.9;

    await ethers.provider.send("evm_increaseTime", [65]);
    await swapRouter.swap(
      pool.address,
      true,
      "10000000000000000000",
      toGwei(sqrtPriceLimitX96New / 1e18)
    );

    const oracle = await pool.observe([10, 0]);
    console.log("original miyn");

    await aggregator.addLiquidity(
      strategy1.address,
      "1000000000000000000",
      "3500000000000000000000",
      0,
      0,
      0
    );

    await strategy1.rebalance("0", 0, "1000000", true, [
      [
        "100000000000000000",
        "35000000000000000000",
        calculateTick(2600, 60),
        calculateTick(2800, 60),
      ],
    ]);

    console.log("feeToAddress", await strategy1.feeTo());
    // enable share
    await strategy1.changeFeeTo(feeTo.address);
    await strategy1.changeFee(2);

    console.log("add liquidity for userA");
    await aggregator
      .connect(userA)
      .addLiquidity(
        strategy1.address,
        "1000000000000000000",
        "3500000000000000000000",
        0,
        0,
        0
      );

    const feeToShares = await aggregator.shares(
      strategy1.address,
      feeTo.address
    );

    console.log({
      feeToShares: feeToShares.toString(),
    });

    const shares = await aggregator.shares(strategy1.address, feeTo.address);
    const aum = await aggregator.getAUM(strategy1.address);
    const totalShares = await aggregator.totalShares(strategy1.address);
    console.log({
      sharesOfUserA: shares.toString(),
      totalAmount0: aum.amount0.toString(),
      totalAmount1: aum.amount1.toString(),
      totalShares: totalShares.toString(),
    });

    console.log("remove for feeTo");
    await aggregator
      .connect(feeTo)
      .removeLiquidity(strategy1.address, feeToShares, 0, 0);

    console.log("remove for userA");

    await aggregator
      .connect(userA)
      .addLiquidity(
        strategy1.address,
        "1000000000000000000",
        "3500000000000000000000",
        0,
        0,
        0
      );

    await aggregator
      .connect(userA)
      .removeLiquidity(strategy1.address, shares, 0, 0);

    // try minting some dai
    // const dai = await ethers.getContractAt(
    //   "ERC20",
    //   "0x6b175474e89094c44da98b954eedeac495271d0f"
    // );
    // // await dai.mint(owner.address, "100000000000000000000000");
    // console.log(
    //   "balance of dai",
    //   (await dai.balanceOf(owner.address)).toString()
    // );
    // // get pool contract from mainnet
    // const mainnetPool = await ethers.getContractAt(
    //   "UniswapV3Pool",
    //   "0xc2e9f25be6257c210d7adf0d4cd6e3e881ba25f8"
    // );
    // const slot0 = await mainnetPool.slot0();
    // console.log(slot0);
    // const oracle = await mainnetPool.observe([2340, 0]);
    // console.log(oracle);
  });

  it("updates unused amounts matching with contract balance", async () => {
    await aggregator
      .connect(owner)
      .addLiquidity(
        strategy0.address,
        "5000000000000000000000",
        "1500000000000000000000000000",
        0,
        0,
        0
      );
    console.log("testing oracle script");
  });

  // TODO: Add test to deploy 100% liquidity in single order
});

// deploy test tokens
async function deployTestTokens() {
  token0 = await TestToken.deploy(
    "tstToken",
    "TST0",
    18,
    "100000000000000000000000000000",
    owner.address
  );

  token1 = await TestToken.deploy(
    "tstToken",
    "TST0",
    18,
    "100000000000000000000000000000",
    owner.address
  );

  weth9 = await TestToken.deploy(
    "Wrapped Ether",
    "WETH9",
    18,
    "1",
    owner.address
  );
}

async function deployStrategy() {}
