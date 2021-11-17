import { ethers, waffle } from "hardhat";
import { BigNumber, Signer, constants } from "ethers";
import chai from "chai";

const TestERC20Factory = ethers.getContractFactory("TestERC20");
const UniswapV3FactoryFactory = ethers.getContractFactory("UniswapV3Factory");

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
let factory: DefiEdgeStrategyFactory;
let strategy: DefiEdgeStrategy;
let periphery: Periphery;
let oracle: UniswapV3OracleTest;
let shareHelper: ShareHelper;
let liquidityHelper: LiquidityHelper;

describe("StrategyBase", () => {
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
        tickLower: calculateTick(2500, 60),
        tickUpper: calculateTick(3500, 60),
      },
    ]);

    // get strategy
    strategy = (await ethers.getContractAt(
      "DefiEdgeStrategy",
      await factory.strategyByIndex(await factory.totalIndex())
    )) as DefiEdgeStrategy;

    // set deviation in strategy
    await strategy.changeAllowedDeviation("10000000000000000") // 1%

    const PeripheryFactory = ethers.getContractFactory("Periphery",
    {
      libraries: { LiquidityHelper: liquidityHelper.address }
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
    it("should set management fee to 0", async () => {
      expect(await strategy.managementFee()).to.equal(0);
    });

    it("should set feeToo as zero address initially", async () => {
      expect(await strategy.feeTo()).to.equal(constants.AddressZero);
    });

    it("should assign factory contract properly", async () => {
      expect(await strategy.factory()).to.equal(factory.address);
    });

    it("should set the pool address correctly", async () => {
      expect(await strategy.pool()).to.equal(pool.address);
    });

    it("should set initial ticks", async () => {
      expect((await strategy.ticks(0)).tickLower).to.equal(
        calculateTick(2500, 60)
      );
      expect((await strategy.ticks(0)).tickUpper).to.equal(
        calculateTick(3500, 60)
      );
    });

    it("should update ticks after rebalance", async () => {
      const tickLower = calculateTick(2700, 60);
      const tickUpper = calculateTick(3800, 60);
      await strategy.mint(
        expandTo18Decimals(1),
        expandTo18Decimals(3500),
        0,
        0,
        0
      );
      await strategy.rebalance([
        {
          amount0: expandTo18Decimals(1),
          amount1: expandTo18Decimals(1),
          tickLower,
          tickUpper,
        },
      ]);
      expect((await strategy.ticks(0)).tickLower).to.equal(tickLower);
      expect((await strategy.ticks(0)).tickUpper).to.equal(tickUpper);
    });

    it("should delete ticks on hold", async () => {
      await strategy.hold();
      expect(await strategy.tickLength()).to.equal(0);
    });
  });

  describe("#validTicks modifier", async () => {
    beforeEach("add liquidity", async () => {
      await strategy.mint(
        expandTo18Decimals(1),
        expandTo18Decimals(3500),
        0,
        0,
        0
      );
    });

    it("should revert if tick length is more than 5", async () => {
      const ticks = [];
      for (let i = 0; i < 6; i++) {
        const tick = {
          amount0: expandTo18Decimals(0.00001),
          amount1: expandTo18Decimals(0.00001),
          tickLower: calculateTick(2000 + i * 60, 60),
          tickUpper: calculateTick(4000 + i * 60, 60),
        };
        ticks.push(tick);
      }
      expect(strategy.rebalance(ticks)).to.be.revertedWith("ITL");
    });

    it("should revert if two tick upper and tick lower are same", async () => {
      const ticks = [
        {
          amount0: expandTo18Decimals(0.00001),
          amount1: expandTo18Decimals(0.00001),
          tickLower: calculateTick(2000, 60),
          tickUpper: calculateTick(4000, 60),
        },
        {
          amount0: expandTo18Decimals(0.00001),
          amount1: expandTo18Decimals(0.00001),
          tickLower: calculateTick(2000, 60),
          tickUpper: calculateTick(4000, 60),
        },
      ];
      expect(strategy.rebalance(ticks)).to.be.revertedWith("TS");
    });
  });

  describe("#hasDeviation modifier", async () => {
    
    beforeEach("add liquidity", async () => {

      // set deviation in strategy
      await strategy.changeAllowedDeviation("100000000000000") // 0.01% - setting it to very low for tests

      await strategy.mint(
        expandTo18Decimals(100),
        expandTo18Decimals(350000),
        0,
        0,
        0
      );
    });

    it("should revert while redeploying", async () => {
      
      await expect(strategy.rebalance([
        {
          amount0: expandTo18Decimals(1),
          amount1: expandTo18Decimals(1),
          tickLower: calculateTick(2500, 60),
          tickUpper: calculateTick(3600, 60),
        },
      ])).to.be.revertedWith('D');

    })

    it("should revert while swap", async () => {
      
      const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;
      const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.1;
      await expect(strategy.swap(
        false,
        expandTo18Decimals(0.0001),
        expandToString(sqrtPriceLimitX96)
      )).to.be.revertedWith('D');

    })

    it("should revert while hold", async () => {
      
      await expect(strategy.hold()).to.be.revertedWith('D');

    })

  })
  describe("#issueShare", async () => {
    it("should mint shares to user", async () => {
      await approve(strategy.address, signers[1]);
      await strategy
        .connect(signers[1])
        .mint(expandTo18Decimals(1), expandTo18Decimals(3500), 0, 0, 0);
      expect(await strategy.balanceOf(signers[1].address)).to.equal(
        "3452260981108611401314"
      );
    });

    it("should mint fees to manager", async () => {
      // set 1% fee
      await strategy.changeFee("1000000");
      await strategy.changeFeeTo(signers[2].address);

      await approve(strategy.address, signers[1]);

      await strategy
        .connect(signers[1])
        .mint(expandTo18Decimals(1), expandTo18Decimals(3500), 0, 0, 0);

      expect(await strategy.accManagementFee()).to.equal(
        "34522609811086114013"
      );
    });

    it("should mint protocol fees", async () => {
      await factory.changeFee("1000000");
      await factory.changeFeeTo(signers[1].address);

      await approve(strategy.address, signers[1]);

      await strategy.mint(
        expandTo18Decimals(1),
        expandTo18Decimals(3500),
        0,
        0,
        0
      );

      expect(await strategy.accProtocolFee()).to.equal("34522609811086114013");
    });
  });

  // describe("#changeFee", async () => {
  //   it("should revert if operator is not calling", async () => {
  //     expect(strategy.connect(signers[1]).changeFee(1)).to.be.revertedWith(
  //       "NO"
  //     );
  //   });

  //   it("should set fees to 1%", async () => {
  //     await strategy.changeFee(0);
  //     expect(await strategy.managementFee()).to.equal(1000000);
  //   });

  //   it("should set fees to 2%", async () => {
  //     await strategy.changeFee(1);
  //     expect(await strategy.managementFee()).to.equal(2000000);
  //   });

  //   it("should set fees to 5%", async () => {
  //     await strategy.changeFee(2);
  //     expect(await strategy.managementFee()).to.equal(5000000);
  //   });

  //   it("should emit changeFee event", async () => {
  //     await expect(await strategy.changeFee(0))
  //       .to.emit(strategy, "ChangeFee")
  //       .withArgs(1000000);
  //   });
  // });

  describe("#changeFeeTo", async () => {
    it("should revert if operator is not calling", async () => {
      expect(strategy.connect(signers[1]).changeFee(1)).to.be.revertedWith(
        "N"
      );
    });

    it("should update feeTo", async () => {
      await strategy.changeFeeTo(signers[1].address);
      expect(await strategy.feeTo()).to.equal(signers[1].address);
    });
  });

  describe("#changeOperator", async () => {
    it("should revert if new operator is address 0", async () => {
      expect(strategy.changeOperator(constants.AddressZero)).to.be.reverted;
    });

    it("should revert new operator and old operator is same", async () => {
      expect(strategy.changeOperator(signers[0].address)).to.be.reverted;
    });

    it("should set pending operator", async () => {
      await strategy.changeOperator(signers[1].address);
      expect(await strategy.pendingOperator()).to.be.equal(signers[1].address);
    });
  });

  describe("#acceptGovernance", async () => {
    beforeEach("call change operator", async () => {
      await strategy.changeOperator(signers[1].address);
    });

    it("should revert if msg.sender is not operator", async () => {
      expect(strategy.acceptOperator()).to.be.reverted;
    });

    it("should set new operator", async () => {
      await strategy.connect(signers[1]).acceptOperator();
      expect(await strategy.operator()).to.be.equal(signers[1].address);
    });

    it("should emit change operator function", async () => {
      await expect(await strategy.connect(signers[1]).acceptOperator())
        .to.emit(strategy, "ChangeOperator")
        .withArgs(signers[1].address);
    });
  });

  describe("#tickLength", async () => {
    it("returns length of the tick", async () => {
      await strategy.mint(
        expandTo18Decimals(1),
        expandTo18Decimals(3500),
        0,
        0,
        0
      );
      await strategy.rebalance([
        {
          amount0: expandTo18Decimals(0.00001),
          amount1: expandTo18Decimals(0.00001),
          tickLower: calculateTick(2000, 60),
          tickUpper: calculateTick(4000, 60),
        },
      ]);
      expect(await strategy.tickLength()).to.equal(1);
    });
  });

  describe("#claimFee", async () => {

    beforeEach(async() => {

        // set 1% fee
        await strategy.changeFee("1000000");
        await strategy.changeFeeTo(signers[2].address);
  
        await factory.changeFee("1000000");
        await factory.changeFeeTo(signers[3].address);
  
        await approve(strategy.address, signers[1]);
  
        await strategy
          .connect(signers[1])
          .mint(expandTo18Decimals(1), expandTo18Decimals(3500), 0, 0, 0);

    })

    it("should mint accProtocolFee  & accManagementFee to feeTo address", async () => {

      expect(await strategy.accManagementFee()).to.equal("34522609811086114013");

      expect(await strategy.accProtocolFee()).to.equal("34522609811086114013");

      let claimFee = await strategy.claimFee();

      expect(claimFee).to.emit(strategy, "Transfer").withArgs("0x0000000000000000000000000000000000000000", signers[2].address, "34522609811086114013")
      expect(claimFee).to.emit(strategy, "Transfer").withArgs("0x0000000000000000000000000000000000000000", signers[3].address, "34522609811086114013")

    });

    it("should update account balance after claimFee", async () => {

      expect(await strategy.balanceOf(signers[2].address)).to.equal("0");
      expect(await strategy.balanceOf(signers[3].address)).to.equal("0");

      await strategy.claimFee();

      expect(await strategy.balanceOf(signers[2].address)).to.equal("34522609811086114013");
      expect(await strategy.balanceOf(signers[3].address)).to.equal("34522609811086114013");

    });

    it("should set accProtocolFee  & accManagementFee to zero after claiming fee", async () => {

      expect(await strategy.accManagementFee()).to.equal("34522609811086114013");
      expect(await strategy.accProtocolFee()).to.equal("34522609811086114013");

      await strategy.claimFee();

      expect(await strategy.accManagementFee()).to.equal("0");
      expect(await strategy.accProtocolFee()).to.equal("0");

    });
  });
});

async function approve(address: string, from: string | Signer | Provider) {
  // give approval
  await token0.connect(from).approve(address, expandTo18Decimals(150000000000));
  await token1.connect(from).approve(address, expandTo18Decimals(150000000000));
}
