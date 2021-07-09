const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const bn = require("bignumber.js");
const hre = require("hardhat");

const config = require("./config");

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

async function main() {
  console.log("⭐  Deployment Started");

  const addresses = {
    owner: "0xC58F20d4Cd28303A669826b7A03543aEaC6626ba",
    dai: "0x6b175474e89094c44da98b954eedeac495271d0f",
    eth: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    factory: "0xFa681994c6692c820052c7f90862B9072CD84BbA",
    pool: "0xc2e9f25be6257c210d7adf0d4cd6e3e881ba25f8",
  };

  const dai = await ethers.getContractAt("ERC20", addresses.dai);
  const eth = await ethers.getContractAt("ERC20", addresses.eth);

  const factory = await ethers.getContractAt(
    "StrategyFactory",
    addresses.factory
  );

  const pool = await ethers.getContractAt("UniswapV3Pool", addresses.pool);

  await factory.createStrategy(pool.address, addresses.owner);

  const index = await factory.total();

  const strategyAddress = await factory.strategyByIndex(parseInt(index));
  const strategy = await ethers.getContractAt(
    "DefiEdgeStrategy",
    strategyAddress
  );

  let tickUpper, tickLower;
  if (dai.address < eth.address) {
    // add initial liquidity to start the pool
    tickUpper = calculateTick(0.0006666666666666666, 60);
    tickLower = calculateTick(0.0005555555555555556, 60);
  } else {
    // add initial liquidity to start the pool
    tickLower = calculateTick(1500, 60);
    tickUpper = calculateTick(1800, 60);
  }

  await strategy.initialize([[0, 0, tickLower, tickUpper]]);
  console.log("✅ strategy initialised");

  // console.log contract config
  console.log("🎉 Contracts Deployed");
  console.log({
    strategy: strategy.address,
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
