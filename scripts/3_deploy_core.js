const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const bn = require("bignumber.js");
const hre = require("hardhat");

async function main() {
  const addresses = {
    governance: "0xC58F20d4Cd28303A669826b7A03543aEaC6626ba",
  };
  const StrategyFactory = await ethers.getContractFactory(
    "DefiEdgeStrategyFactory"
  );
  const factory = await StrategyFactory.deploy(addresses.governance);
  // console.log contract addresses
  console.log("🎉 Contracts Deployed");
  console.log({
    strategyFactory: factory.address,
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
