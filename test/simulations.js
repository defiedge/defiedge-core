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

  await pool.increaseObservationCardinalityNext(65);
});

describe("🟢  Swap", function () {
  beforeEach("add and rebalance pair", async () => {
    const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;
    const sqrtPriceLimitX96 =
      parseInt(sqrtRatioX96) + parseInt(sqrtRatioX96) * 0.5;

    const sqrtPriceLimitX96New =
      parseInt(sqrtRatioX96) - parseInt(sqrtRatioX96) * 0.5;

    await ethers.provider.send("evm_increaseTime", [65]);

    await swapRouter.swap(
      pool.address,
      true,
      "10000000000000000000",
      toGwei(sqrtPriceLimitX96New / 1e18)
    );
    
    // adds 10 and 31630.148889005883
    await aggregator
      .connect(userA)
      .addLiquidity(
        strategy1.address,
        "10000000000000000000",
        "17580085099454966736264154",
        0,
        0,
        0
      );

    // accumulate fees here
    await swapRouter.swap(
      pool.address,
      false,
      "350000000000000000000",
      toGwei(sqrtPriceLimitX96 / 1e18)
    );

    await swapRouter.swap(
      pool.address,
      true,
      "10000000000000000000",
      toGwei(sqrtPriceLimitX96New / 1e18)
    );
  });

  it("claim fees", async () => {
    const shares = await aggregator.shares(strategy1.address, userA.address);


    console.log({
      shares
    })

    await aggregator
      .connect(userA)
      .removeLiquidity(strategy1.address, toGwei(93897.88166942823), 0, 0);
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
