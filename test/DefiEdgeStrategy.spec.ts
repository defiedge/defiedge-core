import { ethers, waffle } from "hardhat";
import { BigNumber } from "ethers";
import chai from "chai";

const TestERC20Factory = ethers.getContractFactory("TestERC20");
const UniswapV3FactoryFactory = ethers.getContractFactory("UniswapV3Factory");
const DefiEdgeStrategyFactoryFactory = ethers.getContractFactory(
  "DefiEdgeStrategyFactory"
);
const PeripheryFactory = ethers.getContractFactory("Periphery");
const UniswapV3OracleTestFactory = ethers.getContractFactory(
  "UniswapV3OracleTest"
);

import { TestERC20 } from "../typechain/TestERC20";
import { UniswapV3Factory } from "../typechain/UniswapV3Factory";
import { UniswapV3Pool } from "../typechain/UniswapV3Pool";
import { DefiEdgeStrategy } from "../typechain/DefiEdgeStrategy";
import { DefiEdgeStrategyFactory } from "../typechain/DefiEdgeStrategyFactory";
import { Periphery } from "../typechain/Periphery";
import { UniswapV3OracleTest } from "../typechain/UniswapV3OracleTest";

import {
  calculateTick,
  encodePriceSqrt,
  expandTo18Decimals,
  expandToString,
} from "./utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const { deployContract } = waffle;
const { expect } = chai;

describe("DeFiEdgeStrategy", () => {
  let token0: TestERC20;
  let token1: TestERC20;
  let pool: UniswapV3Pool;
  let signers: SignerWithAddress[];
  let factory;
  let strategy: DefiEdgeStrategy;
  let periphery: Periphery;
  let oracle: UniswapV3OracleTest;

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

    // deploy strategy factory
    factory = (await (
      await DefiEdgeStrategyFactoryFactory
    ).deploy(signers[0].address)) as DefiEdgeStrategyFactory;

    // create strategy
    await factory.createStrategy(pool.address, signers[0].address);

    // get strategy
    strategy = (await ethers.getContractAt(
      "DefiEdgeStrategy",
      await factory.strategyByIndex(await factory.totalIndex())
    )) as DefiEdgeStrategy;

    // initialize strategy
    await strategy.initialize([
      {
        amount0: 0,
        amount1: 0,
        tickLower: calculateTick(2500, 60),
        tickUpper: calculateTick(3500, 60),
      },
    ]);

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
    await pool.increaseObservationCardinalityNext(65);

    // swap tokens
    const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;

    const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9;

    await ethers.provider.send("evm_increaseTime", [65]);

    await periphery.swap(
      pool.address,
      false,
      "10000000000000000000",
      expandToString(sqrtPriceLimitX96)
    );
  });

  describe("#Constants", async () => {
    it("should initialize the strategy", async () => {
      expect(await strategy.initialized()).to.equal(true);
    });

    it("should set the pool value correctly", async () => {
      expect(await strategy.pool()).to.equal(pool.address);
    });
  });

  describe("#Mint", async () => {
    beforeEach("Add Liquidity", async () => {
      await token0.approve(strategy.address, expandTo18Decimals(1000000));
      await token1.approve(strategy.address, expandTo18Decimals(1000000));

      await strategy.mint(
        expandTo18Decimals(100),
        expandTo18Decimals(35000),
        0,
        0,
        0
      );
    });

    it("should revert if minimum share is less than minted share", async () => {
      expect(
        strategy.mint(
          expandTo18Decimals(100),
          expandTo18Decimals(35000),
          0,
          0,
          "106013872890310524162190"
        )
      ).to.be.reverted;
    });

    it("should mint liquidity to Uniswap pool", async () => {
      expect((await strategy.ticks(0)).amount0).to.equal(
        "10138283342866095685"
      );
      expect((await strategy.ticks(0)).amount1).to.equal(
        "35000000000000000000000"
      );
    });

    it("should issue shares based on the formula", async () => {
      expect(await strategy.balanceOf(signers[0].address)).to.equal(
        "105003372553055218640335"
      );
    });

    it("should issue shares based on fees accumulated", async () => {
      const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;

      // let the pool earn some fees
      await periphery.swap(
        pool.address,
        false,
        "100000000000000000000000",
        expandToString(Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9)
      );

      // give approval
      await token0
        .connect(signers[1])
        .approve(strategy.address, expandTo18Decimals(150000000000));
      await token1
        .connect(signers[1])
        .approve(strategy.address, expandTo18Decimals(150000000000));

      // mint shares
      await strategy
        .connect(signers[1])
        .mint(expandTo18Decimals(10), expandTo18Decimals(35000), 0, 0, 0);

      const shares = await strategy.balanceOf(signers[1].address);
      const totalSupply = await strategy.totalSupply();

      // calculate the amounts user should receive, it should be more than the added amounts
      const amount0 =
        (Number((await strategy.ticks(0)).amount0) * Number(shares)) /
        Number(totalSupply);
      const amount1 =
        (Number((await strategy.ticks(0)).amount1) * Number(shares)) /
        Number(totalSupply);

      expect(await strategy.burn(shares, 0, 0))
        .to.emit(strategy, "Burn")
        .withArgs("10001029287193511600", "34526162020130243288118");
    });

    it("should revert if amounts added are greater than minimum amounts", async () => {});

    it("should update data in the ticks", async () => {});

    it("should emit mint event with correct values", async () => {});
  });

  describe("#Burn", async () => {
    it("should revert if burn share balance is less than the amount provided", async () => {});

    it("should burn liquidity from all the ticks", async () => {});

    it("should include earned fees in burned amount", async () => {});

    it("should decrease the ticks amounts", async () => {});

    it("should give back from unused balances", async () => {});

    it("should burn share tokens", async () => {});

    it("should emit burn event with correct values", async () => {});

    it("should revert if minimum amounts are greater than amounts", async () => {});
  });

  describe("#Rebalance", async () => {
    beforeEach("Add Liquidity", async () => {
      await token0.approve(strategy.address, expandTo18Decimals(1000000));
      await token1.approve(strategy.address, expandTo18Decimals(1000000));

      await strategy.mint(
        expandTo18Decimals(10),
        expandTo18Decimals(35000),
        0,
        0,
        0
      );
    });

    it("should redeploy the amounts if on hold", async () => {
      await strategy.hold();
      await strategy.rebalance(0, 0, 0, false, [
        {
          amount0: expandTo18Decimals(9),
          amount1: expandTo18Decimals(34521.60981108611),
          tickLower: calculateTick(2000, 60),
          tickUpper: calculateTick(4000, 60),
        },
      ]);
      
    });

    it("should swap and redeploy", async () => {
      const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;
      await strategy.rebalance(
        10,
        expandToString(Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9),
        0,
        false,
        [
          {
            amount0: expandTo18Decimals(9),
            amount1: expandTo18Decimals(34521.60981108611),
            tickLower: calculateTick(2000, 60),
            tickUpper: calculateTick(4000, 60),
          },
        ]
      );
    });

    it("should redeploy without swap", async () => {});
  });
});
