import { expect } from "chai";

import { BigNumber, utils } from "ethers";
import { ethers } from "hardhat";
const bn = require("bignumber.js");

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

const encodePriceSqrt = (reserve0: any, reserve1: any) => {
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

const calculateTick = (price: number, tickSpacing: number) => {
  const logTick = 46054 * Math.log10(Math.sqrt(price));
  return BigNumber.from(logTick + tickSpacing - (logTick % tickSpacing));
};

const toGwei = (_number: any) => {
  return (_number * 1e18).toLocaleString("fullwide", { useGrouping: false }); // returns "4000000000000000000000000000"
};

const expandTo18Decimals = (value: number) => {
  return (value * 1e18).toLocaleString("fullwide", { useGrouping: false });
};

const expandToString = (value: number) => {
  return value.toLocaleString("fullwide", { useGrouping: false });
};

export { encodePriceSqrt, calculateTick, toGwei, expandTo18Decimals, expandToString };
