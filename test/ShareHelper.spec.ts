import { ethers, waffle } from "hardhat";
import { BigNumber, Signer } from "ethers";
import chai from "chai";

const TestERC20Factory = ethers.getContractFactory("TestERC20");
const UniswapV3FactoryFactory = ethers.getContractFactory("UniswapV3Factory");

const ShareHelperTestFactory = ethers.getContractFactory("ShareHelperTest");
const UniswapV3OracleTestFactory = ethers.getContractFactory(
  "UniswapV3OracleTest"
);
const ShareHelperLibrary = ethers.getContractFactory("ShareHelper");
const LiquidityHelperLibrary = ethers.getContractFactory("LiquidityHelper");
const OracleLibraryLibrary = ethers.getContractFactory("OracleLibrary");
const ChainlinkRegistryMockFactory = ethers.getContractFactory(
  "ChainlinkRegistryMock"
)

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
import { OracleLibrary } from "../typechain/OracleLibrary";
import { ChainlinkRegistryMock } from "../typechain/ChainlinkRegistryMock";

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
let shareHelper: ShareHelperTest;
let oracle: UniswapV3OracleTest;
let shareHelperL: ShareHelper;
let liquidityHelper: LiquidityHelper;
let oracleLibrary: OracleLibrary;
let chainlinkRegistry: ChainlinkRegistryMock;

describe("ShareHelper", () => {
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
    shareHelperL = (await (await ShareHelperLibrary).deploy()) as ShareHelper;

    liquidityHelper = (await (
      await LiquidityHelperLibrary
    ).deploy()) as LiquidityHelper;

    // deploy oracleLibrary library
    oracleLibrary = (await (
      await OracleLibraryLibrary
    ).deploy()) as OracleLibrary;

    chainlinkRegistry = (await (
      await ChainlinkRegistryMockFactory
    ).deploy(pool.token0(), pool.token1())) as ChainlinkRegistryMock;

    await chainlinkRegistry.setDecimals(8);
    await chainlinkRegistry.setAnswer(
      expandTo18Decimals(3000),
      expandTo18Decimals(1)
    );    

    const DefiEdgeStrategyFactoryF = await ethers.getContractFactory(
      "DefiEdgeStrategyFactory",
      {
        libraries: {
          OracleLibrary: oracleLibrary.address,
          ShareHelper: shareHelperL.address,
          LiquidityHelper: liquidityHelper.address,
        },
      }
    );

    // deploy strategy factory
    factory = (await DefiEdgeStrategyFactoryF.deploy(
      signers[0].address,
      chainlinkRegistry.address,
      uniswapV3Factory.address
    )) as DefiEdgeStrategyFactory;

    // create strategy
    await factory.createStrategy(
      pool.address,
      signers[0].address,
      [true, true],
      [
        {
          amount0: 0,
          amount1: 0,
          tickLower: calculateTick(2500, 60),
          tickUpper: calculateTick(3500, 60),
        },
      ]
    );

    // get strategy
    strategy = (await ethers.getContractAt(
      "DefiEdgeStrategy",
      await factory.strategyByIndex(await factory.totalIndex())
    )) as DefiEdgeStrategy;

    // // initialize strategy
    // await strategy.initialize();

    // set deviation in strategy
    await strategy.changeAllowedDeviation("10000000000000000"); // 1%

    const PeripheryFactory = ethers.getContractFactory("Periphery", {
      libraries: { LiquidityHelper: liquidityHelper.address },
    });

    periphery = (await (await PeripheryFactory).deploy()) as Periphery;

    // add liquidity to the pool
    await token0.approve(periphery.address, expandTo18Decimals(50000000));
    await token1.approve(periphery.address, expandTo18Decimals(150000000000));

    // transfer tokens to second user for testing
    await token0.transfer(signers[1].address, expandTo18Decimals(1500000));
    await token1.transfer(signers[1].address, expandTo18Decimals(1500000));

    await periphery.mintLiquidity(
      pool.address,
      calculateTick(3000, 60),
      calculateTick(4000, 60),
      expandTo18Decimals(50000000),
      expandTo18Decimals(150000000000),
      signers[0].address
    );

    // increase cardinary
    await pool.increaseObservationCardinalityNext(150);

    // swap tokens
    const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;

    const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9;

    await ethers.provider.send("evm_increaseTime", [1801]);

    await periphery.swap(
      pool.address,
      false,
      "10000000000000000000",
      expandToString(sqrtPriceLimitX96)
    );

    // deploy strategy factory
    shareHelper = (await (
      await ShareHelperTestFactory
    ).deploy()) as ShareHelperTest;

    oracle = (await (
      await UniswapV3OracleTestFactory
    ).deploy()) as UniswapV3OracleTest;
  });

  describe("#calculateShares", async () => {
    it("should issue share as max amount of two when totalAmount0 is 0", async () => {
      const sharesFromContract = await shareHelper.calculateShares(
        pool.address,
        expandTo18Decimals(1),
        expandTo18Decimals(3500),
        0,
        expandTo18Decimals(5000),
        expandTo18Decimals(3500)
      );

      const shares = Math.max(
        parseInt(expandTo18Decimals(1)),
        parseInt(expandTo18Decimals(3500))
      );

      expect(sharesFromContract).to.equal(expandToString(shares));
    });

    it("should issue share as max amount of two when totalAmount1 is 0", async () => {
      const sharesFromContract = await shareHelper.calculateShares(
        pool.address,
        expandTo18Decimals(1),
        expandTo18Decimals(3500),
        expandTo18Decimals(5000),
        0,
        expandTo18Decimals(3500)
      );

      const shares = Math.max(
        parseInt(expandTo18Decimals(1)),
        parseInt(expandTo18Decimals(3500))
      );

      expect(sharesFromContract).to.equal(expandToString(shares));
    });

    it("should issue shares based on the formula", async () => {
      const amount0 = expandTo18Decimals(1);
      const amount1 = expandTo18Decimals(3500);
      const totalAmount0 = expandTo18Decimals(5000);
      const totalAmount1 = expandTo18Decimals(7000);
      const totalShares = expandTo18Decimals(3500);

      const sharesFromContract = await shareHelper.calculateShares(
        pool.address,
        amount0,
        amount1,
        totalAmount0,
        totalAmount1,
        totalShares
      );

      const price = await oracle.consult(pool.address, 60);
      const numerator =
        parseInt(amount0) * parseInt(price.toString()) +
        parseInt(amount1.toString());

      const denominator =
        parseInt(totalAmount0.toString()) * parseInt(price.toString()) +
        parseInt(totalAmount1.toString());

      const share = (parseInt(totalShares) * numerator) / denominator;

      expect(expandToString(share)).to.equal(sharesFromContract);
    });
  });
});

async function approve(address: string, from: string | Signer | Provider) {
  // give approval
  await token0.connect(from).approve(address, expandTo18Decimals(150000000000));
  await token1.connect(from).approve(address, expandTo18Decimals(150000000000));
}
