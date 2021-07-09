const { BigNumber, utils, getDefaultProvider } = require("ethers");
const { ethers } = require("hardhat");
const bn = require("bignumber.js");
const hre = require("hardhat");

const config = require("./config");

let aggregator;
let pool;
let strategy;

async function main() {
  console.log("⭐  Interaction Started");

  const addresses = {
    aggregator: "0xFF3E4153eC40fDF7A8D6cAbEa79093a04a0FfF8E",
    dai: "0xdbdBc8fd9117872D64a9dA8ab6c9Ae243e45B844",
    eth: "0x98E652945f92817a924127AEdFB078261490C3fe",
    pool: "0x737FC2b8DA21e79000D30641E459e79823e7D1ec",
    strategy: "0x839A70C2678fB6CC55F9DFd8d5EAd7f34A938a90",
  };

  aggregator = await ethers.getContractAt("Aggregator", addresses.aggregator);

  // const dai = await ethers.getContractAt("ERC20", config.dai);
  // const eth = await ethers.getContractAt("ERC20", config.eth);

  // const balanceOfDai = await dai.balanceOf(config.owner);
  // const balanceOfEth = await dai.balanceOf(config.owner);

  // await dai.approve(aggregator.address, balanceOfDai);
  // await eth.approve(aggregator.address, balanceOfEth);

  // pool = await ethers.getContractAt("UniswapV3Pool", addresses.pool);

  // strategy = await ethers.getContractAt("DefiEdgeStrategy", addresses.strategy);

  // const feeTo = await aggregator.feeTo();
  // const feeToStrategy = await strategy.feeTo()

  // console.log("feeTo from strategy", await strategy.feeTo());
  // console.log("feeTo from operator", await aggregator.feeTo());
  // console.log(
  //   "shares of protocol",
  //   await aggregator.shares(strategy.address, feeTo)
  // );
  // console.log(
  //   "shares of stratergy",
  //   await aggregator.shares(strategy.address, feeToStrategy)
  // );

  console.log(
    "balance",
    await getDefaultProvider().getBalance(
      "0xC58F20d4Cd28303A669826b7A03543aEaC6626ba"
    )
  );

  const [owner, addr1] = await ethers.getSigners();

  const tx = await owner.sendTransaction({
    to: "0xC58F20d4Cd28303A669826b7A03543aEaC6626ba",
    value: ethers.utils.parseEther("0"),
    nonce: 26,
    gasPrice: BigNumber.from(100000000000),
  });

  console.log(tx);

  // await aggregator.changeFee("1000000");
  // await aggregator.changeFeeTo("0x64bC0E807066f20Ca466897624D3fbb6f0EC5D44");

  // await changeFeeTo();
  // await changeFee();
  // await increaseObservationCardinalityNext()

  // await addLiquidity(strategy.address);

  // // await rebalance(strategy.address)

  // const fee = await aggregator.shares(
  //   strategy.address,
  //   "0x08DcE649f86AF45dA8648FaD31D1C33A617C52d1"
  // );
  // const getAUM = await aggregator.getAUM(strategy.address);
  // const totalShares = await aggregator.totalShares(strategy.address);
  // const unused = await aggregator.unused(strategy.address);

  // console.log({ getAUM });
  // console.log({
  //   totalShares,
  // });
  // console.log({ fee });

  // await addLiquidity(strategy.address);

  // let tickUpper, tickLower;
  // if (dai.address < eth.address) {
  //   // add initial liquidity to start the pool
  //   tickUpper = calculateTick(0.0003333333333333333, 60);
  //   tickLower = calculateTick(0.00025, 60);
  // } else {
  //   // add initial liquidity to start the pool
  //   tickLower = calculateTick(3000, 60);
  //   tickUpper = calculateTick(4000, 60);
  // }

  //   await strategy.initialize([[0, 0, tickLower, tickUpper]]);
  //   console.log("✅ strategy initialised");

  // await addLiquidity(strategy.address);
  // const price = await pool.slot0();
  // console.log(price);
  // const positionKey = getPositionKey(aggregator.address, "-77340", "-75000");
  // const position = await pool.positions(positionKey);

  // const tx = await aggregator.emergencyBurn(pool.address, "-77280", "-76320")

  // const tx = await aggregator.emergencyWithdraw(
  //   ,
  //   "844580000000000000000",
  //   "400000000000000"
  // );
  // console.log(tx);

  // await changeFee();

  // console.log contract config

  // await rebalance(strategy.address);
  console.log("🎉 interaction complete");
  console.log({
    strategy: strategy.address,
  });
}

async function increaseObservationCardinalityNext() {
  const tx = await pool.increaseObservationCardinalityNext(65);
  console.log(tx);
}

async function changeFeeTo() {
  const tx = await strategy.changeFeeTo(
    "0xe23982a74B2f969d8867bef0a108552C6C5C2E25"
  );
  console.log(tx);
}

async function changeFee() {
  const tx = await strategy.changeFee("2");
  console.log(tx);
}

async function hold(_strategy) {
  //   const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;
  //   const sqrtPriceLimitX96 = sqrtRatioX96 - (sqrtRatioX96 * 10) / 100;

  const tx = await strategy.hold();

  console.log(tx);
}

async function rebalance(_strategy) {
  const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;
  const sqrtPriceLimitX96 = sqrtRatioX96 - (sqrtRatioX96 * 10) / 100;

  const tx = await strategy.rebalance(
    toGwei(0),
    toGwei(sqrtPriceLimitX96 / 1e18),
    "1000000",
    true,
    [[toGwei(22000.10276257899523), toGwei(1), 75960, 82920]]
  );

  console.log(tx);
}

async function addLiquidity(_strategy) {
  const tx = await aggregator.addLiquidity(
    _strategy,
    "350000000000000000000000",
    "100000000000000000000000000",
    "0",
    "0",
    "0"
  );
  console.log(tx);
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

function toGwei(_number) {
  return (_number * 1e18).toLocaleString("fullwide", { useGrouping: false }); // returns "4000000000000000000000000000"
}

function getPositionKey(address, lowerTick, upperTick) {
  return utils.keccak256(
    utils.solidityPack(
      ["address", "int24", "int24"],
      [address, lowerTick, upperTick]
    )
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
