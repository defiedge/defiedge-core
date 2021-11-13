const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const bn = require("bignumber.js");
const hre = require("hardhat");

async function main() {
  const addresses = {
    governance: "0xC58F20d4Cd28303A669826b7A03543aEaC6626ba",
    uniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  };

  const ShareHelper = await ethers.getContractFactory("ShareHelper");

  const shareHelper = await ShareHelper.deploy();

  console.log(shareHelper.address);

  const StrategyFactory = await ethers.getContractFactory(
    "DefiEdgeStrategyFactory",
    {
      libraries: {
        ShareHelper: shareHelper.address,
      },
    }
  );
  const factory = await StrategyFactory.deploy(
    addresses.governance,
    addresses.uniswapV3Factory
  );
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
