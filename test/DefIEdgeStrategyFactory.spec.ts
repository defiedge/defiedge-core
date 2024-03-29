import { ethers, waffle } from "hardhat";
import { BigNumber, utils, Signer, constants } from "ethers";
import chai from "chai";

const TestERC20Factory = ethers.getContractFactory("TestERC20");
const UniswapV3FactoryFactory = ethers.getContractFactory("UniswapV3Factory");
const WETH9Factory = ethers.getContractFactory("WETH9");

const UniswapV3OracleTestFactory = ethers.getContractFactory(
  "UniswapV3OracleTest"
);

const LiquidityHelperLibrary = ethers.getContractFactory("LiquidityHelper");
const OneInchHelperLibrary = ethers.getContractFactory("OneInchHelper");
const OracleLibraryLibrary = ethers.getContractFactory("OracleLibrary");
const ChainlinkRegistryMockFactory = ethers.getContractFactory(
  "ChainlinkRegistryMock"
)
const SwapRouterContract = ethers.getContractFactory(
  "SwapRouter"
);


import { TestERC20 } from "../typechain/TestERC20";
import { WETH9 } from "../typechain/WETH9";
import { UniswapV3Factory } from "../typechain/UniswapV3Factory";
import { UniswapV3Pool } from "../typechain/UniswapV3Pool";
import { DefiEdgeStrategy } from "../typechain/DefiEdgeStrategy";
import { StrategyManager } from "../typechain/StrategyManager";
import { DefiEdgeStrategyDeployer } from "../typechain/DefiEdgeStrategyDeployer";
import { DefiEdgeStrategyFactory } from "../typechain/DefiEdgeStrategyFactory";
import { Periphery } from "../typechain/Periphery";
import { UniswapV3OracleTest } from "../typechain/UniswapV3OracleTest";
import { ShareHelper } from "../typechain/ShareHelper";
import { LiquidityHelper } from "../typechain/LiquidityHelper";
import { OneInchHelper } from "../typechain/OneInchHelper";
import { OracleLibrary } from "../typechain/OracleLibrary";
import { ChainlinkRegistryMock } from "../typechain/ChainlinkRegistryMock";
import { SwapRouter } from "../typechain/SwapRouter";

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
let factory: DefiEdgeStrategyFactory;
let strategy: DefiEdgeStrategy;
let strategyManager: StrategyManager;
let strategyDeplopyer: DefiEdgeStrategyDeployer;
let periphery: Periphery;
let oracle: UniswapV3OracleTest;
let shareHelper: ShareHelper;
let liquidityHelper: LiquidityHelper;
let oneInchHelper: OneInchHelper;
let oracleLibrary: OracleLibrary;
let chainlinkRegistry: ChainlinkRegistryMock;
let router: SwapRouter;
let weth9: WETH9;
let uniswapV3Factory: UniswapV3Factory;

describe("DefiEdgeStrategyFactory", () => {
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
    ).deploy()) as OracleLibrary;

    const ShareHelperLibrary = ethers.getContractFactory("ShareHelper");
    
    // deploy sharehelper library
    shareHelper = (await (await ShareHelperLibrary).deploy()) as ShareHelper;

    liquidityHelper = (await (
      await LiquidityHelperLibrary
    ).deploy()) as LiquidityHelper;

    oneInchHelper = (await (await OneInchHelperLibrary).deploy()) as OneInchHelper;

    const DefiEdgeStrategyDeployerContract = ethers.getContractFactory("DefiEdgeStrategyDeployer",
     {
        libraries: {
          ShareHelper: shareHelper.address,
          OracleLibrary: oracleLibrary.address,
          LiquidityHelper: liquidityHelper.address,
          OneInchHelper: oneInchHelper.address
        }
      }
    );

    strategyDeplopyer = (await (
      await DefiEdgeStrategyDeployerContract
    ).deploy()) as DefiEdgeStrategyDeployer;

    chainlinkRegistry = (await (
      await ChainlinkRegistryMockFactory
    ).deploy(await pool.token0(), await pool.token1())) as ChainlinkRegistryMock;

    await chainlinkRegistry.setDecimals(8);
    await chainlinkRegistry.setAnswer(
      "300000000000",
      "100000000"
    ); 

    const DefiEdgeStrategyFactoryF = await ethers.getContractFactory(
      "DefiEdgeStrategyFactory"
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
    )) as DefiEdgeStrategyFactory;

    let usdAsBase: [boolean, boolean] = [true, true];

    await factory.changeProtocolPerformanceFeeRate("500000");

    let params = {
      operator: signers[0].address,
      feeTo: signers[1].address,
      managementFeeRate: "500000", // 0.5%
      performanceFeeRate: "500000", // 0.5%
      limit: 0,
      pool: pool.address,
      usdAsBase: usdAsBase,
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
      "DefiEdgeStrategy",
      await factory.strategyByIndex(await factory.totalIndex())
    )) as DefiEdgeStrategy;

    // // initialize strategy
    // await strategy.initialize();

    strategyManager = (await ethers.getContractAt(
      "StrategyManager",
      await strategy.manager()
      )) as StrategyManager;
        
    // set deviation in strategy
    await factory.changeAllowedDeviation(pool.address, "10000000000000000"); // 1%

    const PeripheryFactory = ethers.getContractFactory("Periphery", {
      libraries: { LiquidityHelper: liquidityHelper.address },
    });

    periphery = (await (await PeripheryFactory).deploy()) as Periphery;

    oracle = (await (
      await UniswapV3OracleTestFactory
    ).deploy()) as UniswapV3OracleTest;

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

    // whitelist user 1 address
    let userWhiteListRole = await strategyManager.USER_WHITELIST_ROLE();
    await strategyManager.grantRole(userWhiteListRole, signers[1].address)

  });

  describe("#constructor", async () => {
    it("should set the governance address", async () => {
      expect(await factory.governance()).to.equal(signers[0].address);
    });
    it("should set uniswap swap router contract address", async () => {
      expect(await factory.oneInchRouter()).to.be.equal(router.address);
    });
    it("should set uniswap deployerProxy contract address", async () => {
      expect(await factory.deployerProxy()).to.be.equal(strategyDeplopyer.address);
    });
    it("should set uniswap uniswapV3Factory contract address", async () => {
      expect(await factory.uniswapV3Factory()).to.be.equal(await router.factory());
    });
    it("should set uniswap chainlinkRegistry contract address", async () => {
      expect(await factory.chainlinkRegistry()).to.be.equal(chainlinkRegistry.address);
    });
    it("should set uniswap defaultAllowedSlippage", async () => {
      expect(await factory.defaultAllowedSlippage()).to.be.equal("10000000000000000");
    });
    it("should set uniswap defaultAllowedDeviation", async () => {
      expect(await factory.defaultAllowedDeviation()).to.be.equal("10000000000000000");
    });
    it("should set uniswap defaultAllowedSwapDeviation", async () => {
      expect(await factory.defaultAllowedSwapDeviation()).to.be.equal("5000000000000000");
    });
  });

  describe("#createStrategy", async () => {

    it("should revert if fee is not sufficient to create strategy", async () => {

      await factory.changeFeeForStrategyCreation(expandTo18Decimals(1));

      let usdAsBase: [boolean, boolean] = [true, true];

      let params = {
        operator: signers[0].address,
        feeTo: signers[1].address,
        managementFeeRate: "500000", // 0.5%
        performanceFeeRate: "500000", // 0.5%
        limit: 0,
        pool: pool.address,
        usdAsBase: usdAsBase,
        ticks: [
          {
            amount0: 0,
            amount1: 0,
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3500, 60),
          },
        ],
        useTwapForToken0: true,
      }

      await expect(factory.createStrategy(params)).to.be.revertedWith("INSUFFICIENT_FEES");
    })

    it("should revert if token0 of pool have is more than 18 decimal", async () => {

      // deploy tokens
      let token00 = (await (await TestERC20Factory).deploy(22)) as TestERC20;
      let token01 = (await (await TestERC20Factory).deploy(18)) as TestERC20;

      await uniswapV3Factory.createPool(token00.address, token01.address, "3000");
      
      let poolAddress = await uniswapV3Factory.getPool(token00.address, token01.address, "3000")

      let usdAsBase: [boolean, boolean] = [true, true];

      let params = {
        operator: signers[0].address,
        feeTo: signers[1].address,
        managementFeeRate: "500000", // 0.5%
        performanceFeeRate: "500000", // 0.5%
        limit: 0,
        pool: poolAddress,
        usdAsBase: usdAsBase,
        ticks: [
          {
            amount0: 0,
            amount1: 0,
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3500, 60),
          },
        ]
      }

      await expect(factory.createStrategy(params)).to.be.revertedWith("ID");

    })

    it("should revert if token1 of pool have is more than 18 decimal", async () => {

      // deploy tokens
      let token00 = (await (await TestERC20Factory).deploy(18)) as TestERC20;
      let token01 = (await (await TestERC20Factory).deploy(22)) as TestERC20;

      await uniswapV3Factory.createPool(token00.address, token01.address, "3000");
      
      let poolAddress = await uniswapV3Factory.getPool(token00.address, token01.address, "3000")

      let usdAsBase: [boolean, boolean] = [true, true];

      let params = {
        operator: signers[0].address,
        feeTo: signers[1].address,
        managementFeeRate: "500000", // 0.5%
        performanceFeeRate: "500000", // 0.5%
        limit: 0,
        pool: poolAddress,
        usdAsBase: usdAsBase,
        ticks: [
          {
            amount0: 0,
            amount1: 0,
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3500, 60),
          },
        ]
      }

      await expect(factory.createStrategy(params)).to.be.revertedWith("ID");

    })

    it("should revert if pool address is invalid", async () => {

      let usdAsBase: [boolean, boolean] = [true, true];

      let params = {
        operator: signers[0].address,
        feeTo: signers[1].address,
        managementFeeRate: "500000", // 0.5%
        performanceFeeRate: "500000", // 0.5%
        limit: 0,
        pool: strategyManager.address,
        usdAsBase: usdAsBase,
        ticks: [
          {
            amount0: 0,
            amount1: 0,
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3500, 60),
          },
        ]
      }

      await expect(factory.createStrategy(params)).to.be.reverted;

    })

    it("should revert if pool address is zero address(pool is not available)", async () => {

      let usdAsBase: [boolean, boolean] = [true, true];

      let params = {
        operator: signers[0].address,
        feeTo: signers[1].address,
        managementFeeRate: "500000", // 0.5%
        performanceFeeRate: "500000", // 0.5%
        limit: 0,
        pool: constants.AddressZero,
        usdAsBase: usdAsBase,
        ticks: [
          {
            amount0: 0,
            amount1: 0,
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3500, 60),
          },
        ]
      }

      await expect(factory.createStrategy(params)).to.be.reverted;

    })

    it("should create strategy if proper fee paid", async () => {

      await factory.changeFeeForStrategyCreation(expandTo18Decimals(1));

      let usdAsBase: [boolean, boolean] = [true, true];

      let params = {
        operator: signers[0].address,
        feeTo: signers[1].address,
        managementFeeRate: "500000", // 0.5%
        performanceFeeRate: "500000", // 0.5%
        limit: 0,
        pool: pool.address,
        usdAsBase: usdAsBase,
        ticks: [
          {
            amount0: 0,
            amount1: 0,
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3500, 60),
          },
        ],
        useTwapForToken0: true,
      }

      await expect(factory.createStrategy(params, { value: expandTo18Decimals(1)})).to.be.not.reverted;
    })

    it("should create strategy manager contract", async () => {

      let usdAsBase: [boolean, boolean] = [true, true];

      let params = {
        operator: signers[0].address,
        feeTo: signers[1].address,
        managementFeeRate: "500000", // 0.5%
        performanceFeeRate: "500000", // 0.5%
        limit: 0,
        pool: pool.address,
        usdAsBase: usdAsBase,
        ticks: [
          {
            amount0: 0,
            amount1: 0,
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3500, 60),
          },
        ]
      }

      await factory.createStrategy(params);

      let strategyContract = (await ethers.getContractAt(
        "DefiEdgeStrategy",
        await factory.strategyByIndex(await factory.totalIndex())
      ))

      let managerContract = await ethers.getContractAt("StrategyManager", await strategyContract.manager());

      expect(await managerContract.factory()).to.eq(factory.address)

    })

    it("should create strategy contract", async () => {

      let usdAsBase: [boolean, boolean] = [true, true];

      let params = {
        operator: signers[0].address,
        feeTo: signers[1].address,
        managementFeeRate: "500000", // 0.5%
        performanceFeeRate: "500000", // 0.5%
        limit: 0,
        pool: pool.address,
        usdAsBase: usdAsBase,
        ticks: [
          {
            amount0: 0,
            amount1: 0,
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3500, 60),
          },
        ]
      }

      await factory.createStrategy(params);

      let strategyContract = (await ethers.getContractAt(
        "DefiEdgeStrategy",
        await factory.strategyByIndex(await factory.totalIndex())
      ))

      expect(await strategyContract.factory()).to.eq(factory.address)

    })

    it("should retrieve address by manager address", async () => {

      let usdAsBase: [boolean, boolean] = [true, true];

      let params = {
        operator: signers[0].address,
        feeTo: signers[1].address,
        managementFeeRate: "500000", // 0.5%
        performanceFeeRate: "500000", // 0.5%
        limit: 0,
        pool: pool.address,
        usdAsBase: usdAsBase,
        ticks: [
          {
            amount0: 0,
            amount1: 0,
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3500, 60),
          },
        ]
      }

      await factory.createStrategy(params);

      let strategyContract = (await ethers.getContractAt(
        "DefiEdgeStrategy",
        await factory.strategyByIndex(await factory.totalIndex())
      ))

      let managerContract = await strategyContract.manager()

      expect(await factory.strategyByManager(managerContract)).to.eq(strategyContract.address)

    })

    it("should retrieve strategy address by index", async () => {

      let usdAsBase: [boolean, boolean] = [true, true];

      let params = {
        operator: signers[0].address,
        feeTo: signers[1].address,
        managementFeeRate: "500000", // 0.5%
        performanceFeeRate: "500000", // 0.5%
        limit: 0,
        pool: pool.address,
        usdAsBase: usdAsBase,
        ticks: [
          {
            amount0: 0,
            amount1: 0,
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3500, 60),
          },
        ]
      }

      let index = (await factory.totalIndex()).toString()

      await factory.createStrategy(params);

      let strategy = await factory.strategyByIndex(await factory.totalIndex())

      expect(await factory.strategyByIndex(Number(index) + 1)).to.eq(strategy)

    })

    it("should increase total index", async () => {

      let usdAsBase: [boolean, boolean] = [true, true];

      let params = {
        operator: signers[0].address,
        feeTo: signers[1].address,
        managementFeeRate: "500000", // 0.5%
        performanceFeeRate: "500000", // 0.5%
        limit: 0,
        pool: pool.address,
        usdAsBase: usdAsBase,
        ticks: [
          {
            amount0: 0,
            amount1: 0,
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3500, 60),
          },
        ]
      }

      let oldIndex = (await factory.totalIndex()).toString()

      await factory.createStrategy(params);

      expect(await factory.totalIndex()).to.eq(Number(oldIndex) + 1)

    })

    it("should make strategy valid", async () => {

      let usdAsBase: [boolean, boolean] = [true, true];

      let params = {
        operator: signers[0].address,
        feeTo: signers[1].address,
        managementFeeRate: "500000", // 0.5%
        performanceFeeRate: "500000", // 0.5%
        limit: 0,
        pool: pool.address,
        usdAsBase: usdAsBase,
        ticks: [
          {
            amount0: 0,
            amount1: 0,
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3500, 60),
          },
        ]
      }

      await factory.createStrategy(params);

      let strategy = await factory.strategyByIndex(await factory.totalIndex())

      expect(await factory.isValidStrategy(strategy)).to.eq(true)

    })

    it("should emit new strategy event", async () => {

      let usdAsBase: [boolean, boolean] = [true, true];

      let params = {
        operator: signers[0].address,
        feeTo: signers[1].address,
        managementFeeRate: "500000", // 0.5%
        performanceFeeRate: "500000", // 0.5%
        limit: 0,
        pool: pool.address,
        usdAsBase: usdAsBase,
        ticks: [
          {
            amount0: 0,
            amount1: 0,
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3500, 60),
          },
        ]
      }

      let create = await factory.createStrategy(params);

      let strategy = await factory.strategyByIndex(await factory.totalIndex())

      expect(create).to.emit(factory, "NewStrategy").withArgs(strategy, signers[0].address)

    })

  })

  describe("#changeDefaultValues", async () => {
    it("should be called by governance only", async () => {
      await expect(factory.connect(signers[1]).changeDefaultValues(10000000, 20000000, 30000000)).to.be.revertedWith("NO");
    });
    it("should change default values", async () => {
      expect(await factory.defaultAllowedSlippage()).to.be.equal("10000000000000000");
      expect(await factory.defaultAllowedDeviation()).to.be.equal("10000000000000000");
      expect(await factory.defaultAllowedSwapDeviation()).to.be.equal("5000000000000000");

      await factory.changeDefaultValues(10000000, 20000000, 30000000);

      expect(await factory.defaultAllowedSlippage()).to.be.equal("10000000");
      expect(await factory.defaultAllowedDeviation()).to.be.equal("20000000");
      expect(await factory.defaultAllowedSwapDeviation()).to.be.equal("30000000");
    });
    it("should emit proper event", async () => {

      let tx = await factory.changeDefaultValues(10000000, 20000000, 30000000)
      await expect(tx).to.emit(factory, "ChangeAllowedSlippage").withArgs(ethers.constants.AddressZero, "10000000")
      await expect(tx).to.emit(factory, "ChangeAllowedDeviation").withArgs(ethers.constants.AddressZero, "20000000")
      await expect(tx).to.emit(factory, "ChangeAllowedSwapDeviation").withArgs(ethers.constants.AddressZero, "30000000")
    })
  });

  describe("#changeAllowedSlippage", async () => {
    it("should be called by governance only", async () => {
      await expect(factory.connect(signers[1]).changeAllowedSlippage(pool.address, 10000000)).to.be.revertedWith("NO");
    });
    // it("should revert if slippage is higher", async () => {
    //   await expect(factory.changeAllowedSlippage(pool.address, "200000000000000000")).to.be.revertedWith("IA");
    // });
    it("should change slippage", async () => {
      expect(await factory.allowedSlippage(pool.address)).to.be.equal("10000000000000000");

      await factory.changeAllowedSlippage(pool.address, 1000000);
      expect(await factory.allowedSlippage(pool.address)).to.equal(1000000);

      expect(await factory.allowedSlippage(pool.address)).to.be.equal("1000000");

    });
    it("should emit changeAllowedSlippage event", async () => {
      expect(await factory.changeAllowedSlippage(pool.address, "1000000"))
        .to.emit(factory, "ChangeAllowedSlippage").withArgs(pool.address, "1000000")
    })
  });

  describe("#changeAllowedDeviation", async () => {
    it("should revert if governance is not calling", async () => {
      await expect(factory.connect(signers[1]).changeAllowedDeviation(pool.address, 1)).to.be.revertedWith(
        "NO"
      );
    });

    it("should set deviation to 1%", async () => {
      expect(await factory.allowedDeviation(pool.address)).to.be.equal("10000000000000000");

      await factory.changeAllowedDeviation(pool.address, 1000000);
      expect(await factory.allowedDeviation(pool.address)).to.equal(1000000);

      expect(await factory.allowedDeviation(pool.address)).to.be.equal("1000000");

    });

    it("should emit changeAllowedDeviation event", async () => {
      await expect(await factory.changeAllowedDeviation(pool.address, 1000000))
        .to.emit(factory, "ChangeAllowedDeviation")
        .withArgs(pool.address, 1000000);
    });
  });

  describe("#changeAllowedSwapDeviation", async () => {
    it("should revert if operator is not calling", async () => {
      await expect(factory.connect(signers[1]).changeAllowedSwapDeviation(pool.address, 1)).to.be.revertedWith(
        "NO"
      );
    });

    it("should set  correct deviation", async () => {
      expect(await factory.allowedSwapDeviation(pool.address)).to.be.equal("5000000000000000");

      await factory.changeAllowedSwapDeviation(pool.address, "1000");
      expect(await factory.allowedSwapDeviation(pool.address)).to.equal("1000");

      expect(await factory.allowedSwapDeviation(pool.address)).to.be.equal("1000");
    });
    it("should emit changeSwapDeviation event", async () => {
      await expect(await factory.changeAllowedSwapDeviation(pool.address, 1000000))
        .to.emit(factory, "ChangeAllowedSwapDeviation")
        .withArgs(pool.address, 1000000);
    });
  });

  describe("#changeProtocolFeeRate", async () => {
    it("should be called by governance only", async () => {
      await expect(factory.connect(signers[1]).changeProtocolFeeRate(10000000)).to.be.revertedWith("NO");
    });
    it("should revert if fee is higher", async () => {
      await expect(factory.changeProtocolFeeRate("20000000")).to.be.revertedWith("IA");
    });
    it("should change the protocol fee", async () => {
      await factory.changeProtocolFeeRate(1000000);
      expect(await factory.protocolFeeRate()).to.equal(1000000);
    });
    it("should emit changeProtocolFeeRate event", async () => {
      expect(await factory.changeProtocolFeeRate("1000000"))
        .to.emit(factory, "ChangeProtocolFee").withArgs("1000000")
    })
  });

  describe("#changeProtocolPerformanceFeeRate", async () => {
    it("should be called by governance only", async () => {
      await expect(factory.connect(signers[1]).changeProtocolPerformanceFeeRate(10000000)).to.be.revertedWith("NO");
    });
    it("should revert if fee is higher", async () => {
      await expect(factory.changeProtocolPerformanceFeeRate("20000001")).to.be.revertedWith("IA");
    });
    it("should change the protocol fee", async () => {
      await factory.changeProtocolPerformanceFeeRate(1000000);
      expect(await factory.protocolPerformanceFeeRate()).to.equal(1000000);
    });
    it("should emit changeFee event", async () => {
      expect(await factory.changeProtocolPerformanceFeeRate("1000000"))
        .to.emit(factory, "ChangeProtocolPerformanceFee").withArgs("1000000")
    })
  });

  describe("#changeFeeTo", async () => {
    it("should revert if not called by governance", async () => {
      await expect(factory.connect(signers[1]).changeFeeTo(signers[0].address)).to.be
        .revertedWith("NO");
    });
    it("should change feeTo address", async () => {
      await factory.changeFeeTo(signers[1].address);
      expect(await factory.feeTo()).to.equal(signers[1].address);
    });
  });

  describe("#changeGovernance", async () => {
    it("should be called by governance only", async () => {
      await expect(factory.connect(signers[1]).changeGovernance(signers[2].address)).to.be.revertedWith("NO");
    });
    it("should set pending governance as new governance address", async () => {
      await factory.changeGovernance(signers[1].address);
      expect(await factory.pendingGovernance()).to.equal(signers[1].address);
    });
    it("should set pending governance as new governance address", async () => {
      await factory.changeGovernance(constants.AddressZero);
      expect(await factory.pendingGovernance()).to.equal(constants.AddressZero);
    });
  });

  describe("#acceptGovernance", async () => {
    it("should revert if caller is not pending governance", async () => {
      expect(factory.acceptGovernance()).to.be.reverted;
    });
    it("should set governance as pending governance", async () => {
      await factory.changeGovernance(signers[1].address);
      expect(await factory.pendingGovernance()).to.equal(signers[1].address);
    });
  });

  describe("#deny", async () => {
    it("should be called by governance only", async () => {
      expect(factory.connect(signers[1]).deny(strategy.address, true)).to.be.reverted;
    });
    it("should set boolean to true in denied mapping", async () => {
      await factory.deny(strategy.address, true);
      expect(await factory.denied(strategy.address)).to.equal(true);
    });
    it("should set boolean to false in denied mapping", async () => {
      await factory.deny(strategy.address, true);
      expect(await factory.denied(strategy.address)).to.equal(true);
      await factory.deny(strategy.address, false);
      expect(await factory.denied(strategy.address)).to.equal(false);
    });
    it("should emit proper event", async () => {
      expect(await factory.deny(strategy.address, true))
        .to.emit(factory, "StrategyStatusChanged").withArgs(true);
      expect(await factory.deny(strategy.address, false))
        .to.emit(factory, "StrategyStatusChanged").withArgs(false);
    })
  });

  describe("#changeFeeForStrategyCreation", async () => {
    it("should be called by governance only", async () => {
      await expect(factory.connect(signers[1]).changeFeeForStrategyCreation(expandTo18Decimals(0.1))).to.be.revertedWith("NO");
    });
    it("should change the strategyCreationFee fee", async () => {
      await factory.changeFeeForStrategyCreation(expandTo18Decimals(0.1));
      expect(await factory.strategyCreationFee()).to.equal(expandTo18Decimals(0.1));
    });
    it("should emit changeFeeForStrategyCreation event", async () => {
      expect(await factory.changeFeeForStrategyCreation(expandTo18Decimals(0.1)))
        .to.emit(factory, "ChangeStrategyCreationFee").withArgs(expandTo18Decimals(0.1))
    })
  });

  describe("#claimFees", async () => {
    it("should be called by governance only", async () => {
      await expect(factory.connect(signers[1]).claimFees(signers[1].address)).to.be.revertedWith("NO");
    });

    it("should claim available fees and emit event", async () => {
      await factory.changeFeeForStrategyCreation(expandTo18Decimals(1));
      let usdAsBase: [boolean, boolean] = [true, true];

      let params = {
        operator: signers[0].address,
        feeTo: signers[1].address,
        managementFeeRate: "500000", // 0.5%
        performanceFeeRate: "500000", // 0.5%
        limit: 0,
        pool: pool.address,
        usdAsBase: usdAsBase,
        ticks: [
          {
            amount0: 0,
            amount1: 0,
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3500, 60),
          },
        ],
        useTwapForToken0: true,
      }

      await factory.createStrategy(params, { value: expandTo18Decimals(1)})

      const balanceETHBefore = await ethers.provider.getBalance(signers[1].address);

      // available fees in startegy = 1 ETH
      await expect(factory.claimFees(signers[1].address))
          .to.emit(factory, "ClaimFees").withArgs(signers[1].address, expandTo18Decimals(1))

      expect(await ethers.provider.getBalance(signers[1].address)).to.eq(balanceETHBefore.add(expandTo18Decimals(1)))

      await factory.createStrategy(params, { value: expandTo18Decimals(1)})
      await factory.createStrategy(params, { value: expandTo18Decimals(1)})

      // available fees in strategy = 2 ETH
      await expect(factory.claimFees(signers[1].address))
        .to.emit(factory, "ClaimFees").withArgs(signers[1].address, expandTo18Decimals(2))

      expect(await ethers.provider.getBalance(signers[1].address)).to.eq(balanceETHBefore.add(expandTo18Decimals(3)))

    })
  })


  describe("#setMinHeartbeat", async () => {
    it("should be called by governance only", async () => {
      await expect(factory.connect(signers[1]).setMinHeartbeat(token0.address, token1.address, 10)).to.be.revertedWith("NO");
    });

    it("should set heartBeat", async () => {

      expect(await factory.getHeartBeat(token0.address, token1.address)).to.eq(3600) // default
      expect(await factory.getHeartBeat(token1.address, token0.address)).to.eq(3600) // default

      await factory.setMinHeartbeat(token0.address, token1.address, 180);

      expect(await factory.getHeartBeat(token0.address, token1.address)).to.eq(180)
      expect(await factory.getHeartBeat(token1.address, token0.address)).to.eq(180)
    })
  })


  describe("#getHeartBeat", async () => {

    it("should return correct heartbeat", async () => {

      expect(await factory.getHeartBeat(token0.address, token1.address)).to.eq(3600) // default
      expect(await factory.getHeartBeat(token1.address, token0.address)).to.eq(3600) // default

      await factory.setMinHeartbeat(token0.address, token1.address, 180);

      expect(await factory.getHeartBeat(token0.address, token1.address)).to.eq(180)
      expect(await factory.getHeartBeat(token1.address, token0.address)).to.eq(180)

      await factory.setMinHeartbeat(token0.address, token1.address, 4000);

      expect(await factory.getHeartBeat(token0.address, token1.address)).to.eq(4000)
      expect(await factory.getHeartBeat(token1.address, token0.address)).to.eq(4000)

      await factory.setMinHeartbeat(token0.address, token1.address, 1);

      expect(await factory.getHeartBeat(token0.address, token1.address)).to.eq(1)
      expect(await factory.getHeartBeat(token1.address, token0.address)).to.eq(1)

      await factory.setMinHeartbeat(token0.address, token1.address, 0);

      expect(await factory.getHeartBeat(token0.address, token1.address)).to.eq(3600)
      expect(await factory.getHeartBeat(token1.address, token0.address)).to.eq(3600)
    })
  })

  describe("#freezeEmergencyFunctions", async () => {
    it("should revert if operator is not calling", async () => {
      expect(factory.connect(signers[1]).freezeEmergencyFunctions()).to.be.revertedWith("N");
    });

    it("should set freezeEmergency to true", async () => {
      await factory.freezeEmergencyFunctions();
      expect(await factory.freezeEmergency()).to.equal(true);
    });
    it("should emit freezeEmergency event", async () => {
      await expect(await factory.freezeEmergencyFunctions())
        .to.emit(factory, "EmergencyFrozen")
    });
  });

  // describe("#allowAgain", async () => {
  //   it("should be called by governance only", async () => {
  //     expect(factory.connect(signers[1]).allowAgain(strategy.address)).to.be
  //       .reverted;
  //   });
  //   it("should set boolean to false in denied mapping", async () => {
  //     await factory.deny(strategy.address);
  //     await factory.allowAgain(strategy.address);
  //     expect(await factory.denied(strategy.address)).to.equal(false);
  //   });
  // });
});

async function approve(address: string, from: string | Signer | Provider) {
  // give approval
  await token0.connect(from).approve(address, expandTo18Decimals(150000000000));
  await token1.connect(from).approve(address, expandTo18Decimals(150000000000));
}

async function mint(signer: string | Signer | Provider) {
  await approve(strategy.address, signer);
  return await strategy
    .connect(signer)
    .mint(expandTo18Decimals(1), expandTo18Decimals(3500), 0, 0, 0);
}

function getPositionKey(address: any, lowerTick: any, upperTick: any) {
  return utils.keccak256(
    utils.solidityPack(
      ["address", "int24", "int24"],
      [address, lowerTick, upperTick]
    )
  );
}
