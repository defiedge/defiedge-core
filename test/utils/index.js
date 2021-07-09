const { expect } = require("chai");

const { BigNumber, utils } = require("ethers");
const { ethers } = require("hardhat");
const bn = require("bignumber.js");

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

const encodePriceSqrt = (reserve0, reserve1) => {
  const number = BigNumber.from(
    new bn(reserve1.toString())
      .div(reserve0.toString())
      .sqrt()
      .multipliedBy(new bn(2).pow(96))
      .integerValue(3)
      .toString()
  );
  return number;
};

const calculateTick = (price, tickSpacing) => {
  const logTick = 46054 * Math.log10(Math.sqrt(price));
  return parseInt(logTick) + tickSpacing - (parseInt(logTick) % tickSpacing);
};

const toGwei = (_number) => {
  return (_number * 1e18).toLocaleString("fullwide", { useGrouping: false }); // returns "4000000000000000000000000000"
};

// export function toGwei(_number) {
// }

// export function expandTo18Decimals(number) {
//   return BigNumber.from(number).mul(BigNumber.from(10).pow(18));
// }

// export function getPriceFromTick(tick) {
//   return 1.0001 ** tick;
// }

module.exports = {
  encodePriceSqrt,
  calculateTick,
  toGwei,
};
