const { BigNumber, utils, getDefaultProvider } = require("ethers");
const { ethers } = require("hardhat");
const bn = require("bignumber.js");
const hre = require("hardhat");

let factory;
let pool;
let strategy;

async function main() {
  const config = {
    factory: "0x6a5Ddbbf0DfC58c465dA7FC408432E6D5474f640",
    pool: "0xcbcdf9626bc03e24f779434178a73a0b4bad62ed",
  };

  factory = await ethers.getContractAt(
    "DefiEdgeStrategyFactory",
    config.factory
  );

  const tx = await factory.whitelistPool(config.pool);
  console.log("✅  pool whitelisted");
  console.log({ tx });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
