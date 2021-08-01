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
    owner: "0x22CB224F9FA487dCE907135B57C779F1f32251D4",
    dai: "0xF9A48E4386b30975247300330522F1eD521ab532",
    eth: "0x8c620793ca7A7f25D2725cC779D94430274Cf1C1",
    pool: "0x5Ae8Ea43Ff765F59f4E12f7a1Ef088322a2D6562",
    strategy: "0x6fd1cc3b2b6eb24df19444af0e46b8efb292deb4",
    aggregator: "0x08e521DBa0590bc692c04cd0Db5285fC9Da3DD94",
  };

  pool = await ethers.getContractAt(
    "UniswapV3Pool",
    "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640"
  );

  const dai = await ethers.getContractAt(
    "TestERC20",
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
  );
  const eth = await ethers.getContractAt(
    "TestERC20",
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
  );

  strategy = await ethers.getContractAt(
    "DefiEdgeStrategy",
    "0xa43af89f8d34499ee984740f7ca9110e0aabfd77"
  );

  console.log(
    "shares of the user",
    await strategy.balanceOf("0x03cdc580e7de9d805483773cd73f00e9c6b2d0a0")
  );

  console.log("total shares", await strategy.totalSupply());
  console.log("balance of USDC", await eth.balanceOf(strategy.address));
  console.log("balance of ETH", await dai.balanceOf(strategy.address));

  console.log(await strategy.getTicks());

  // await addLiquidity();
  // await eth.approve(
  //   strategy.address,
  //   "115792089237316195423570985008687907853269984665640564039457584007913129639935"
  // );

  // const slot0 = await pool.slot0();
  // console.log(slot0)

  // console.log(
  //   "USDC allwoance",
  //   (await dai.allowance(
  //     "0xC58F20d4Cd28303A669826b7A03543aEaC6626ba",
  //     strategy.address
  //   )).toString()
  // );
  // console.log(
  //   "WETH allwoance",
  //   (await eth.allowance(
  //     "0xC58F20d4Cd28303A669826b7A03543aEaC6626ba",
  //     strategy.address
  //   )).toString()
  // );

  // await addLiquidity()

  // const positionKey = getPositionKey(
  //   "0x08e521dba0590bc692c04cd0db5285fc9da3dd94",
  //   "-77820",
  //   "-76080"
  // );
  // const position = await pool.positions(positionKey);

  // console.log(position);

  // const balanceOfEth = await eth.balanceOf(
  //   "0x08e521DBa0590bc692c04cd0Db5285fC9Da3DD94"
  // );
  // const balanceOfDai = await dai.balanceOf(
  //   "0x08e521DBa0590bc692c04cd0Db5285fC9Da3DD94"
  // );

  // console.log({
  //   balanceOfDai: balanceOfDai.toString(),
  //   balanceOfEth: balanceOfEth.toString(),
  // });

  // const tx = await strategy.emergencyWithdraw(
  //   "0xc2e9f25be6257c210d7adf0d4cd6e3e881ba25f8",
  //   balanceOfDai.toString(),
  //   balanceOfEth.toString(),
  //   {
  //     gasLimit: 1000000,
  //   }
  // );
  // console.log(tx);

  // const tx = await strategy.emergencyBurn(pool.address, "-77820", "-76080", {
  //   gasLimit: 1000000
  // });
  // console.log(tx);

  // await removeLiquidity()

  // // const balanceOfDai = await dai.balanceOf(addresses.owner);
  // // const balanceOfEth = await eth.balanceOf(addresses.owner);

  // // await dai.approve(strategy.address, balanceOfDai);
  // // await eth.approve(strategy.address, balanceOfEth);

  // const oracle = await pool.observe([0, 60]);
  // const ticks = await strategy.getTicks();
  // const daiUnused0 = await dai.balanceOf(strategy.address);
  // const ethUnused1 = await eth.balanceOf(strategy.address);
  // const totalShares = await strategy.totalSupply();
  // const userShares = await strategy.balanceOf(addresses.owner);

  // console.log({
  //   daiunused: daiUnused0,
  //   ethunused: ethUnused1,
  // });
  // console.log("oracle", oracle);
  // console.log("ticks", ticks);
  // console.log("totalShares", totalShares);
  // console.log("userShares", userShares);

  // await removeLiquidity(userShares);

  // console.log("position", position)

  // await swap();

  // await rebalance();
  // await addLiquidity();

  // aggregator = await ethers.getContractAt("Aggregator", addresses.aggregator);

  // pool = await ethers.getContractAt("UniswapV3Pool", addresses.pool);

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

  // console.log(
  //   "balance",
  //   await getDefaultProvider().getBalance(
  //     "0xC58F20d4Cd28303A669826b7A03543aEaC6626ba"
  //   )
  // );

  // const [owner, addr1] = await ethers.getSigners();

  // const tx = await owner.sendTransaction({
  //   to: "0xC58F20d4Cd28303A669826b7A03543aEaC6626ba",
  //   value: ethers.utils.parseEther("0"),
  //   nonce: 26,
  //   gasPrice: BigNumber.from(100000000000),
  // });

  // console.log(tx);

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

async function swap() {
  const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;

  const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9;
  const tx = await strategy.swap(
    false,
    "141161158989040510",
    sqrtPriceLimitX96.toLocaleString("fullwide", { useGrouping: false }),
    {
      gasLimit: 1000000,
    }
  );
  console.log(tx);
}

async function removeLiquidity(_shares) {
  const tx = await strategy.burn(toGwei(1), 0, 0, {
    gasLimit: "1000000",
  });
  console.log(tx);
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

async function rebalance() {
  const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;

  console.log({ sqrtRatioX96 });

  const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.01;

  const tx = await strategy.rebalance([
    ["0", "999665", "-13850", "-13840"],
    ["368130679", "6001550"],
  ]);

  console.log(tx);
}

async function addLiquidity() {
  const tx = await strategy.mint("12000000", "12000000", "0", "0", "0", {
    gasLimit: 10000000,
  });
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
