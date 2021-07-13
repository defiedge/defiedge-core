const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const bn = require("bignumber.js");
const hre = require("hardhat");

const config = require("./config");

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

async function main() {
  console.log("⭐  Deployment Started");

  const addresses = {
    owner: "0x22CB224F9FA487dCE907135B57C779F1f32251D4",
    dai: "0xdbdBc8fd9117872D64a9dA8ab6c9Ae243e45B844",
    eth: "0x98E652945f92817a924127AEdFB078261490C3fe",
    factory: "0x041a74836f122216425c44f65a25451c0CBc6C2f",
    pool: "0x737FC2b8DA21e79000D30641E459e79823e7D1ec",
  };

  const dai = await ethers.getContractAt("ERC20", addresses.dai);
  const eth = await ethers.getContractAt("ERC20", addresses.eth);

  const factory = await ethers.getContractAt(
    "DefiEdgeStrategyFactory",
    addresses.factory
  );

  const pool = await ethers.getContractAt("UniswapV3Pool", addresses.pool);

  await factory.createStrategy(pool.address, addresses.owner);

  const index = await factory.totalIndex();

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
