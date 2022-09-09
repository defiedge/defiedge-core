import { ethers, waffle } from "hardhat";
import { BigNumber, Signer } from "ethers";
import chai from "chai";

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
const OracleLibraryTestContract = ethers.getContractFactory("TwapOracleLibraryTest");
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
import { TwapOracleLibraryTest } from "../../typechain/TwapOracleLibraryTest";
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
let oracleLibraryTest: TwapOracleLibraryTest;
let chainlinkRegistry: ChainlinkRegistryMock;
let router: SwapRouter;
let weth9: WETH9;
let uniswapV3Factory: UniswapV3Factory;

describe("TwapOracleLibrary", () => {
  beforeEach(async () => {
    signers = await ethers.getSigners();

    // deploy tokens
    token0 = (await (await TestERC20Factory).deploy(18)) as TestERC20;
    token1 = (await (await TestERC20Factory).deploy(18)) as TestERC20;
    weth9 = (await (await WETH9Factory).deploy()) as WETH9;

    // deploy uniswap factory
    uniswapV3Factory = (await (
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

    // deploy oracleLibrary test contract
    oracleLibraryTest = (await (
      await OracleLibraryTestContract
    ).deploy()) as TwapOracleLibraryTest;

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

  describe("#normalise", async () => {

    it("should return correct normalized amount", async () => {
      let token6Decimal = (await (await TestERC20Factory).deploy(6)) as TestERC20;
      let token8Decimal = (await (await TestERC20Factory).deploy(8)) as TestERC20;
      let token18Decimal = (await (await TestERC20Factory).deploy(18)) as TestERC20;

      expect(await oracleLibraryTest.normalise(token6Decimal.address, "1000000")).to.eq(expandTo18Decimals(1))
      expect(await oracleLibraryTest.normalise(token8Decimal.address, "100000000")).to.eq(expandTo18Decimals(1))
      expect(await oracleLibraryTest.normalise(token18Decimal.address, expandTo18Decimals(1))).to.eq(expandTo18Decimals(1))
    })

  })

  describe("#getUniswapPrice", async () => {

    it("should return correct uniswap price", async () => {
      expect(await oracleLibraryTest.getUniswapPrice(pool.address)).to.equal("3009711562429121195141");

      // swap tokens
      const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;

      const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.1;

      await periphery.swap(
        pool.address,
        false,
        "10000000000000000000",
        expandToString(sqrtPriceLimitX96)
      );

      expect(await oracleLibraryTest.getUniswapPrice(pool.address)).to.equal("3009711562482602675097");

      await periphery.swap(
        pool.address,
        false,
        "10000000000000000000",
        expandToString(sqrtPriceLimitX96)
      );

      expect(await oracleLibraryTest.getUniswapPrice(pool.address)).to.equal("3009711562536084155054");

    })
  })

  describe("#getChainlinkPrice", async () => {
  
    it("should return correct chainlink price", async () => {
      let token0A = await pool.token0();
      let token1A = await pool.token1();
      expect(await oracleLibraryTest.getChainlinkPrice(chainlinkRegistry.address, token0A, token1A, 3600)).to.equal("3000000000000000000000");

      await chainlinkRegistry.setAnswer(
        "400000000000",
        "100000000"
      );    

      expect(await oracleLibraryTest.getChainlinkPrice(chainlinkRegistry.address, token0A, token1A, 3600)).to.equal("4000000000000000000000");

      let USD = "0x0000000000000000000000000000000000000348"

      expect(await oracleLibraryTest.getChainlinkPrice(chainlinkRegistry.address, token0A, USD, 3600)).to.equal("4000000000000000000000");
      expect(await oracleLibraryTest.getChainlinkPrice( chainlinkRegistry.address, token1A, USD, 3600)).to.equal("1000000000000000000");

    })

    it("should return price zero if validPeriod is zero", async () => {
      let token0A = await pool.token0();
      let token1A = await pool.token1();
      await expect(oracleLibraryTest.getChainlinkPrice(chainlinkRegistry.address, token0A, token1A, 0)).to.be.revertedWith("OLD_PRICE");

      await chainlinkRegistry.setAnswer(
        "400000000000",
        "100000000"
      );    

      await expect(oracleLibraryTest.getChainlinkPrice(chainlinkRegistry.address, token0A, token1A, 0)).to.be.revertedWith("OLD_PRICE");

      let USD = "0x0000000000000000000000000000000000000348"

      await expect(oracleLibraryTest.getChainlinkPrice(chainlinkRegistry.address, token0A, USD, 0)).to.be.revertedWith("OLD_PRICE");
      await expect(oracleLibraryTest.getChainlinkPrice( chainlinkRegistry.address, token1A, USD, 0)).to.be.revertedWith("OLD_PRICE");

    })
  })

  describe("#getPriceInUSD", async () => {
    it("should return correct token0 price in USD", async () => {
      let useTwap: [boolean, boolean] = [true, false];
      const price = await oracleLibraryTest.getPriceInUSD(factory.address, pool.address, chainlinkRegistry.address, await pool.token0(), useTwap, strategyManager.address);
      expect(price).to.eq("2999796379020818450736") // 1 ETH = ~3000 USD
    })

    it("should return correct token1 price in USD", async () => {
      let useTwap: [boolean, boolean] = [true, false];
      const price = await oracleLibraryTest.getPriceInUSD(factory.address, pool.address, chainlinkRegistry.address, await pool.token1(), useTwap, strategyManager.address);
      expect(price).to.eq("1000000000000000000") // 1 DAI = ~1 USD
    })

    it("should return correct token0 & token1 price in USD - pool of ETH-USDT - decimals 18-6 - twap for token0", async () => {
      let token2 = (await (await TestERC20Factory).deploy(6)) as TestERC20;
      await uniswapV3Factory.createPool(token1.address, token2.address, "3000");
      
      // get uniswap pool instance
      let ethUsdtpool = (await ethers.getContractAt("UniswapV3Pool",await uniswapV3Factory.getPool(token1.address, token2.address, "3000"))) as UniswapV3Pool;

      let chainlinkRegistryEthUsdt = (await (
          await ChainlinkRegistryMockFactory
      ).deploy(await ethUsdtpool.token0(), await ethUsdtpool.token1())) as ChainlinkRegistryMock;

      await chainlinkRegistryEthUsdt.setDecimals(8);
      
      let poolToken0 = await ethUsdtpool.token0();

      // add liquidity to the pool
      await token1.approve(periphery.address, expandTo18Decimals(50000000));
      await token2.approve(periphery.address, expandTo18Decimals(150000000000));
      
      if(poolToken0 == token1.address){
        console.log("in if")
        // initialize the pool
        await ethUsdtpool.initialize(
            encodePriceSqrt(
              expandTo18Decimals(10),
              "30000000000"
            )
        );
  
        await periphery.mintLiquidity(
            ethUsdtpool.address,
            calculateTick(3000, 60),
            calculateTick(4000, 60),
            expandTo18Decimals(10),
            "30000000000",
            signers[0].address
        );

        await chainlinkRegistryEthUsdt.setAnswer(
          "0",
          "100000000"
        );
      } else {
        console.log("in else")

        // initialize the pool
        await ethUsdtpool.initialize(
          encodePriceSqrt(
            "30000000000",
            expandTo18Decimals(10),
          )
        );

        await periphery.mintLiquidity(
            ethUsdtpool.address,
            calculateTick(3000, 60),
            calculateTick(4000, 60),
            "30000000000",
            expandTo18Decimals(10),
            signers[0].address
        );


        await chainlinkRegistryEthUsdt.setAnswer(
          "0",
          "300000000000"
        );
      }

      // increase cardinary
      await ethUsdtpool.increaseObservationCardinalityNext(150);

      // swap tokens
      const sqrtRatioX96 = (await ethUsdtpool.slot0()).sqrtPriceX96;

      const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9;

      await ethers.provider.send("evm_increaseTime", [1801]);

      await periphery.swap(
          ethUsdtpool.address,
          false,
          "10000000000000000000",
          expandToString(sqrtPriceLimitX96)
      );

      let useTwap: [boolean, boolean] = [true, false];
      const price0 = await oracleLibraryTest.getPriceInUSD(factory.address, ethUsdtpool.address, chainlinkRegistryEthUsdt.address, await ethUsdtpool.token0(), useTwap, strategyManager.address);
      const price1 = await oracleLibraryTest.getPriceInUSD(factory.address, ethUsdtpool.address, chainlinkRegistryEthUsdt.address, await ethUsdtpool.token1(), useTwap, strategyManager.address);
      if(poolToken0 == token1.address){
        expect(price0).to.eq("2999804309000000000000") // 1 USDT = ~1 USD
        expect(price1).to.eq("1000000000000000000") // 1 ETH = ~3000 USD
      } else {
        expect(price0).to.eq("999965237739678000") // 1 USDT = ~0.9999 USD
        expect(price1).to.eq("3000000000000000000000") // 1 ETH = ~3000 USD
      }
      
    })

    it("should return correct token0 & token1 price in USD - pool of ETH-USDT - decimals 18-6 - twap for token1", async () => {
      let token2 = (await (await TestERC20Factory).deploy(6)) as TestERC20;
      await uniswapV3Factory.createPool(token1.address, token2.address, "3000");
      
      // get uniswap pool instance
      let ethUsdtpool = (await ethers.getContractAt("UniswapV3Pool",await uniswapV3Factory.getPool(token1.address, token2.address, "3000"))) as UniswapV3Pool;

      let chainlinkRegistryEthUsdt = (await (
          await ChainlinkRegistryMockFactory
      ).deploy(await ethUsdtpool.token0(), await ethUsdtpool.token1())) as ChainlinkRegistryMock;

      await chainlinkRegistryEthUsdt.setDecimals(8);
      
      let poolToken0 = await ethUsdtpool.token0();

      // add liquidity to the pool
      await token1.approve(periphery.address, expandTo18Decimals(50000000));
      await token2.approve(periphery.address, expandTo18Decimals(150000000000));
      
      if(poolToken0 == token1.address){
        console.log("in if")
        // initialize the pool
        await ethUsdtpool.initialize(
            encodePriceSqrt(
              expandTo18Decimals(10),
              "30000000000"
            )
        );
  
        await periphery.mintLiquidity(
            ethUsdtpool.address,
            calculateTick(3000, 60),
            calculateTick(4000, 60),
            expandTo18Decimals(10),
            "30000000000",
            signers[0].address
        );

        await chainlinkRegistryEthUsdt.setAnswer(
          "300000000000",
          "0"
        );
      } else {
        console.log("in else")

        // initialize the pool
        await ethUsdtpool.initialize(
          encodePriceSqrt(
            "30000000000",
            expandTo18Decimals(10),
          )
        );

        await periphery.mintLiquidity(
            ethUsdtpool.address,
            calculateTick(3000, 60),
            calculateTick(4000, 60),
            "30000000000",
            expandTo18Decimals(10),
            signers[0].address
        );


        await chainlinkRegistryEthUsdt.setAnswer(
          "100000000",
          "0"
        );
      }

      // increase cardinary
      await ethUsdtpool.increaseObservationCardinalityNext(150);

      // swap tokens
      const sqrtRatioX96 = (await ethUsdtpool.slot0()).sqrtPriceX96;

      const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9;

      await ethers.provider.send("evm_increaseTime", [1801]);

      await periphery.swap(
          ethUsdtpool.address,
          false,
          "10000000000000000000",
          expandToString(sqrtPriceLimitX96)
      );

      let useTwap: [boolean, boolean] = [false, true];
      const price0 = await oracleLibraryTest.getPriceInUSD(factory.address, ethUsdtpool.address, chainlinkRegistryEthUsdt.address, await ethUsdtpool.token0(), useTwap, strategyManager.address);
      const price1 = await oracleLibraryTest.getPriceInUSD(factory.address, ethUsdtpool.address, chainlinkRegistryEthUsdt.address, await ethUsdtpool.token1(), useTwap, strategyManager.address);
      if(poolToken0 == token1.address){
        expect(price0).to.eq("3000000000000000000000") // 1 ETH = ~3000 USD
        expect(price1).to.eq("1000065234588606000") // 1 USDT = ~1 USD
      } else {
        expect(price0).to.eq("1000000000000000000") // 1 USDT = ~0.9999 USD
        expect(price1).to.eq("3000104290406336254148") // 1 ETH = ~3000 USD
      }
      
    })

    it("should return correct token0 & token1 price in USD - pool of ETH-WBTC - decimals 18-8 - twap for token0", async () => {
      let token2 = (await (await TestERC20Factory).deploy(8)) as TestERC20;

      await uniswapV3Factory.createPool(token1.address, token2.address, "3000");
      
      // get uniswap pool instance
      let ethWbtcpool = (await ethers.getContractAt("UniswapV3Pool",await uniswapV3Factory.getPool(token1.address, token2.address, "3000"))) as UniswapV3Pool;

      let chainlinkRegistryWbtcUsdt = (await (
        await ChainlinkRegistryMockFactory
      ).deploy(await ethWbtcpool.token0(), await ethWbtcpool.token1())) as ChainlinkRegistryMock;

      await chainlinkRegistryWbtcUsdt.setDecimals(8);
      
      let poolToken0 = await ethWbtcpool.token0();

      // add liquidity to the pool
      await token1.approve(periphery.address, expandTo18Decimals(50000000));
      await token2.approve(periphery.address, expandTo18Decimals(150000000000));

      if(poolToken0 == token1.address){
        console.log("in if")
        // initialize the pool
        await ethWbtcpool.initialize(
          encodePriceSqrt(
            expandTo18Decimals(12),
            "100000000",
          )
        );

        await periphery.mintLiquidity(
        ethWbtcpool.address,
          calculateTick(3000, 60),
          calculateTick(4000, 60),
          expandTo18Decimals(12),
          "100000000",
          signers[0].address
        );

        await chainlinkRegistryWbtcUsdt.setAnswer(
          "0",
          "3600000000000",
        );

      } else {
        // initialize the pool
        await ethWbtcpool.initialize(
            encodePriceSqrt(
                "100000000",
                expandTo18Decimals(12)
            )
        );
  
        await periphery.mintLiquidity(
          ethWbtcpool.address,
            calculateTick(3000, 60),
            calculateTick(4000, 60),
            "100000000",
            expandTo18Decimals(12),
            signers[0].address
        );

        await chainlinkRegistryWbtcUsdt.setAnswer(
          "0",
          "300000000000"
        );
      }

      // increase cardinary
      await ethWbtcpool.increaseObservationCardinalityNext(150);

      // swap tokens
      const sqrtRatioX96 = (await ethWbtcpool.slot0()).sqrtPriceX96;

      const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9;

      await ethers.provider.send("evm_increaseTime", [1801]);

      await periphery.swap(
        ethWbtcpool.address,
          false,
          "1000000",
          expandToString(sqrtPriceLimitX96)
      );

      let useTwap: [boolean, boolean] = [true, false];
      const price0 = await oracleLibraryTest.getPriceInUSD(factory.address, ethWbtcpool.address, chainlinkRegistryWbtcUsdt.address, await ethWbtcpool.token0(), useTwap, strategyManager.address);
      const price1 = await oracleLibraryTest.getPriceInUSD(factory.address, ethWbtcpool.address, chainlinkRegistryWbtcUsdt.address, await ethWbtcpool.token1(), useTwap, strategyManager.address);
      if(poolToken0 == token1.address){
        expect(price0).to.eq("2999799000000000000000") // 1 ETH = ~3000 USD
        expect(price1).to.eq("36000000000000000000000") // 1 WBTC = ~25000 USD
      } else {
        expect(price0).to.eq("35998808610700394340000") // 1 WBTC = ~36000 USD
        expect(price1).to.eq("3000000000000000000000") // 1 ETH = ~3000 USD
      }

    })

  it("should return correct token0 & token1 price in USD - pool of ETH-WBTC - decimals 18-8 - twap for token1", async () => {
    let token2 = (await (await TestERC20Factory).deploy(8)) as TestERC20;
    await uniswapV3Factory.createPool(token1.address, token2.address, "3000");
    
    // get uniswap pool instance
    let ethWbtcpool = (await ethers.getContractAt("UniswapV3Pool",await uniswapV3Factory.getPool(token1.address, token2.address, "3000"))) as UniswapV3Pool;

    let chainlinkRegistryWbtcUsdt = (await (
      await ChainlinkRegistryMockFactory
    ).deploy(await ethWbtcpool.token0(), await ethWbtcpool.token1())) as ChainlinkRegistryMock;

    await chainlinkRegistryWbtcUsdt.setDecimals(8);
    
    let poolToken0 = await ethWbtcpool.token0();

    // add liquidity to the pool
    await token1.approve(periphery.address, expandTo18Decimals(50000000));
    await token2.approve(periphery.address, expandTo18Decimals(150000000000));

    if(poolToken0 == token1.address){
      console.log("in if")
      // initialize the pool
      await ethWbtcpool.initialize(
        encodePriceSqrt(
          expandTo18Decimals(12),
          "100000000",
        )
      );

      await periphery.mintLiquidity(
      ethWbtcpool.address,
        calculateTick(3000, 60),
        calculateTick(4000, 60),
        expandTo18Decimals(12),
        "100000000",
        signers[0].address
      );

      await chainlinkRegistryWbtcUsdt.setAnswer(
        "300000000000",
        "0",
      );

    } else {
      // initialize the pool
      await ethWbtcpool.initialize(
          encodePriceSqrt(
              "100000000",
              expandTo18Decimals(12)
          )
      );

      await periphery.mintLiquidity(
        ethWbtcpool.address,
          calculateTick(3000, 60),
          calculateTick(4000, 60),
          "100000000",
          expandTo18Decimals(12),
          signers[0].address
      );

      await chainlinkRegistryWbtcUsdt.setAnswer(
        "3600000000000",
        "0"
      );
    }

    // increase cardinary
    await ethWbtcpool.increaseObservationCardinalityNext(150);

    // swap tokens
    const sqrtRatioX96 = (await ethWbtcpool.slot0()).sqrtPriceX96;

    const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9;

    await ethers.provider.send("evm_increaseTime", [1801]);

    await periphery.swap(
      ethWbtcpool.address,
        false,
        "1000000",
        expandToString(sqrtPriceLimitX96)
    );

    let useTwap: [boolean, boolean] = [false, true];
    const price0 = await oracleLibraryTest.getPriceInUSD(factory.address, ethWbtcpool.address, chainlinkRegistryWbtcUsdt.address, await ethWbtcpool.token0(), useTwap, strategyManager.address);
    const price1 = await oracleLibraryTest.getPriceInUSD(factory.address, ethWbtcpool.address, chainlinkRegistryWbtcUsdt.address, await ethWbtcpool.token1(), useTwap, strategyManager.address);
    if(poolToken0 == token1.address){
      expect(price0).to.eq("3000000000000000000000") // 1 ETH = ~3000 USD
      expect(price1).to.eq("36002412161614828191000") // 1 WBTC = ~25000 USD
    } else {
      expect(price0).to.eq("36000000000000000000000") // 1 WBTC = ~36000 USD
      expect(price1).to.eq("3000099285727410276000") // 1 ETH = ~3000 USD
    }

  })

})

  describe("#getPriceInUSD", async () => {
  
    it("should return correct price", async () => {
      let useTwap: [boolean, boolean] = [true, false];
      // token 0 - chainink
      expect(await oracleLibraryTest.getPriceInUSD(factory.address, pool.address, chainlinkRegistry.address, await pool.token0(), useTwap, strategyManager.address)).to.equal("2999796379020818450736");
   
      // token 1 - chainink
      expect(await oracleLibraryTest.getPriceInUSD(factory.address, pool.address, chainlinkRegistry.address, await pool.token1(), useTwap, strategyManager.address)).to.equal("1000000000000000000");
   
      // token 0 - uniswapv3 twap
      expect(await oracleLibraryTest.getPriceInUSD(factory.address, pool.address, chainlinkRegistry.address, await pool.token0(), useTwap, strategyManager.address)).to.equal("2999796379020818450736");
    
      // token 1 - uniswapv3 twap
      expect(await oracleLibraryTest.getPriceInUSD(factory.address, pool.address, chainlinkRegistry.address, await pool.token1(), useTwap, strategyManager.address)).to.equal("1000000000000000000");
    })
  })

  describe("#isSwapExceedDeviation", async () => {

    it("should return true if swap exceeds deviation", async () => {
      expect(await oracleLibraryTest.isSwapExceedDeviation(
        factory.address, 
        pool.address, 
        chainlinkRegistry.address,
        expandTo18Decimals(1),
        expandTo18Decimals(3500),
        await pool.token0(),
        await pool.token1(),
        strategyManager.address,
        [true, false]
      )).to.equal(true);

      expect(await oracleLibraryTest.isSwapExceedDeviation(
        factory.address, 
        pool.address, 
        chainlinkRegistry.address,
        expandTo18Decimals(1),
        expandTo18Decimals(3500),
        await pool.token0(),
        await pool.token1(),
        strategyManager.address,
        [false, true]
      )).to.equal(true);
    })

    it("should return false if swap doesn't exceeds deviation", async () => {
      expect(await oracleLibraryTest.isSwapExceedDeviation(
        factory.address, 
        pool.address, 
        chainlinkRegistry.address,
        expandTo18Decimals(1),
        expandTo18Decimals(3000),
        await pool.token0(),
        await pool.token1(),
        strategyManager.address,
        [true, false]
      )).to.equal(false);

      expect(await oracleLibraryTest.isSwapExceedDeviation(
        factory.address, 
        pool.address, 
        chainlinkRegistry.address,
        expandTo18Decimals(1),
        expandTo18Decimals(3000),
        await pool.token0(),
        await pool.token1(),
        strategyManager.address,
        [false, true]
      )).to.equal(false);
    })
  })

  describe("#allowSwap", async () => {
    it("should return false if swap is not allowed", async () => {
      expect(await oracleLibraryTest.allowSwap(
        pool.address, 
        factory.address,
        expandTo18Decimals(1),
        expandTo18Decimals(3500),
        await pool.token0(),
        await pool.token1(),
        strategyManager.address,
        [true, false]
      )).to.equal(false);

      expect(await oracleLibraryTest.allowSwap(
        pool.address, 
        factory.address,
        expandTo18Decimals(1),
        expandTo18Decimals(3500),
        await pool.token0(),
        await pool.token1(),
        strategyManager.address,
        [false, true]
      )).to.equal(false);
    })

    it("should return true if swap is allowed", async () => {
      expect(await oracleLibraryTest.allowSwap(
        pool.address, 
        factory.address,
        expandTo18Decimals(1),
        expandTo18Decimals(3000),
        await pool.token0(),
        await pool.token1(),
        strategyManager.address,
        [true, false]
      )).to.equal(true);

      expect(await oracleLibraryTest.allowSwap(
        pool.address, 
        factory.address,
        expandTo18Decimals(1),
        expandTo18Decimals(3000),
        await pool.token0(),
        await pool.token1(),
        strategyManager.address,
        [false, true]
      )).to.equal(true);
    })

  })
});

async function approve(address: string, from: string | Signer | Provider) {
  // give approval
  await token0.connect(from).approve(address, expandTo18Decimals(150000000000));
  await token1.connect(from).approve(address, expandTo18Decimals(150000000000));
}
