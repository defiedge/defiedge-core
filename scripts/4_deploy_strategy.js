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
    dai: "0xF9A48E4386b30975247300330522F1eD521ab532",
    eth: "0x8c620793ca7A7f25D2725cC779D94430274Cf1C1",
    factory: "0x5B2dc16C09e12bbF98192B2219Ba4f63e8b5122E",
    pool: "0x5Ae8Ea43Ff765F59f4E12f7a1Ef088322a2D6562",
  };

  const dai = await ethers.getContractAt("ERC20", addresses.dai);
  const eth = await ethers.getContractAt("ERC20", addresses.eth);

  const factory = await ethers.getContractAt(
    "DefiEdgeStrategyFactory",
    addresses.factory
  );

  const pool = await ethers.getContractAt("UniswapV3Pool", addresses.pool);

  await factory.whitelistPool(pool.address);

  // const strategy = await ethers.getContractAt(
  //   "DefiEdgeStrategy",
  //   strategyAddress
  // );

  let tickUpper, tickLower;
  if (dai.address < eth.address) {
    // add initial liquidity to start the pool
    tickUpper = calculateTick(0.00028571428571428574, 60);
    tickLower = calculateTick(0.00022222222222222223, 60);
  } else {
    // add initial liquidity to start the pool
    tickLower = calculateTick(3000, 60);
    tickUpper = calculateTick(4500, 60);
  }

  await factory.createStrategy(pool.address, addresses.owner, [
    [0, 0, tickLower, tickUpper],
  ]);

  const index = await factory.totalIndex();
  const strategyAddress = await factory.strategyByIndex(parseInt(index));
  console.log({
    strategyAddress,
  });
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
