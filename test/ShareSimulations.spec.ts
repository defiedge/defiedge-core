import { ethers, waffle } from "hardhat";
import { BigNumber, Signer } from "ethers";
import chai from "chai";

const TestERC20Factory = ethers.getContractFactory("TestERC20");
const UniswapV3FactoryFactory = ethers.getContractFactory("UniswapV3Factory");

const ShareHelperTestFactory = ethers.getContractFactory("ShareHelperTest");
const UniswapV3OracleTestFactory = ethers.getContractFactory(
  "UniswapV3OracleTest"
);
const ShareHelperLibrary = ethers.getContractFactory("ShareHelper")
const LiquidityHelperLibrary = ethers.getContractFactory("LiquidityHelper")

import { TestERC20 } from "../typechain/TestERC20";
import { UniswapV3Factory } from "../typechain/UniswapV3Factory";
import { UniswapV3Pool } from "../typechain/UniswapV3Pool";
import { DefiEdgeStrategy } from "../typechain/DefiEdgeStrategy";
import { DefiEdgeStrategyFactory } from "../typechain/DefiEdgeStrategyFactory";
import { Periphery } from "../typechain/Periphery";
import { ShareHelperTest } from "../typechain/ShareHelperTest";
import { UniswapV3OracleTest } from "../typechain/UniswapV3OracleTest";
import { ShareHelper } from "../typechain/ShareHelper";
import { LiquidityHelper } from "../typechain/LiquidityHelper";

import {
  calculateTick,
  encodePriceSqrt,
  expandTo18Decimals,
  expandToString,
} from "./utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Provider } from "@ethersproject/abstract-provider";

const { deployContract } = waffle;
const { expect } = chai;

let token0: TestERC20;
let token1: TestERC20;
let pool: UniswapV3Pool;
let signers: SignerWithAddress[];
let factory;
let strategy: DefiEdgeStrategy;
let periphery: Periphery;
let shareHelper: ShareHelper;
let oracle: UniswapV3OracleTest;
let liquidityHelper: LiquidityHelper;

describe("Share Simulations", () => {
  beforeEach(async () => {
    signers = await ethers.getSigners();

    // deploy tokens
    token0 = (await (await TestERC20Factory).deploy(18)) as TestERC20;
    token1 = (await (await TestERC20Factory).deploy(18)) as TestERC20;

    // deploy uniswap factory
    const uniswapV3Factory = (await (
      await UniswapV3FactoryFactory
    ).deploy()) as UniswapV3Factory;

    await uniswapV3Factory.createPool(token0.address, token1.address, "3000");
    // get uniswap pool instance
    pool = (await ethers.getContractAt(
      "UniswapV3Pool",
      await uniswapV3Factory.getPool(token0.address, token1.address, "3000")
    )) as UniswapV3Pool;

    // initialize the pool
    await pool.initialize(
      encodePriceSqrt(
        expandTo18Decimals(50000000),
        expandTo18Decimals(150000000000)
      )
    );

    // deploy sharehelper library
    shareHelper = (await (
      await ShareHelperLibrary
    ).deploy()) as ShareHelper;
            
    liquidityHelper = (await (
      await LiquidityHelperLibrary
    ).deploy()) as LiquidityHelper;

    const DefiEdgeStrategyFactoryF = await ethers.getContractFactory(
      "DefiEdgeStrategyFactory", 
      {
        libraries: { ShareHelper: shareHelper.address, LiquidityHelper: liquidityHelper.address },
      }
    );

    // deploy strategy factory
    factory = (await DefiEdgeStrategyFactoryF.deploy(signers[0].address, uniswapV3Factory.address)) as DefiEdgeStrategyFactory;

    // create strategy
    await factory.createStrategy(pool.address, signers[0].address, [
      {
        amount0: 0,
        amount1: 0,
        tickLower: calculateTick(1 / 3500, 60),
        tickUpper: calculateTick(1 / 2500, 60),
      },
    ]);

    // get strategy
    strategy = (await ethers.getContractAt(
      "DefiEdgeStrategy",
      await factory.strategyByIndex(await factory.totalIndex())
    )) as DefiEdgeStrategy;

    // // initialize strategy
    // await strategy.initialize();

    // set deviation in strategy
    await strategy.changeAllowedDeviation("50000000000000000") // 5%

    const PeripheryFactory = ethers.getContractFactory("Periphery",
    {
      libraries: { LiquidityHelper: liquidityHelper.address }
    });

    periphery = (await (await PeripheryFactory).deploy()) as Periphery;

    // add liquidity to the pool
    await token0.approve(
      periphery.address,
      expandTo18Decimals(150000000000000)
    );
    await token1.approve(
      periphery.address,
      expandTo18Decimals(500000000000000)
    );

    // transfer tokens to second user for testing
    await token0.transfer(signers[1].address, expandTo18Decimals(1500000));
    await token1.transfer(signers[1].address, expandTo18Decimals(1500000));

    await periphery.mintLiquidity(
      pool.address,
      calculateTick(1 / 4000, 60),
      calculateTick(1 / 3000, 60),
      expandTo18Decimals(150000000000),
      expandTo18Decimals(50000000),
      signers[0].address
    );

    // increase cardinary
    await pool.increaseObservationCardinalityNext(150);

    // swap tokens
    const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;

    const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9;

    await ethers.provider.send("evm_increaseTime", [1800]);

    await periphery.swap(
      pool.address,
      false,
      "100000000000000000",
      expandToString(sqrtPriceLimitX96)
    );

    // deploy strategy factory
    shareHelper = (await (
      await ShareHelperLibrary
    ).deploy()) as ShareHelper;

    oracle = (await (
      await UniswapV3OracleTestFactory
    ).deploy()) as UniswapV3OracleTest;
  });

  describe("#Share", async () => {
    it("should be able to remove same liquidity after rebalance", async () => {
      await approve(strategy.address, signers[0]);

      console.log("👨‍💻  added by user 1");
      await strategy.mint(
        expandTo18Decimals(350000),
        expandTo18Decimals(100),
        0,
        0,
        0
      );

      await ethers.provider.send("evm_increaseTime", [1800]);

      // console.log("👨‍💻  rebalancing");

      await strategy.rebalance([
        {
          amount0: expandTo18Decimals(1),
          amount1: expandTo18Decimals(1),
          tickLower: calculateTick(1 / 3600, 60),
          tickUpper: calculateTick(1 / 2500, 60),
        },
      ]);

      await approve(strategy.address, signers[1]);

      console.log("👨‍💻  added by user 2");
      await strategy
        .connect(signers[1])
        .mint(expandTo18Decimals(100), expandTo18Decimals(350000), 0, 0, 0);

      console.log("👨‍💻 user 0 is removing");
      await strategy.connect(signers[0]).burn("100000000000000000000", 0, 0);

      console.log("👨‍💻  user 1 is removing");
      await strategy.connect(signers[1]).burn("350000000000000000007000", 0, 0);

      console.log("totalSupply", await strategy.totalSupply());
    });
  });
});

async function approve(address: string, from: string | Signer | Provider) {
  // give approval
  await token0
    .connect(from)
    .approve(address, expandTo18Decimals(1500000000000));
  await token1
    .connect(from)
    .approve(address, expandTo18Decimals(1500000000000));
}
