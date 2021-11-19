import { ethers, waffle } from "hardhat";
import { BigNumber, utils, Signer } from "ethers";
import chai from "chai";

const TestERC20Factory = ethers.getContractFactory("TestERC20");
const UniswapV3FactoryFactory = ethers.getContractFactory("UniswapV3Factory");

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
import { UniswapV3OracleTest } from "../typechain/UniswapV3OracleTest";
import { LiquidityHelperTest } from "../typechain/LiquidityHelperTest";
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
let factory: DefiEdgeStrategyFactory;
let strategy: DefiEdgeStrategy;
let periphery: Periphery;
let oracle: UniswapV3OracleTest;
// let liquidityHelper: LiquidityHelperTest;
let shareHelper: ShareHelper;
let liquidityHelper: LiquidityHelper;
let oracleLibrary: OracleLibrary;
let chainlinkRegistry: ChainlinkRegistryMock;

describe("UniswapPoolActions", () => {
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

    shareHelper = (await (await ShareHelperLibrary).deploy()) as ShareHelper;

    liquidityHelper = (await (
      await LiquidityHelperLibrary
    ).deploy()) as LiquidityHelper;

    const DefiEdgeStrategyFactoryF = await ethers.getContractFactory(
      "DefiEdgeStrategyFactory",
      {
        libraries: {
          OracleLibrary: oracleLibrary.address,
          ShareHelper: shareHelper.address,
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

    // liquidityHelper = (await (
    //   await LiquidityHelperTestFactory
    // ).deploy()) as LiquidityHelperTest;

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
  });

  describe("#mintLiquidity", async () => {
    it("should emit mint event with correct values - strategy contract", async () => {
      expect(await mint(signers[0]))
        .to.emit(strategy, "Mint")
        .withArgs(
          signers[0].address,
          "3452260981108611401314",
          expandTo18Decimals(1),
          "3452260981108611401314"
        );
    });

    it("should emit mint event with correct values - uniswap pool contract", async () => {
      let liquidity = await liquidityHelper.getLiquidityForAmounts(
        pool.address,
        calculateTick(2500, 60),
        calculateTick(3500, 60),
        expandTo18Decimals(1),
        expandTo18Decimals(3500)
      );

      expect(await mint(signers[0]))
        .to.emit(pool, "Mint")
        .withArgs(
          strategy.address,
          strategy.address,
          calculateTick(2500, 60),
          calculateTick(3500, 60),
          liquidity.toString(),
          expandTo18Decimals(1),
          "3452260981108611401314"
        );
    });
  });

  describe("#burnLiquidity", async () => {
    beforeEach("add liquidity", async () => {
      await mint(signers[0]);
    });

    it("should emit mint event with correct values - strategy contract", async () => {
      const shares = "3452260981108611401314";
      expect(await strategy.connect(signers[0]).burn(shares, 0, 0))
        .to.emit(strategy, "Burn")
        .withArgs(
          signers[0].address,
          shares,
          "999999999999999999",
          "3452260981108611401313"
        );
    });

    it("should emit fees claimed event with correct values - strategy contract", async () => {
      const shares = "3452260981108611401314";
      expect(await strategy.connect(signers[0]).burn(shares, 0, 0))
        .to.emit(strategy, "FeesClaimed")
        .withArgs(signers[0].address, "0", "0");
    });

    it("should emit burn event with correct values - uniswap pool contract", async () => {
      expect(await mint(signers[0]))
        .to.emit(pool, "Burn")
        .withArgs(
          strategy.address,
          calculateTick(2500, 60),
          calculateTick(3500, 60),
          "0",
          "0",
          "0"
        );
    });

    it("should emit collect event with correct values - uniswap pool contract", async () => {
      const shares = "3452260981108611401314";

      expect(await strategy.connect(signers[0]).burn(shares, 0, 0))
        .to.emit(pool, "Collect")
        .withArgs(
          strategy.address,
          strategy.address,
          calculateTick(2500, 60),
          calculateTick(3500, 60),
          "999999999999999999",
          "3452260981108611401313"
        );
    });
  });

  describe("#burnAllLiquidity", async () => {
    beforeEach("add liquidity", async () => {
      await mint(signers[0]);
    });

    it("should burn all the liquidity", async () => {
      await strategy.hold();
      const positionKey = getPositionKey(
        strategy.address,
        calculateTick(2500, 60),
        calculateTick(3500, 60)
      );

      const position = await pool.positions(positionKey);
      expect(position.liquidity).to.equal(0);
    });

    it("should emit fees claimed event with correct values - strategy contract", async () => {
      expect(await strategy.hold())
        .to.emit(strategy, "FeesClaimed")
        .withArgs(signers[0].address, "0", "0");
    });

    it("should emit collect event with correct values - uniswap pool contract", async () => {
      expect(await strategy.hold())
        .to.emit(pool, "Collect")
        .withArgs(
          strategy.address,
          strategy.address,
          calculateTick(2500, 60),
          calculateTick(3500, 60),
          "999999999999999999",
          "3452260981108611401313"
        );
    });
  });

  describe("#getAUMWithFees", async () => {
    beforeEach("add some liquidity", async () => {
      await mint(signers[0]);
    });

    it("should updates fees at Uniswap pool", async () => {
      const positionKey = getPositionKey(
        strategy.address,
        calculateTick(2500, 60),
        calculateTick(3500, 60)
      );

      const positionBefore = await pool.positions(positionKey);

      // swap tokens
      const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;
      const sqrtPriceLimitX96 =
        Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9;

      await periphery.swap(
        pool.address,
        false,
        "10000000000000000000",
        expandToString(sqrtPriceLimitX96)
      );

      await mint(signers[0]);

      const positionAfter = await pool.positions(positionKey);

      expect(positionBefore.feeGrowthInside1LastX128.toString()).to.equal("0");
      expect(positionBefore.tokensOwed1.toString()).to.equal("0");

      expect(positionAfter.feeGrowthInside1LastX128.toString()).to.equal(
        "499087288263231916915033707"
      );
      expect(positionAfter.tokensOwed1.toString()).to.equal("0");
    });

    it("should update liquidity amount", async () => {
      const positionKey = getPositionKey(
        strategy.address,
        calculateTick(2500, 60),
        calculateTick(3500, 60)
      );

      const positionBefore = await pool.positions(positionKey);

      await mint(signers[0]);

      const positionAfter = await pool.positions(positionKey);

      expect(positionBefore.liquidity.toString()).to.equal(
        "731166206079261908657"
      );

      expect(positionAfter.liquidity.toString()).to.equal(
        "1462332412158523817314"
      );
    });

    it("should emit burn event", async () => {
      expect(await mint(signers[0]))
        .to.emit(pool, "Burn")
        .withArgs(
          strategy.address,
          calculateTick(2500, 60),
          calculateTick(3500, 60),
          "0",
          "0",
          "0"
        );
    });
  });

  describe("#uniswapV3MintCallback", async () => {
    it("should revert if msg.sender is not uniswap v3 pool", async () => {
      expect(strategy.connect(signers[0]).uniswapV3MintCallback("0", "0", "0x"))
        .to.be.reverted;
    });
  });

  describe("#uniswapV3SwapCallback", async () => {
    it("should revert if msg.sender is not uniswap v3 pool", async () => {
      expect(strategy.connect(signers[0]).uniswapV3SwapCallback("0", "0", "0x"))
        .to.be.reverted;
    });
  });
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
