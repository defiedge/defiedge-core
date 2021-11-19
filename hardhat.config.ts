import { task } from "hardhat/config";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ganache";
require("dotenv").config();
import "hardhat-contract-sizer";

const INFURA_KEY = process.env.INFURA_KEY || "1"; // for coverage
const PRIVATE_KEY =
  process.env.PRIVATE_KEY ||
  "0xa3cf71bf26325d0175cd9d475141f9a46c29787d281707d78cffe11b1629b428"; // for coverage
const MAINNET_PRIVATE_KEY =
  process.env.MAINNET_PRIVATE_KEY ||
  "0xa3cf71bf26325d0175cd9d475141f9a46c29787d281707d78cffe11b1629b428"; // for coverage

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
export default {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      gas: 12000000,
      blockGasLimit: 0x1fffffffffffff,
    },
    kovan: {
      url: `https://kovan.infura.io/v3/${INFURA_KEY}`,
      accounts: [PRIVATE_KEY],
      gasLimit: 10000000000,
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_KEY}`,
      accounts: [MAINNET_PRIVATE_KEY],
      gasLimit: 17000000,
      gasPrice: 65000000000,
    },
  },
  solidity: {
    version: "0.7.6",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,
      },
      metadata: {
        bytecodeHash: "none",
      },
    },
  },
};
