import { ethers, waffle } from "hardhat";
import { BigNumber, Signer } from "ethers";
import chai from "chai";
import bn from 'bignumber.js';

const TestERC20Factory = ethers.getContractFactory("TestERC20");
const WETH9Factory = ethers.getContractFactory("WETH9");
const UniswapV3FactoryFactory = ethers.getContractFactory("UniswapV3Factory");

const ShareHelperTestFactory = ethers.getContractFactory("TwapShareHelperTest");
const UniswapV3OracleTestFactory = ethers.getContractFactory(
  "UniswapV3OracleTest"
);

const LiquidityHelperLibrary = ethers.getContractFactory("LiquidityHelper");
const OneInchHelperLibrary = ethers.getContractFactory("OneInchHelper");
const OracleLibraryLibrary = ethers.getContractFactory("TwapOracleLibrary");
const ChainlinkRegistryMockFactory = ethers.getContractFactory(
  "ChainlinkRegistryMock"
)
const SwapRouterContract = ethers.getContractFactory(
  "SwapRouter"
);

import { TestERC20 } from "../../typechain/TestERC20";
import { WETH9 } from "../../typechain/WETH9";
import { UniswapV3Factory } from "../../typechain/UniswapV3Factory";
import { UniswapV3Pool } from "../../typechain/UniswapV3Pool";
import { DefiEdgeTwapStrategy } from "../../typechain/DefiEdgeTwapStrategy";
import { TwapStrategyManager } from "../../typechain/TwapStrategyManager";
import { DefiEdgeTwapStrategyDeployer } from "../../typechain/DefiEdgeTwapStrategyDeployer";
import { DefiEdgeTwapStrategyFactory } from "../../typechain/DefiEdgeTwapStrategyFactory";
import { Periphery } from "../../typechain/Periphery";
import { TwapShareHelperTest } from "../../typechain/TwapShareHelperTest";
import { UniswapV3OracleTest } from "../../typechain/UniswapV3OracleTest";
import { TwapShareHelper } from "../../typechain/TwapShareHelper";
import { LiquidityHelper } from "../../typechain/LiquidityHelper";
import { OneInchHelper } from "../../typechain/OneInchHelper";
import { TwapOracleLibrary } from "../../typechain/TwapOracleLibrary";
import { ChainlinkRegistryMock } from "../../typechain/ChainlinkRegistryMock";
import { SwapRouter } from "../../typechain/SwapRouter";

import {
  calculateTick,
  encodePriceSqrt,
  expandTo18Decimals,
  expandToString,
} from "../utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Provider } from "@ethersproject/abstract-provider";

const { deployContract } = waffle;
const { expect } = chai;

let token0: TestERC20;
let token1: TestERC20;
let pool: UniswapV3Pool;
let signers: SignerWithAddress[];
let factory: DefiEdgeTwapStrategyFactory;
let strategy: DefiEdgeTwapStrategy;
let strategyManager: TwapStrategyManager;
let strategyDeplopyer: DefiEdgeTwapStrategyDeployer;
let periphery: Periphery;
let shareHelper: TwapShareHelperTest;
let oracle: UniswapV3OracleTest;
let shareHelperL: TwapShareHelper;
let liquidityHelper: LiquidityHelper;
let oneInchHelper: OneInchHelper;
let oracleLibrary: TwapOracleLibrary;
let chainlinkRegistry: ChainlinkRegistryMock;
let router: SwapRouter;
let weth9: WETH9;

describe("TwapShareHelper", () => {
  beforeEach(async () => {
    signers = await ethers.getSigners();

    // deploy tokens
    token0 = (await (await TestERC20Factory).deploy(18)) as TestERC20;
    token1 = (await (await TestERC20Factory).deploy(18)) as TestERC20;
    weth9 = (await (await WETH9Factory).deploy()) as WETH9;

    // deploy uniswap factory
    const uniswapV3Factory = (await (
      await UniswapV3FactoryFactory
    ).deploy()) as UniswapV3Factory;

    router = (await (
      await SwapRouterContract
    ).deploy(uniswapV3Factory.address, weth9.address)) as SwapRouter;

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
    oracleLibrary = (await (
      await OracleLibraryLibrary
    ).deploy()) as TwapOracleLibrary;

    const ShareHelperLibrary = ethers.getContractFactory("TwapShareHelper");

    // deploy sharehelper library
    shareHelperL = (await (await ShareHelperLibrary).deploy()) as TwapShareHelper;

    liquidityHelper = (await (
      await LiquidityHelperLibrary
    ).deploy()) as LiquidityHelper;

    oneInchHelper = (await (await OneInchHelperLibrary).deploy()) as OneInchHelper;

    const DefiEdgeStrategyDeployerContract = ethers.getContractFactory("DefiEdgeTwapStrategyDeployer",
     {
        libraries: {
          TwapShareHelper: shareHelperL.address,
          TwapOracleLibrary: oracleLibrary.address,
          LiquidityHelper: liquidityHelper.address,
          OneInchHelper: oneInchHelper.address
        }
      }
    );

    strategyDeplopyer = (await (
      await DefiEdgeStrategyDeployerContract
    ).deploy()) as DefiEdgeTwapStrategyDeployer;

    chainlinkRegistry = (await (
      await ChainlinkRegistryMockFactory
    ).deploy(await pool.token0(), await pool.token1())) as ChainlinkRegistryMock;

    await chainlinkRegistry.setDecimals(8);
    await chainlinkRegistry.setAnswer(
      "300000000000",
      "100000000"
    );     

    const DefiEdgeStrategyFactoryF = await ethers.getContractFactory(
      "DefiEdgeTwapStrategyFactory"
    );

    // deploy strategy factory
    factory = (await DefiEdgeStrategyFactoryF.deploy(
      signers[0].address,
      strategyDeplopyer.address,
      chainlinkRegistry.address,
      uniswapV3Factory.address,
      router.address,
      "10000000000000000",
      "10000000000000000"
    )) as DefiEdgeTwapStrategyFactory;

    let useTwap: [boolean, boolean] = [true, false];

    let params = {
      operator: signers[0].address,
      feeTo: signers[1].address,
      managementFeeRate: "500000", // 0.5%
      performanceFeeRate: "500000", // 0.5%
      limit: 0,
      pool: pool.address,
      useTwap: useTwap,
      ticks: [
        {
          amount0: 0,
          amount1: 0,
          tickLower: calculateTick(2500, 60),
          tickUpper: calculateTick(3500, 60),
        },
      ]
    }

    // create strategy
    await factory.createStrategy(params);
    // get strategy
    strategy = (await ethers.getContractAt(
      "DefiEdgeTwapStrategy",
      await factory.strategyByIndex(await factory.totalIndex())
    )) as DefiEdgeTwapStrategy;

    // // initialize strategy
    // await strategy.initialize();

    strategyManager = (await ethers.getContractAt(
      "TwapStrategyManager",
      await strategy.manager()
    )) as TwapStrategyManager;
        
    // set deviation in strategy
    await strategyManager.changeSwapDeviation("10000000000000000"); // 1%

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
    ).deploy()) as TwapShareHelperTest;

    oracle = (await (
      await UniswapV3OracleTestFactory
    ).deploy()) as UniswapV3OracleTest;
    await factory.changeDefaultTwapPeriod(pool.address, 1800);

  });

  describe("#calculateShares", async () => {
    it("should revert if amount0 or amount1 is zero", async () => {
      await expect(shareHelper.calculateShares(
            factory.address,
            chainlinkRegistry.address,
            pool.address,
            strategyManager.address,
            [true, false],
            expandTo18Decimals(0),
            expandTo18Decimals(3500),
            0,
            expandTo18Decimals(5000),
            expandTo18Decimals(4000)
      )).to.be.revertedWith("INSUFFICIENT_AMOUNT")

      await expect(shareHelper.calculateShares(
        factory.address,
        chainlinkRegistry.address,
        pool.address,
        strategyManager.address,
        [true, false],
        expandTo18Decimals(1),
        expandTo18Decimals(0  ),
        0,
        expandTo18Decimals(5000),
        expandTo18Decimals(4000)
      )).to.be.revertedWith("INSUFFICIENT_AMOUNT")
    })

    it("should return correct share amount if total supply is zero", async () => {
      const sharesFromContract = await shareHelper.calculateShares(
        factory.address,
        chainlinkRegistry.address,
        pool.address,
        strategyManager.address,
        [true, false],
        expandTo18Decimals(1),
        expandTo18Decimals(3500),
        expandTo18Decimals(10),
        expandTo18Decimals(35000),
        0
      );

      expect(sharesFromContract).to.eq("64997963790208184507")
    })

    it("should return correct share amount if total supply is not zero", async () => {
      const sharesFromContract = await shareHelper.calculateShares(
        factory.address,
        chainlinkRegistry.address,
        pool.address,
        strategyManager.address,
        [true, false],
        expandTo18Decimals(1),
        expandTo18Decimals(3500),
        expandTo18Decimals(10),
        expandTo18Decimals(35000),
        expandTo18Decimals(100)
      );

      const shares = new bn(expandTo18Decimals(3500)).multipliedBy(expandTo18Decimals(100)).dividedBy(expandTo18Decimals(35000)).toFixed()
    
      expect(sharesFromContract).to.eq(shares)

    })

    it("should return correct share amount if total supply is not zero", async () => {
      const sharesFromContract = await shareHelper.calculateShares(
        factory.address,
        chainlinkRegistry.address,
        pool.address,
        strategyManager.address,
        [true, false],
        expandTo18Decimals(3500),
        expandTo18Decimals(1),
        expandTo18Decimals(35000),
        expandTo18Decimals(10),
        expandTo18Decimals(100)
      );

      const shares = new bn(expandTo18Decimals(3500)).multipliedBy(expandTo18Decimals(100)).dividedBy(expandTo18Decimals(35000)).toFixed()
    
      expect(sharesFromContract).to.eq(shares)

    })
  });

  describe("#getOptimalAmounts", async () => {
    it("should revert if amount0 or amount1 is zero", async () => {
      await expect(shareHelper.getOptimalAmounts(
        0,
        100,
        100,
        100,
        1000,
        2000
      )).to.be.revertedWith("INSUFFICIENT_AMOUNT")
            
      await expect(shareHelper.getOptimalAmounts(
        100,
        0,
        100,
        100,
        1000,
        2000
      )).to.be.revertedWith("INSUFFICIENT_AMOUNT")
    })

    it("should return amount0 & amount1 same if totalAmounts are zero", async () => {
      var { amount0, amount1 } = await shareHelper.getOptimalAmounts(
        123,
        321,
        100,
        100,
        0,
        0
      )

      expect(amount0).to.eq(123)
      expect(amount1).to.eq(321)
    })

    it("should revert if amount1Min amount is not sufficient", async () => {
      await expect(shareHelper.getOptimalAmounts(
        100,
        200,
        100,
        200,
        10,
        10
      )).to.be.revertedWith("INSUFFICIENT_AMOUNT_1")
    })

    it("should return correct amount0 and amount1Optimal", async () => {
      var { amount0, amount1 } = await shareHelper.getOptimalAmounts(
        100,
        200,
        100,
        100,
        1000,
        1000
      )

      expect(amount0).to.eq(100)
      expect(amount1).to.eq(100)
    })

    it("should revert if amount0Min amount is not sufficient", async () => {
      await expect(shareHelper.getOptimalAmounts(
        200,
        100,
        200,
        100,
        1000,
        1000
      )).to.be.revertedWith("INSUFFICIENT_AMOUNT_0")
    })

    it("should return correct amount0Optimal and amount1", async () => {
      var { amount0, amount1 } = await shareHelper.getOptimalAmounts(
        200,
        100,
        100,
        100,
        1000,
        1000
      )

      expect(amount0).to.eq(100)
      expect(amount1).to.eq(100)
    })
  })
});

async function approve(address: string, from: string | Signer | Provider) {
  // give approval
  await token0.connect(from).approve(address, expandTo18Decimals(150000000000));
  await token1.connect(from).approve(address, expandTo18Decimals(150000000000));
}
