const { expect } = require("chai");

const { BigNumber, utils } = require("ethers");

const { ethers } = require("hardhat");

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
let userA;
let userB;

let LiquidityHelper;

// import artifacts
async function loadContracts() {
  UniswapV3Factory = await ethers.getContractFactory("UniswapV3Factory");
  StrategyFactory = await ethers.getContractFactory("StrategyFactory");
  TestToken = await ethers.getContractFactory("ERC20");
  DefiEdgeStrategy = await ethers.getContractFactory("DefiEdgeStrategy");
  Aggregator = await ethers.getContractFactory("Aggregator");
  LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");
}

let token0;
let token1;
let owner;
let uniswapFactory;
let aggregator;
let strategy0;
let strategy1;

let tickLower;
let tickUpper;
let secondaryTickLower;
let secondaryTickUpper;

beforeEach(async () => {
  [owner, userA, userB] = await ethers.getSigners();

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

  // // adds 5000 token0 and 16580085.099454967 token1

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

  await pool.increaseObservationCardinalityNext(65);
});

describe("🟢  Adding Liquidity in single order", function () {
  beforeEach("add and rebalance pair", async () => {
    // adds 10 and 31630.148889005883
    await aggregator
      .connect(owner)
      .addLiquidity(
        strategy1.address,
        "10000000000000000000",
        "17580085099454966736264154",
        0,
        0,
        0
      );

    const ticks = await aggregator.getTicks(strategy1.address);

    await strategy1.rebalance("0", "0", "0", false, [
      [
        "5000000000000000000",
        "17500000000000000000000",
        secondaryTickLower,
        secondaryTickUpper,
      ],
    ]);
  });

  it("updates unused amounts matching with contract balance", async () => {
    const unused = await aggregator.unused(strategy1.address);
    expect(unused.amount0.toString()).to.equal(
      await token0.balanceOf(aggregator.address)
    );
    expect(unused.amount1.toString()).to.equal(
      await token1.balanceOf(aggregator.address)
    );
  });

  it("matches and stores debited amounts in the contract variable ", async () => {
    const ticks = await aggregator.getTicks(strategy1.address);
    const unused = await aggregator.unused(strategy1.address);
    expect(
      parseInt("10000000000000000000") - parseInt(unused.amount0)
    ).to.equal(parseInt(ticks[0].amount0));
  });

  it("adds liquidity after rebalance", async () => {
    const oldTicksData = await aggregator.getTicks(strategy1.address);
    await aggregator.addLiquidity(
      strategy1.address,
      "1000000000000000000",
      "3500000000000000000000",
      0,
      0,
      0
    );
    const newTicksData = await aggregator.getTicks(strategy1.address);

    expect(parseInt("1000000000000000000")).to.equal(
      newTicksData[0].amount0.toString() - oldTicksData[0].amount0.toString()
    );
    expect(3.163014888900589e21).to.equal(
      newTicksData[0].amount1.toString() - oldTicksData[0].amount1.toString()
    );
  });

  it("is able to rebalance again", async () => {
    await strategy1.rebalance("0", "0", "0", false, [
      [
        "1000000000000000000",
        "350000000000000000000",
        calculateTick(2600, 60),
        calculateTick(3300, 60),
      ],
    ]);
    const ticks = await aggregator.getTicks(strategy1.address);
    expect(parseInt("350000000000000000000")).to.equal(
      parseInt(ticks[0].amount1)
    );
  });

  // TODO: Add test to deploy 100% liquidity in single order
});

describe("🟢 🟢 Rebalance using Multiple Ranges", () => {
  let ticksBefore;

  beforeEach("Add and Rebalance liquidity in two ranges", async () => {
    // adds 10 and 31630.148889005883

    await aggregator
      .connect(owner)
      .addLiquidity(
        strategy1.address,
        "10000000000000000000",
        "17580085099454966736264154",
        0,
        0,
        0
      );

    // ticks before rebalance
    ticksBefore = await aggregator.getTicks(strategy1.address);

    const unused = await aggregator.unused(strategy1.address);

    console.log("unused amount0 before", unused.amount0.toString());
    console.log("unused amoutn1 before", unused.amount1.toString());
    console.log(
      "baanceOf amount0 before",
      await token0.balanceOf(aggregator.address)
    );
    console.log(
      "baanceOf amount1 before",
      await token1.balanceOf(aggregator.address)
    );

    console.log("after rebalance");
    await strategy1.rebalance("0", "0", "0", false, [
      [
        "1000000000000000000",
        "35000000000000000000000",
        calculateTick(2600, 60),
        calculateTick(3300, 60),
      ],
      [
        "1000000000000000000",
        "35000000000000000000000",
        calculateTick(2300, 60),
        calculateTick(3700, 60),
      ],
    ]);

    console.log("baanceOf amount0", await token0.balanceOf(aggregator.address));
    console.log("baanceOf amount1", await token1.balanceOf(aggregator.address));
  });

  it("updates the unused amounts", async () => {
    const unused = await aggregator.unused(strategy1.address);

    console.log("unused amount0", unused.amount0.toString());
    console.log("unused amoutn1", unused.amount1.toString());
    console.log("baanceOf amount0", await token0.balanceOf(aggregator.address));
    console.log("baanceOf amount1", await token1.balanceOf(aggregator.address));

    expect(unused.amount0.toString()).to.equal(
      await token0.balanceOf(aggregator.address)
    );
    expect(unused.amount1.toString()).to.equal(
      await token1.balanceOf(aggregator.address)
    );
  });

  it("updates the used amounts", async () => {
    let token0After = 0,
      token1After = 0;
    const ticksAfter = await aggregator.getTicks(strategy1.address);
    const unused = await aggregator.unused(strategy1.address);

    for (const tick of ticksAfter) {
      token0After += parseInt(tick.amount0);
      token1After += parseInt(tick.amount1);
    }

    expect(token0After).to.equal(parseInt("2000000000000000000"));
    expect(token1After).to.equal(7.838492351944538e21);
  });

  it("adds liquidity after rebalance", async () => {
    const oldTicksData = await aggregator.getTicks(strategy1.address);

    await aggregator.addLiquidity(
      strategy1.address,
      "1000000000000000000",
      "3500000000000000000000",
      0,
      0,
      0
    );

    const newTicksData = await aggregator.getTicks(strategy1.address);

    expect(parseInt("830921251876009000")).to.equal(
      newTicksData[0].amount0.toString() - oldTicksData[0].amount0.toString()
    );
    expect(3.5000000000000005e21).to.equal(
      newTicksData[0].amount1.toString() - oldTicksData[0].amount1.toString()
    );
  });
});

describe("🤯 Swap With Rebalance", () => {
  beforeEach("Add liquidity and swap amount", async () => {
    // adds 10 and 31630.148889005883
    await aggregator
      .connect(owner)
      .addLiquidity(
        strategy1.address,
        "10000000000000000000",
        "17580085099454966736264154",
        0,
        0,
        0
      );

    const unusedBefore = await aggregator.unused(strategy1.address);

    console.log((await pool.slot0()).sqrtPriceX96);

    const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;
    const sqrtPriceLimitX96 = sqrtRatioX96 - (sqrtRatioX96 * 10) / 100;

    await strategy1.rebalance(
      "2000000000000000000",
      toGwei(sqrtPriceLimitX96 / 1e18),
      "1000000",
      true,
      [
        [
          "1000000000000000000",
          "35000000000000000000000",
          calculateTick(2600, 60),
          calculateTick(3300, 60),
        ],
        [
          "1000000000000000000",
          "35000000000000000000000",
          calculateTick(2300, 60),
          calculateTick(3700, 60),
        ],
      ]
    );
  });

  it("updates the unused amounts", async () => {
    const unused = await aggregator.unused(strategy1.address);
    expect(unused.amount0.toString()).to.equal(
      await token0.balanceOf(aggregator.address)
    );
    expect(unused.amount1.toString()).to.equal(
      await token1.balanceOf(aggregator.address)
    );
  });

  it("updates the used amounts correctly", async () => {});
});

// describe("🐛 Bug", () => {
//   it("consoles sqrt prices", async () => {
//     const liquidityHelper = await LiquidityHelper.deploy();

//     const ticks = [
//       {
//         position: { liquidity: '59149315408003957658080' },
//         tickLower: 75960,
//         tickUpper: 80040,
//         amount0: '0',
//         amount1: '597000512740656199999958'
//       },
//       {
//         position: { liquidity: '22590063369273683733806' },
//         tickLower: 80700,
//         tickUpper: 82380,
//         amount0: '14435334389111013793',
//         amount1: '59392228757136813999998'
//       }
//     ];

//     for (tick in ticks) {
//       const amountsFromLiquidity =
//         await liquidityHelper.getAmountsForLiquidityTest(
//           pool.address,
//           "4687189220205140070798390409657",
//           ticks[tick].tickLower,
//           ticks[tick].tickUpper,
//           ticks[tick].position.liquidity
//         );

//       console.log({
//         amount0: amountsFromLiquidity.amount0.toString(),
//         amount1: amountsFromLiquidity.amount1.toString(),
//       });
//     }
//   });
// });

describe("✋  Hold Funds", () => {
  beforeEach("Add liquidity and swap amount", async () => {
    // adds 10 and 31630.148889005883
    await aggregator
      .connect(owner)
      .addLiquidity(
        strategy1.address,
        "10000000000000000000",
        "17580085099454966736264154",
        0,
        0,
        0
      );

    const unusedBefore = await aggregator.unused(strategy1.address);
    const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;
    const sqrtPriceLimitX96 = sqrtRatioX96 - (sqrtRatioX96 * 10) / 100;
    await strategy1.rebalance(
      "2000000000000000000",
      toGwei(sqrtPriceLimitX96 / 1e18),
      "1000000",
      true,
      [
        [
          "1000000000000000000",
          "35000000000000000000000",
          calculateTick(2600, 60),
          calculateTick(3300, 60),
        ],
        [
          "1000000000000000000",
          "35000000000000000000000",
          calculateTick(3300, 60),
          calculateTick(4000, 60),
        ],
      ]
    );
  });

  it("it updates the unused amounts", async () => {
    // await strategy1.holdFunds();
    const aum = await aggregator.getAUM(strategy1.address);
    const ticks = await aggregator.getTicks(strategy1.address);
    const unused = await aggregator.unused(strategy1.address);

    const tickLowerX = calculateTick(2300, 60);
    const tickUpperX = calculateTick(3700, 60);

    const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;
    const sqrtPriceLimitX96 =
      parseInt(sqrtRatioX96) + parseInt(sqrtRatioX96) * 0.5;

    await strategy1.rebalance(
      toGwei(3900.6880796999767),
      toGwei(sqrtPriceLimitX96 / 1e18),
      "1000000",
      false,
      [
        [
          toGwei(9.296328671820293),
          toGwei(33711.278254018514),
          calculateTick(2300, 60),
          calculateTick(3700, 60),
        ],
      ]
    );

    await strategy1.rebalance(
      "0",
      toGwei(sqrtPriceLimitX96 / 1e18),
      "1000000",
      true,
      [
        [
          "1000000000000000000",
          "35000000000000000000000",
          calculateTick(2600, 60),
          calculateTick(3300, 60),
        ],
        [
          "1000000000000000000",
          "35000000000000000000000",
          calculateTick(3300, 60),
          calculateTick(4000, 60),
        ],
      ]
    );

    // await strategy1.rebalance(
    //   toGwei(0),
    //   toGwei(sqrtPriceLimitX96 / 1e18),
    //   "1000000",
    //   false,
    //   [
    //     [
    //       toGwei(0.01296328671820293),
    //       toGwei(33.278254018514),
    //       calculateTick(2400, 60),
    //       calculateTick(3800, 60),
    //     ],
    //   ]
    // );

    // await strategy1.rebalance(
    //   toGwei(0),
    //   toGwei(sqrtPriceLimitX96 / 1e18),
    //   "1000000",
    //   false,
    //   [
    //     [
    //       toGwei(9.296328671820293),
    //       toGwei(33711.278254018514),
    //       calculateTick(2500, 60),
    //       calculateTick(4000, 60),
    //     ],
    //   ]
    // );
  });
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
}

async function deployStrategy() {}
