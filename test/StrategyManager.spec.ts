import { ethers, waffle } from "hardhat";
import { BigNumber, Signer, constants } from "ethers";
import chai from "chai";
import bn from 'bignumber.js';

const TestERC20Factory = ethers.getContractFactory("TestERC20");
const WETH9Factory = ethers.getContractFactory("WETH9");
const UniswapV3FactoryFactory = ethers.getContractFactory("UniswapV3Factory");

const UniswapV3OracleTestFactory = ethers.getContractFactory(
  "UniswapV3OracleTest"
);

const LiquidityHelperLibrary = ethers.getContractFactory("LiquidityHelper");
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
let oracleLibrary: OracleLibrary;
let chainlinkRegistry: ChainlinkRegistryMock;
let router: SwapRouter;
let weth9: WETH9;

describe("StrategyManager", () => {
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
    ).deploy()) as OracleLibrary;

    const ShareHelperLibrary = ethers.getContractFactory("ShareHelper", {
      libraries: {
        OracleLibrary: oracleLibrary.address
      }
    });
        
    // deploy sharehelper library
    shareHelper = (await (await ShareHelperLibrary).deploy()) as ShareHelper;

    liquidityHelper = (await (
      await LiquidityHelperLibrary
    ).deploy()) as LiquidityHelper;

    const DefiEdgeStrategyDeployerContract = ethers.getContractFactory("DefiEdgeStrategyDeployer",
     {
        libraries: {
          ShareHelper: shareHelper.address,
          OracleLibrary: oracleLibrary.address,
          LiquidityHelper: liquidityHelper.address
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

    let params = {
      operator: signers[0].address,
      feeTo: signers[1].address,
      managementFee: "500000", // 0.5%
      performanceFee: "500000", // 0.5%
      limit: 0,
      pool: pool.address,
      usdAsBase: [true, true],
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

    strategyManager = (await ethers.getContractAt(
      "StrategyManager",
      await strategy.manager()
    )) as StrategyManager;
        
    // set deviation in strategy
    await strategyManager.changeAllowedDeviation("10000000000000000"); // 1%

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

    // approve tokens
    await approve(strategy.address, signers[0]);
  });

  describe("#Constants", async () => {

    it("should assign factory contract properly", async () => {
      expect(await strategyManager.factory()).to.equal(factory.address);
    });

    it("should set the operator address correctly", async () => {
      expect(await strategyManager.operator()).to.equal(signers[0].address);
    });

    it("should set the feeTo address correctly", async () => {
      expect(await strategyManager.feeTo()).to.equal(signers[1].address);
    });

    it("should set the managementFee address correctly", async () => {
      expect(await strategyManager.managementFee()).to.equal("500000");
    });

    it("should set the performanceFee address correctly", async () => {
      expect(await strategyManager.performanceFee()).to.equal("500000");
    });

    it("should set the limit address correctly", async () => {
      expect(await strategyManager.limit()).to.equal("0");
    });

    it("should set the allowedDeviation address correctly", async () => {
      expect(await strategyManager.allowedDeviation()).to.equal("10000000000000000");
    });
  });

  describe("#strategy", async () => {
    it("should return correct strategy address", async () => {
      expect(await strategyManager.strategy()).to.equal(strategy.address);
    });
  })
  
  describe("#changeFee", async () => {
    it("should revert if operator is not calling", async () => {
      await expect(strategyManager.connect(signers[1]).changeFee(1)).to.be.revertedWith(
        "N"
      );
    });

    it("should set fees to 1%", async () => {
      await strategyManager.changeFee(1000000);
      expect(await strategyManager.managementFee()).to.equal(1000000);
    });

    it("should set fees to 2%", async () => {
      await strategyManager.changeFee(2000000);
      expect(await strategyManager.managementFee()).to.equal(2000000);
    });

    it("should set fees to 5%", async () => {
      await strategyManager.changeFee(5000000);
      expect(await strategyManager.managementFee()).to.equal(5000000);
    });

    it("should emit changeFee event", async () => {
      await expect(await strategyManager.changeFee(1000000))
        .to.emit(strategyManager, "ChangeFee")
        .withArgs(1000000);
    });
  });

  describe("#changeFeeTo", async () => {
    it("should revert if operator is not calling", async () => {
      expect(strategyManager.connect(signers[1]).changeFee(1)).to.be.revertedWith("N");
    });

    it("should update feeTo", async () => {
      await strategyManager.changeFeeTo(signers[1].address);
      expect(await strategyManager.feeTo()).to.equal(signers[1].address);
    });
  });

  describe("#changeOperator", async () => {
    it("should revert if new operator is address 0", async () => {
      expect(strategyManager.changeOperator(constants.AddressZero)).to.be.reverted;
    });

    it("should revert new operator and old operator is same", async () => {
      expect(strategyManager.changeOperator(signers[0].address)).to.be.reverted;
    });

    it("should set pending operator", async () => {
      await strategyManager.changeOperator(signers[1].address);
      expect(await strategyManager.pendingOperator()).to.be.equal(signers[1].address);
    });
  });

  describe("#acceptOperator", async () => {
    beforeEach("call change operator", async () => {
      await strategyManager.changeOperator(signers[1].address);
    });

    it("should revert if msg.sender is not operator", async () => {
      expect(strategyManager.acceptOperator()).to.be.reverted;
    });

    it("should set new operator", async () => {
      await strategyManager.connect(signers[1]).acceptOperator();
      expect(await strategyManager.operator()).to.be.equal(signers[1].address);
    });

    it("should emit change operator function", async () => {
      await expect(await strategyManager.connect(signers[1]).acceptOperator())
        .to.emit(strategyManager, "ChangeOperator")
        .withArgs(signers[1].address);
    });
  });

  describe("#changeLimit", async () => {
    it("should revert if operator is not calling", async () => {
      expect(strategyManager.connect(signers[1]).changeLimit(1)).to.be.revertedWith("N");
    });

    it("should update limit", async () => {
      await strategyManager.changeLimit(10);
      expect(await strategyManager.limit()).to.equal(10);
    });
  });

  describe("#changeMaxSwapLimit", async () => {
    it("should revert if operator is not calling", async () => {
      expect(strategyManager.connect(signers[1]).changeMaxSwapLimit(1)).to.be.revertedWith("N");
    });

    it("should update maxAllowedSwap", async () => {
      await strategyManager.changeMaxSwapLimit(10);
      expect(await strategyManager.maxAllowedSwap()).to.equal(10);
    });
  });

  describe("#changePerformanceFee", async () => {
    it("should revert if operator is not calling", async () => {
      await expect(strategyManager.connect(signers[1]).changePerformanceFee(1)).to.be.revertedWith(
        "N"
      );
    });
    it("should revert if performanceFee is more than 20%", async () => {
      await expect(strategyManager.changePerformanceFee(20000001)).to.be.reverted;
    });

    it("should set fees to 1%", async () => {
      await strategyManager.changePerformanceFee(1000000);
      expect(await strategyManager.performanceFee()).to.equal(1000000);
    });

    it("should set fees to 2%", async () => {
      await strategyManager.changePerformanceFee(2000000);
      expect(await strategyManager.performanceFee()).to.equal(2000000);
    });

    it("should set fees to 5%", async () => {
      await strategyManager.changePerformanceFee(5000000);
      expect(await strategyManager.performanceFee()).to.equal(5000000);
    });

    it("should emit changePerformanceFee event", async () => {
      await expect(await strategyManager.changePerformanceFee(1000000))
        .to.emit(strategyManager, "ChangePerformanceFee")
        .withArgs(1000000);
    });
  });

  describe("#freezeEmergencyFunctions", async () => {
    it("should revert if operator is not calling", async () => {
      expect(strategyManager.connect(signers[1]).freezeEmergencyFunctions()).to.be.revertedWith("N");
    });

    it("should set freezeEmergency to true", async () => {
      await strategyManager.freezeEmergencyFunctions();
      expect(await strategyManager.freezeEmergency()).to.equal(true);
    });
  });


  describe("#changeAllowedDeviation", async () => {
    it("should revert if operator is not calling", async () => {
      await expect(strategyManager.connect(signers[1]).changeAllowedDeviation(1)).to.be.revertedWith(
        "N"
      );
    });

    it("should set deviation to 1%", async () => {
      await strategyManager.changeAllowedDeviation(1000000);
      expect(await strategyManager.allowedDeviation()).to.equal(1000000);
    });

    it("should emit changeAllowedDeviation event", async () => {
      await expect(await strategyManager.changeAllowedDeviation(1000000))
        .to.emit(strategyManager, "ChangeAllowedDeviation")
        .withArgs(1000000);
    });
  });

  describe("#changeSwapDeviation", async () => {
    it("should revert if operator is not calling", async () => {
      await expect(strategyManager.connect(signers[1]).changeSwapDeviation(1)).to.be.revertedWith(
        "N"
      );
    });

    it("should revert if value is more then allowedDeviation", async () => {
      await expect(await strategyManager.changeAllowedDeviation(10))

      await expect(strategyManager.changeSwapDeviation(11)).to.be.revertedWith(
        "ID"
      );
    });

    it("should set  correct deviation", async () => {
      await strategyManager.changeSwapDeviation("1000");
      expect(await strategyManager.allowedSwapDeviation()).to.equal("1000");
    });
  });

  describe("#managementFee", async () => {
    it("should mint share for manager while mint", async () => {
      
      expect(await strategy.accManagementFee()).to.equal(0);

      await mint(signers[0])

      expect(await strategy.accManagementFee()).to.equal("322613049055430570");

    });
  })

  describe("#performanceFee", async () => {
    it("should transfer performanceFee to feeTo address while burnLiquidity", async () => {
      
      await mint(signers[0])

      // swap tokens
      const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;

      const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9;
      await periphery.swap(
        pool.address,
        false,
        "10000000000000000000",
        expandToString(sqrtPriceLimitX96)
      );

      const shares = "64199996762030683443";

      let burn = await strategy.burn(shares, 0, 0)

      let token1A = (await ethers.getContractAt("TestERC20", await pool.token1()));


      expect(burn).to.emit(strategy, "FeesClaimed").withArgs(signers[0].address, "0", "1072391033");

      expect(burn).to.emit(token1A, "Transfer").withArgs(strategy.address, signers[1].address, "5361955");
    });
  })
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