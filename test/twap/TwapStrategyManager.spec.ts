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
let oracle: UniswapV3OracleTest;
let shareHelper: TwapShareHelper;
let liquidityHelper: LiquidityHelper;
let oneInchHelper: OneInchHelper;
let oracleLibrary: TwapOracleLibrary;
let chainlinkRegistry: ChainlinkRegistryMock;
let router: SwapRouter;
let weth9: WETH9;

describe("TwapStrategyManager", () => {
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
    shareHelper = (await (await ShareHelperLibrary).deploy()) as TwapShareHelper;

    liquidityHelper = (await (
      await LiquidityHelperLibrary
    ).deploy()) as LiquidityHelper;

    oneInchHelper = (await (await OneInchHelperLibrary).deploy()) as OneInchHelper;

    const DefiEdgeStrategyDeployerContract = ethers.getContractFactory("DefiEdgeTwapStrategyDeployer",
     {
        libraries: {
          TwapShareHelper: shareHelper.address,
          TwapOracleLibrary: oracleLibrary.address,
          LiquidityHelper: liquidityHelper.address,
          OneInchHelper: oneInchHelper.address,
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

    await factory.changeProtocolPerformanceFeeRate("500000");

    // create strategy
    await factory.createStrategy(params);
    // get strategy
    strategy = (await ethers.getContractAt(
      "DefiEdgeTwapStrategy",
      await factory.strategyByIndex(await factory.totalIndex())
    )) as DefiEdgeTwapStrategy;

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

    // whitelist user 1 address
    let userWhiteListRole = await strategyManager.USER_WHITELIST_ROLE();
    await strategyManager.grantRole(userWhiteListRole, signers[1].address)
    await factory.changeDefaultTwapPeriod(pool.address, 1800);


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

    it("should set the managementFeeRate address correctly", async () => {
      expect(await strategyManager.managementFeeRate()).to.equal("500000");
    });

    it("should set the performanceFeeRate address correctly", async () => {
      expect(await strategyManager.performanceFeeRate()).to.equal(500000);
    });

    it("should set the limit address correctly", async () => {
      expect(await strategyManager.limit()).to.equal("0");
    });

    it("should set the allowedSwapDeviation correctly", async () => {
      expect(await strategyManager.allowedSwapDeviation()).to.equal("10000000000000000"); // 1%
    });
  });

  describe("#grantRole", async () => {

    it("should revert if not called by manager", async () => {
      let userWhiteListRole = await strategyManager.USER_WHITELIST_ROLE();

      await expect(strategyManager.connect(signers[1]).grantRole(userWhiteListRole, signers[2].address))
        .to.be.revertedWith("AccessControl: sender must be an admin to grant");
    });

    it("should whitelist user address", async () => {
      let userWhiteListRole = await strategyManager.USER_WHITELIST_ROLE();

      expect(await strategyManager.hasRole(userWhiteListRole, signers[2].address)).to.eq(false)

      await strategyManager.grantRole(userWhiteListRole, signers[2].address)

      expect(await strategyManager.hasRole(userWhiteListRole, signers[2].address)).to.eq(true)
    })

  })

  describe("#revokeRole", async () => {

    it("should revert if not called by manager", async () => {
      let userWhiteListRole = await strategyManager.USER_WHITELIST_ROLE();

      await expect(strategyManager.connect(signers[1]).revokeRole(userWhiteListRole, signers[2].address))
        .to.be.revertedWith("AccessControl: sender must be an admin to revoke");
    });

    it("should remove user from whitelist ", async () => {
      let userWhiteListRole = await strategyManager.USER_WHITELIST_ROLE();

      expect(await strategyManager.hasRole(userWhiteListRole, signers[2].address)).to.eq(false)

      await strategyManager.grantRole(userWhiteListRole, signers[2].address)

      expect(await strategyManager.hasRole(userWhiteListRole, signers[2].address)).to.eq(true)

      await strategyManager.revokeRole(userWhiteListRole, signers[2].address)

      expect(await strategyManager.hasRole(userWhiteListRole, signers[2].address)).to.eq(false)

    })
  })

  describe("#strategy", async () => {
    it("should return correct strategy address", async () => {
      expect(await strategyManager.strategy()).to.equal(strategy.address);
    });
  })
  
  describe("#changeManagementFeeRate", async () => {
    it("should revert if operator is not calling", async () => {
      await expect(strategyManager.connect(signers[1]).changeManagementFeeRate(1)).to.be.revertedWith(
        "N"
      );
    });

    it("should set fees to 1%", async () => {
      await strategyManager.changeManagementFeeRate(1000000);
      expect(await strategyManager.managementFeeRate()).to.equal(1000000);
    });

    it("should set fees to 2%", async () => {
      await strategyManager.changeManagementFeeRate(2000000);
      expect(await strategyManager.managementFeeRate()).to.equal(2000000);
    });

    it("should set fees to 5%", async () => {
      await strategyManager.changeManagementFeeRate(5000000);
      expect(await strategyManager.managementFeeRate()).to.equal(5000000);
    });
    it("should set fees to 25%", async () => {
      await expect(strategyManager.changeManagementFeeRate(25000000)).to.be.reverted;
    })
    it("should emit changeManagementFeeRate event", async () => {
      await expect(await strategyManager.changeManagementFeeRate(1000000))
        .to.emit(strategyManager, "FeeChanged")
        .withArgs(1000000);
    });
  });

  describe("#changeFeeTo", async () => {
    it("should revert if operator is not calling", async () => {
      expect(strategyManager.connect(signers[1]).changeFeeTo(signers[1].address)).to.be.revertedWith("N");
    });

    it("should update feeTo", async () => {
      await strategyManager.changeFeeTo(signers[1].address);
      expect(await strategyManager.feeTo()).to.equal(signers[1].address);
    });
    it("should emit changeFeeTo event", async () => {
      await expect(await strategyManager.changeFeeTo(signers[1].address))
        .to.emit(strategyManager, "FeeToChanged")
        .withArgs(signers[1].address);
    });
  });

  describe("#changeOperator", async () => {
    it("should revert new operator and old operator is same", async () => {
      expect(strategyManager.changeOperator(signers[0].address)).to.be.reverted;
    });

    it("should set pending operator", async () => {
      await strategyManager.changeOperator(signers[1].address);
      expect(await strategyManager.pendingOperator()).to.be.equal(signers[1].address);
    });
    it("should emit changeOperator event", async () => {
      await expect(await strategyManager.changeOperator(signers[1].address))
        .to.emit(strategyManager, "OperatorProposed")
        .withArgs(signers[1].address);
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
        .to.emit(strategyManager, "OperatorChanged")
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
    it("should emit changeLimit function", async () => {
      await expect(await strategyManager.changeLimit(10))
        .to.emit(strategyManager, "LimitChanged")
        .withArgs(10);
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
    it("should emit changeLimit function", async () => {
      await expect(await strategyManager.changeMaxSwapLimit(10))
        .to.emit(strategyManager, "MaxSwapLimitChanged")
        .withArgs(10);
    });
  });

  describe("#updateStrategyMode", async () => {
    it("should revert if operator is not calling", async () => {
      expect(strategyManager.connect(signers[1]).updateStrategyMode(true)).to.be.revertedWith("N");
    });

    it("should update strategy mode", async () => {
      expect(await strategyManager.isStrategyPrivate()).to.eq(false)
      
      await strategyManager.updateStrategyMode(true);

      expect(await strategyManager.isStrategyPrivate()).to.eq(true)
    })

    it("should emit StrategyModeUpdated event", async () => {
      await expect(await strategyManager.updateStrategyMode(true))
        .to.emit(strategyManager, "StrategyModeUpdated")
        .withArgs(true);
    });
  })

  describe("#changePerformanceFeeRate", async () => {
    it("should revert if operator is not calling", async () => {
      await expect(strategyManager.connect(signers[1]).changePerformanceFeeRate(1)).to.be.revertedWith(
        "N"
      );
    });
    it("should revert if performanceFeeRate is more than 20%", async () => {
      await expect(strategyManager.changePerformanceFeeRate(20000001)).to.be.reverted;
    });

    it("should set fees to 1%", async () => {
      await strategyManager.changePerformanceFeeRate(1000000);
      expect(await strategyManager.performanceFeeRate()).to.equal(1000000);
    });

    it("should set fees to 2%", async () => {
      await strategyManager.changePerformanceFeeRate(2000000);
      expect(await strategyManager.performanceFeeRate()).to.equal(2000000);
    });

    it("should set fees to 5%", async () => {
      await strategyManager.changePerformanceFeeRate(5000000);
      expect(await strategyManager.performanceFeeRate()).to.equal(5000000);
    });

    it("should emit changePerformanceFeeRate event", async () => {
      await expect(await strategyManager.changePerformanceFeeRate(1000000))
        .to.emit(strategyManager, "PerformanceFeeChanged")
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
    it("should emit freezeEmergency event", async () => {
      await expect(await strategyManager.freezeEmergencyFunctions())
        .to.emit(strategyManager, "EmergencyActivated")
    });
  });

  describe("#changeSwapDeviation", async () => {
    it("should revert if operator is not calling", async () => {
      await expect(strategyManager.connect(signers[1]).changeSwapDeviation(1)).to.be.revertedWith(
        "N"
      );
    });

    it("should set  correct deviation", async () => {
      await strategyManager.changeSwapDeviation("1000");
      expect(await strategyManager.allowedSwapDeviation()).to.equal("1000");
    });
    it("should emit changeSwapDeviation event", async () => {
      await expect(await strategyManager.changeSwapDeviation(1000000))
        .to.emit(strategyManager, "AllowedSwapDeviationChanged")
        .withArgs(1000000);
    });
  });

  describe("#managementFeeRate", async () => {
    it("should mint share for manager while mint", async () => {
      
      expect(await strategy.accManagementFeeShares()).to.equal(0);

      await mint(signers[0])

      expect(await strategy.accManagementFeeShares()).to.equal("324989813951040922");

    });
  })

  describe("#performanceFeeRate", async () => {
    it("should increase accPerformanceFeeShares while burnLiquidity", async () => {
      await factory.changeFeeTo(signers[3].address);

      await mint(signers[0])
      await strategy.rebalance(
        "0x",
        [],
        [
          {
            amount0: expandTo18Decimals(1),
            amount1: expandTo18Decimals(3500),
            tickLower: calculateTick(2000, 60),
            tickUpper: calculateTick(4000, 60),
          },
        ],
        true
      );

      // swap tokens
      const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;

      const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9;
      await periphery.swap(
        pool.address,
        false,
        "10000000000000000000",
        expandToString(sqrtPriceLimitX96)
      );

      // expect(await strategy.accPerformanceFeeShares()).to.equal(0);

      const shares = (await strategy.balanceOf(signers[0].address)).toString();

      let burn = await strategy.burn(shares, 0, 0)

      // expect(await strategy.accPerformanceFeeShares()).to.equal("53619");

      await expect(burn).to.emit(strategy, "FeesClaim").withArgs(strategy.address, "0", "507080974");
    });
  })

  describe("#accProtocolPerformanceFeeShares", async () => {
    it("should increase accProtocolPerformanceFeeShares while burnLiquidity", async () => {
      await factory.changeFeeTo(signers[3].address);
      
      await mint(signers[0])
      await strategy.rebalance(
        "0x",
        [],
        [
          {
            amount0: expandTo18Decimals(1),
            amount1: expandTo18Decimals(3500),
            tickLower: calculateTick(2000, 60),
            tickUpper: calculateTick(4000, 60),
          },
        ],
        true
      );
      // swap tokens
      const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;

      const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9;
      await periphery.swap(
        pool.address,
        false,
        "10000000000000000000",
        expandToString(sqrtPriceLimitX96)
      );

      // expect(await strategy.accProtocolPerformanceFeeShares()).to.equal(0);

      const shares = (await strategy.balanceOf(signers[0].address)).toString();

      let burn = await strategy.burn(shares, 0, 0)

      // expect(await strategy.accProtocolPerformanceFeeShares()).to.equal("53619");

      await expect(burn).to.emit(strategy, "FeesClaim").withArgs(strategy.address, "0", "507080974");
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