const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const bn = require("bignumber.js");
const hre = require("hardhat");

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

async function main() {
  const userA = "0x08DcE649f86AF45dA8648FaD31D1C33A617C52d1";
  const userB = "0xa4f7269C56974322C35A092bcB9897C642B57298";

  const owner = "0x22CB224F9FA487dCE907135B57C779F1f32251D4";
  const factoryAddress = "0x1F98431c8aD98523631AE4a59f267346ea31F984";

  const TestToken = await ethers.getContractFactory("ERC20");
  const TestStrategy = await ethers.getContractFactory("DefiEdgeStrategy");

  const StrategyFactory = await ethers.getContractFactory("StrategyFactory");

  const Aggregator = await ethers.getContractFactory("Aggregator");

  const factory = await ethers.getContractAt(
    "UniswapV3Factory",
    factoryAddress
  );

  console.log("⭐  Deployment Started");

  // deploy DAI
  const dai = await TestToken.deploy(
    "uniDAI2",
    "DAI2",
    18,
    "100000000000000000000000000000",
    owner
  );

  // deploy ETH
  const eth = await TestToken.deploy(
    "uniETH2",
    "ETH2",
    18,
    "100000000000000000000000000000",
    owner
  );

  await dai.transfer(userA, "10000000000000000000000000");
  await eth.transfer(userA, "10000000000000000000000000");

  await dai.transfer(userB, "10000000000000000000000000");
  await eth.transfer(userB, "10000000000000000000000000");

  // create a pool
  await factory.createPool(dai.address, eth.address, 3000);

  // initialize the pool
  const poolAddress = await factory.getPool(dai.address, eth.address, "3000");

  const pool = await ethers.getContractAt("UniswapV3Pool", poolAddress);

  // set reserves at ETH price of 3500 DAI per ETh
  const initialEthReserve = "28571428571400000000";
  const initialDaiReserve = "100000000000000000000000";

  // select the reserve amounts based on the tokens
  let reserve0, reserve1;
  if (dai.address < eth.address) {
    reserve0 = initialDaiReserve;
    reserve1 = initialEthReserve;

    // add initial liquidity to start the pool
    tickUpper = calculateTick(0.0003333333333333333, 60);
    tickLower = calculateTick(0.00025, 60);
  } else {
    reserve0 = initialEthReserve;
    reserve1 = initialDaiReserve;

    // add initial liquidity to start the pool
    tickLower = calculateTick(3000, 60);
    tickUpper = calculateTick(4000, 60);
  }

  console.log(reserve0, reserve1);

  // initialize the pool
  const sqrtPriceX96 = encodePriceSqrt(reserve0, reserve1);
  console.log({ sqrtPriceX96 });
  await pool.initialize(sqrtPriceX96);

  console.log("✅ pool initialized");

  const governance = "0x22CB224F9FA487dCE907135B57C779F1f32251D4";

  // deploy aggregator contract
  const v3Aggregator = await Aggregator.deploy(governance);
  console.log("✅ aggregator deployed");

  console.log(v3Aggregator.address);

  const strategyFactory = await StrategyFactory.deploy(v3Aggregator.address);
  console.log("✅ factory deployed");

  await strategyFactory.createStrategy(
    pool.address,
    owner
  )
  
  const strategyAddress = await strategyFactory.getStrategyByIndex(0)

  strategy = await ethers.getContractAt("DefiEdgeStrategy", strategyAddress);

  console.log("✅ strategy deployed");

  // intialize the strategy
  await strategy.initialize([[0, 0, tickLower, tickUpper]]);

  console.log("✅ strategy initialised");

  // console.log contract addresses
  console.log("🎉 Contracts Deployed");
  console.log({
    dai: dai.address,
    eth: eth.address,
    pool: pool.address,
    strategy: strategy.address,
    v3Aggregator: v3Aggregator.address,
    factory: strategyFactory.address
  });
}

function encodePriceSqrt(reserve0, reserve1) {
  console.log("encoding");
  return BigNumber.from(
    new bn(reserve1.toString())
      .div(reserve0.toString())
      .sqrt()
      .multipliedBy(new bn(2).pow(96))
      .integerValue(3)
      .toString()
  );
}

function calculateTick(price, tickSpacing) {
  const logTick = 46054 * Math.log10(Math.sqrt(price));
  return parseInt(logTick) + tickSpacing - (parseInt(logTick) % tickSpacing);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
