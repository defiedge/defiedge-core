const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const bn = require("bignumber.js");
const hre = require("hardhat");

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

const config = require("./config");

async function main() {
  const factoryAddress = config.uniswapFactory;

  const tokens = {
    dai: config.dai,
    eth: config.eth,
  };

  const dai = await ethers.getContractAt("ERC20", tokens.dai);
  const eth = await ethers.getContractAt("ERC20", tokens.eth);

  const factory = await ethers.getContractAt(
    "UniswapV3Factory",
    factoryAddress
  );

  console.log("⭐  Deployment Started");

  // deploy DAI
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

  // console.log contract addresses
  console.log("🎉 Contracts Deployed");
  console.log({
    pool: pool.address,
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
