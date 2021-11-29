import { ethers, waffle } from "hardhat";
import { BigNumber, utils, Signer, constants } from "ethers";
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
import { LiquidityHelperTest } from "../typechain/LiquidityHelperTest";
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
  encodePath
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
// let liquidityHelper: LiquidityHelperTest;
let shareHelper: ShareHelper;
let liquidityHelper: LiquidityHelper;
let oracleLibrary: OracleLibrary;
let chainlinkRegistry: ChainlinkRegistryMock;
let router: SwapRouter;
let weth9: WETH9;

describe("UniswapV3LiquidityManager", () => {
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

    // deploy oracleLibrary library
    oracleLibrary = (await (
      await OracleLibraryLibrary
    ).deploy()) as OracleLibrary;

    chainlinkRegistry = (await (
      await ChainlinkRegistryMockFactory
    ).deploy(pool.token0(), pool.token1())) as ChainlinkRegistryMock;

    await chainlinkRegistry.setDecimals(8);
    await chainlinkRegistry.setAnswer(
      "300000000000",
      "100000000"
    );    

    const ShareHelperLibrary = ethers.getContractFactory("ShareHelper", {
      libraries: {
        OracleLibrary: oracleLibrary.address
      }
    });

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
      "50000000000000000",
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

    // // initialize strategy
    // await strategy.initialize();

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
  });

  describe("#mintLiquidity", async () => {
    it("should emit mint event with correct values - strategy contract", async () => {
      expect(await mint(signers[0]))
        .to.emit(strategy, "Mint")
        .withArgs(
          signers[0].address,
          "64522609811086114013",
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
      const shares = "64199996762030683443";
      expect(await strategy.connect(signers[0]).burn(shares, 0, 0))
        .to.emit(strategy, "Burn")
        .withArgs(
          signers[0].address,
          shares,
          "994999999999999999",
          "3434999676203068344308"
        );
    });

    it("should emit fees claimed event with correct values - strategy contract", async () => {
      const shares = "64199996762030683443";
      expect(await strategy.connect(signers[0]).burn(shares, 0, 0))
        .to.emit(strategy, "FeesClaimed")
        .withArgs(signers[0].address, "0", "0");
    });

    it("should emit burn event with correct values - uniswap pool contract", async () => {
      const shares = "64199996762030683443";

      expect(await strategy.burn(shares, 0, 0))
        .to.emit(pool, "Burn")
        .withArgs(
          strategy.address,
          calculateTick(2500, 60),
          calculateTick(3500, 60),
          "727510375048865599114",
          "994999999999999999",
          "3434999676203068344308"
        );
    });

    it("should emit collect event with correct values - uniswap pool contract", async () => {
      const shares = "64199996762030683443";

      expect(await strategy.connect(signers[0]).burn(shares, 0, 0))
        .to.emit(pool, "Collect")
        .withArgs(
          strategy.address,
          strategy.address,
          calculateTick(2500, 60),
          calculateTick(3500, 60),
          "994999999999999999",
          "3434999676203068344308"
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
        .withArgs(strategy.address, "0", "0");
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
      expect(positionAfter.tokensOwed1.toString()).to.equal("1072391033");
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

  // describe("#uniswapV3SwapCallback", async () => {
  //   it("should revert if msg.sender is not uniswap v3 pool", async () => {
  //     expect(strategy.connect(signers[0]).uniswapV3SwapCallback("0", "0", "0x"))
  //       .to.be.reverted;
  //   });
  // });

  describe("#swap", async () => {
    beforeEach("add some liquidity", async () => {
      await mint(signers[0]);
      await strategy.hold();
    });

    it("should revert if caller is not operator", async () => {

      const sqrtRatioX96 = ((await pool.slot0()).sqrtPriceX96).toString();
      const sqrtPriceLimitX96 =
        (new bn(sqrtRatioX96).plus(sqrtRatioX96).multipliedBy(0.9)).toFixed(0);

      await expect(
        strategy
          .connect(signers[1])
          .swap(
            false,
            false,
            encodePath([token0.address, token1.address], [3000]),
            constants.MaxUint256,
            expandTo18Decimals(0.0001),
            0,
            sqrtPriceLimitX96
          )
      ).to.be.revertedWith('N');

    });

    it("swapExactInput - should swap the amount", async () => {

      const sqrtRatioX96 = ((await pool.slot0()).sqrtPriceX96).toString();
      const sqrtPriceLimitX96 =
        (new bn(sqrtRatioX96).plus(sqrtRatioX96).multipliedBy(0.1)).toFixed(0);

      let swap = await strategy.swap(
        false,
        true,
        encodePath([token0.address, token1.address], [3000]),
        constants.MaxUint256,
        expandTo18Decimals(0.0001),
        0,
        sqrtPriceLimitX96
      );


      expect(swap)
        .to.emit(pool, "Swap")
        .withArgs(
          router.address,
          strategy.address,
          "100000000000000",
          "-300068242774103142",
          BigInt("4346523400549810817866004402175"),
          80100
        );
    });


    it("swapExactInput - should transfer tokens", async () => {

      const sqrtRatioX96 = ((await pool.slot0()).sqrtPriceX96).toString();
      const sqrtPriceLimitX96 =
        (new bn(sqrtRatioX96).plus(sqrtRatioX96).multipliedBy(0.1)).toFixed(0);

      let token0A = (await ethers.getContractAt("TestERC20", await pool.token0()));
      let token1A = (await ethers.getContractAt("TestERC20", await pool.token1()));

      let swap = await strategy.swap(
        false,
        true,
        encodePath([token0.address, token1.address], [3000]),
        constants.MaxUint256,
        expandTo18Decimals(0.0001),
        0,
        sqrtPriceLimitX96);

      expect(swap).to.emit(token0A, "Transfer").withArgs(strategy.address, pool.address, expandTo18Decimals(0.0001));
      expect(swap).to.emit(token1A, "Transfer").withArgs(pool.address, strategy.address, '300068242774103142');
        
    });


    it("swapExactInputSingle - should swap the amount", async () => {
      const sqrtRatioX96 = ((await pool.slot0()).sqrtPriceX96).toString();
      const sqrtPriceLimitX96 =
        (new bn(sqrtRatioX96).plus(sqrtRatioX96).multipliedBy(0.01)).toFixed(0);
     
      const params = {
        zeroForOne: false,
        fee: 0,
        recipient: strategy.address,
        deadline: constants.MaxUint256,
        amountIn: expandTo18Decimals(0.0001),
        amountOutMinimum: 0,
        sqrtPriceLimitX96: sqrtPriceLimitX96
      } 

      await expect(
        await strategy.swap(
          false,
          true,
          encodePath([token0.address, token1.address], [3000]),
          constants.MaxUint256,
          expandTo18Decimals(0.0001),
          0,
          sqrtPriceLimitX96
        )
      )
        .to.emit(pool, "Swap")
        .withArgs(
          router.address,
          strategy.address,
          "100000000000000",
          "-300068242774103142",
          BigInt("4346523400549810817866004402175"),
          80100
        );
    });


    it("swapExactInputSingle - should transfer tokens", async () => {
      const sqrtRatioX96 = ((await pool.slot0()).sqrtPriceX96).toString();
      const sqrtPriceLimitX96 =
        (new bn(sqrtRatioX96).plus(sqrtRatioX96).multipliedBy(0.6)).toFixed(0);
     
      let token0A = (await ethers.getContractAt("TestERC20", await pool.token0()));
      let token1A = (await ethers.getContractAt("TestERC20", await pool.token1()));

      const params = {
        zeroForOne: false,
        fee: 0,
        recipient: strategy.address,
        deadline: constants.MaxUint256,
        amountIn: expandTo18Decimals(0.0001),
        amountOutMinimum: 0,
        sqrtPriceLimitX96: sqrtPriceLimitX96
      } 

      let swap = await strategy.swap(
                  false,
                  false,
                  encodePath([token1.address, token0.address], [3000]),
                  constants.MaxUint256,
                  expandTo18Decimals(0.0001),
                  0,
                  sqrtPriceLimitX96
                )



      expect(swap).to.emit(token1A, "Transfer").withArgs(strategy.address, pool.address, expandTo18Decimals(0.0001));
      expect(swap).to.emit(token0A, "Transfer").withArgs(pool.address, strategy.address, '33126097943');
        
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
    .mint(expandTo18Decimals(1), expandTo18Decimals(3500), 0, 0, 0, 0);
}

function getPositionKey(address: any, lowerTick: any, upperTick: any) {
  return utils.keccak256(
    utils.solidityPack(
      ["address", "int24", "int24"],
      [address, lowerTick, upperTick]
    )
  );
}
