const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const bn = require("bignumber.js");
const hre = require("hardhat");

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

const config = require("./config");

async function main() {
  const userA = config.userA;
  const userB = config.userB;
  const owner = config.owner;

  const TestToken = await ethers.getContractFactory("ERC20");

  console.log("⭐  Deployment Started");

  // deploy DAI
  const dai = await TestToken.deploy(
    "testDAI",
    "DAI",
    18,
    "100000000000000000000000000000",
    owner
  );

  // deploy ETH
  const eth = await TestToken.deploy(
    "testETH",
    "ETH2",
    18,
    "100000000000000000000000000000",
    owner
  );

  await dai.transfer(userA, "10000000000000000000000000");
  await eth.transfer(userA, "10000000000000000000000000");

  await dai.transfer(userB, "10000000000000000000000000");
  await eth.transfer(userB, "10000000000000000000000000");

  // console.log contract addresses
  console.log("🎉 Contracts Deployed");
  console.log({
    dai: dai.address,
    eth: eth.address,
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
