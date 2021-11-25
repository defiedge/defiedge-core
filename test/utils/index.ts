import { expect } from "chai";

import { BigNumber, utils } from "ethers";
import { ethers } from "hardhat";
const bn = require("bignumber.js");

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

const FEE_SIZE = 3

const FeeAmount = {
  LOW: 500,
  MEDIUM: 3000,
  HIGH: 10000
}

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

const encodePath = (path: string[], fees: number[]) => {
  if (path.length != fees.length + 1) {
    throw new Error('path/fee lengths do not match')
  }

  let encoded = '0x'
  for (let i = 0; i < fees.length; i++) {
    // 20 byte encoding of the address
    encoded += path[i].slice(2)
    // 3 byte encoding of the fee
    encoded += fees[i].toString(16).padStart(2 * 3, '0')
  }
  // encode the final token
  encoded += path[path.length - 1].slice(2)

  return encoded.toLowerCase()
}
export { encodePriceSqrt, calculateTick, toGwei, expandTo18Decimals, expandToString, encodePath };
