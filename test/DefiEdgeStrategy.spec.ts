import { ethers, waffle } from "hardhat";
import { BigNumber, utils, Signer } from "ethers";
import chai from "chai";
import bn from "bignumber.js";

const TestERC20Factory = ethers.getContractFactory("TestERC20");
const WETH9Factory = ethers.getContractFactory("WETH9");
const UniswapV3FactoryFactory = ethers.getContractFactory("UniswapV3Factory");

const UniswapV3OracleTestFactory = ethers.getContractFactory(
  "UniswapV3OracleTest"
);

const LiquidityHelperLibrary = ethers.getContractFactory("LiquidityHelper");
const OneInchHelperLibrary = ethers.getContractFactory("OneInchHelper");
const OracleLibraryLibrary = ethers.getContractFactory("OracleLibrary");
const ChainlinkRegistryMockFactory = ethers.getContractFactory(
  "ChainlinkRegistryMock"
);
const SwapRouterContract = ethers.getContractFactory("SwapRouter");

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

describe("DeFiEdgeStrategy", () => {
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

    const ShareHelperLibrary = ethers.getContractFactory("ShareHelper");

    // deploy strategy factory
    shareHelper = (await (await ShareHelperLibrary).deploy()) as ShareHelper;

    liquidityHelper = (await (
      await LiquidityHelperLibrary
    ).deploy()) as LiquidityHelper;

    oneInchHelper = (await (
      await OneInchHelperLibrary
    ).deploy()) as OneInchHelper;

    const DefiEdgeStrategyDeployerContract = ethers.getContractFactory(
      "DefiEdgeStrategyDeployer",
      {
        libraries: {
          ShareHelper: shareHelper.address,
          OracleLibrary: oracleLibrary.address,
          LiquidityHelper: liquidityHelper.address,
          OneInchHelper: oneInchHelper.address,
        },
      }
    );

    strategyDeplopyer = (await (
      await DefiEdgeStrategyDeployerContract
    ).deploy()) as DefiEdgeStrategyDeployer;

    chainlinkRegistry = (await (
      await ChainlinkRegistryMockFactory
    ).deploy(
      await pool.token0(),
      await pool.token1()
    )) as ChainlinkRegistryMock;

    await chainlinkRegistry.setDecimals(8);
    await chainlinkRegistry.setAnswer("300000000000", "100000000");

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
    
    let params = {
      operator: signers[0].address,
      feeTo: signers[1].address,
      managementFee: "500000", // 0.5%
      performanceFee: "500000", // 0.5%
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
    };

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

  describe("#Constants", async () => {
    it("should set onHold to false by default", async () => {
      expect(await strategy.onHold()).to.be.equal(false);
    });
    it("should set uniswap swap router contract address", async () => {
      expect(await strategy.oneInchRouter()).to.be.equal(router.address);
    });
    it("should set strategy manager contract address by default", async () => {
      expect(await strategy.manager()).to.be.equal(strategyManager.address);
    });
    it("should set factory contract address by default", async () => {
      expect(await strategy.factory()).to.be.equal(factory.address);
    });
    it("should set pool contract address", async () => {
      expect(await strategy.pool()).to.be.equal(pool.address);
    });
    it("should set pool contract address", async () => {
      expect(await strategy.pool()).to.be.equal(pool.address);
    });
    it("should set usdAsBase", async () => {
      expect(await strategy.usdAsBase(0)).to.be.equal(true);
      expect(await strategy.usdAsBase(1)).to.be.equal(true);
    });
  });

  describe("#Constructor", async () => {
    it("should set ticks", async () => {
      let tick = await strategy.ticks(0);

      expect(tick.amount0).to.be.equal(0);
      expect(tick.amount1).to.be.equal(0);
      expect(tick.tickLower).to.be.equal(calculateTick(2500, 60));
      expect(tick.tickUpper).to.be.equal(calculateTick(3500, 60));
    });

    it("validTicks - should revert if tick length is more than 20", async () => {

      let usdAsBase: [boolean, boolean] = [true, true];

      let ticks = [];

      for (let i = 0; i < 30; i++) {
        ticks.push({
          amount0: "1",
          amount1: "1",
          tickLower: i,
          tickUpper: i + 1,
        });
      }

      let params = {
        operator: signers[0].address,
        feeTo: signers[1].address,
        managementFee: "500000", // 0.5%
        performanceFee: "500000", // 0.5%
        limit: 0,
        pool: pool.address,
        usdAsBase: usdAsBase,
        ticks,
      };

      await expect(factory.createStrategy(params)).to.be.revertedWith("ITL");
    });
    it("validTicks - should revert if two ticks are the same", async () => {
      let usdAsBase: [boolean, boolean] = [true, true];

      let params = {
        operator: signers[0].address,
        feeTo: signers[1].address,
        managementFee: "500000", // 0.5%
        performanceFee: "500000", // 0.5%
        limit: 0,
        pool: pool.address,
        usdAsBase: usdAsBase,
        ticks: [
          {
            amount0: "1",
            amount1: "1",
            tickLower: "60",
            tickUpper: "60",
          },
          {
            amount0: "1",
            amount1: "1",
            tickLower: "60",
            tickUpper: "60",
          },
        ],
      };

      await expect(factory.createStrategy(params)).to.be.revertedWith("IT");
    });
  });

  describe("#Mint", async () => {
    // it("should revert if strategy is onHold", async () => {

    //   await mint(signers[0])

    //   expect(await strategy.onHold()).to.equal(false);

    //   await strategy.hold();

    //   expect(await strategy.onHold()).to.equal(true);

    //   await expect(
    //     strategy.mint(expandTo18Decimals(1), expandTo18Decimals(3500), 0, 0, 0)
    //   )
    //   .to.be.revertedWith("H")

    // });
    it("should mint to the primary ticks", async () => {
      await expect(await mint(signers[1]))
        .to.emit(pool, "Mint")
        .withArgs(
          strategy.address,
          strategy.address,
          calculateTick(2500, 60),
          calculateTick(3500, 60),
          "731166206079261908657",
          expandTo18Decimals(1),
          "3452260981108611401314"
        );
    });

    it("should update the values in the ticks", async () => {
      await mint(signers[1]);
      expect((await strategy.ticks(0)).amount0).to.equal(expandTo18Decimals(1));
      expect((await strategy.ticks(0)).amount1).to.equal(
        "3452260981108611401314"
      );
    });

    // it("should update the values in the second ticks", async () => {

    //   await mint(signers[0]);

    //   await strategy.rebalance([
    //     {
    //       amount0: expandTo18Decimals(0.001),
    //       amount1: expandTo18Decimals(0.3),
    //       tickLower: calculateTick(2500, 60),
    //       tickUpper: calculateTick(3300, 60),
    //     },
    //     {
    //       amount0: expandTo18Decimals(0.1),
    //       amount1: expandTo18Decimals(0.3),
    //       tickLower: calculateTick(3000, 60),
    //       tickUpper: calculateTick(4000, 60),
    //     }
    //   ]);

    //   await approve(strategy.address, signers[0]);
    //   await strategy.mint(expandTo18Decimals(1), expandTo18Decimals(3500), 0, 0, 0, 1);

    //   expect((await strategy.ticks(1)).amount0).to.equal("1100000000000000000");
    //   expect((await strategy.ticks(1)).amount1).to.equal(
    //     "219340000016"
    //   );
    // });

    it("should revert if minted share is less than minimum share", async () => {
      await approve(strategy.address, signers[0]);

      await expect(
        strategy.mint(
          expandTo18Decimals(1),
          expandTo18Decimals(3500),
          0,
          0,
          expandTo18Decimals(5000)
        )
      ).to.be.revertedWith("SC");
    });

    it("should revert if minted amounts are less than minimum amounts", async () => {
      await expect(
        strategy.mint(
          expandTo18Decimals(1),
          expandTo18Decimals(3500),
          expandTo18Decimals(1),
          expandTo18Decimals(3500),
          0
        )
      ).to.be.revertedWith("S");
    });

    it("should revert if minted amounts exceeds maximum share mint limit", async () => {
      await strategyManager.changeLimit(1);

      await approve(strategy.address, signers[0]);

      await expect(
        strategy.mint(expandTo18Decimals(1), expandTo18Decimals(3500), 0, 0, 0)
      ).to.be.revertedWith("L");
    });

    it("should emit mint event with correct values", async () => {
      expect(await mint(signers[1]))
        .to.emit(strategy, "Mint")
        .withArgs(
          signers[1].address,
          "64522609811086114013",
          expandTo18Decimals(1),
          "3452260981108611401314"
        );
    });

    it("if amount0 is 0 and amount1 is not 0 then transfer amount1 to strategy contract", async () => {
      await approve(strategy.address, signers[0]);
      let mint = await strategy.mint(0, expandTo18Decimals(3500), 0, 0, 0);

      let token1A = await ethers.getContractAt(
        "TestERC20",
        await pool.token1()
      );

      await expect(mint)
        .to.emit(token1A, "Transfer")
        .withArgs(
          signers[0].address,
          strategy.address,
          expandTo18Decimals(3500)
        );
    });

    it("if amount0 is not 0 and amount1 is 0 then transfer amount0 to strategy contract", async () => {
      await approve(strategy.address, signers[0]);
      let mint = await strategy.mint(expandTo18Decimals(1), 0, 0, 0, 0);

      let token0A = await ethers.getContractAt(
        "TestERC20",
        await pool.token0()
      );

      await expect(mint)
        .to.emit(token0A, "Transfer")
        .withArgs(signers[0].address, strategy.address, expandTo18Decimals(1));
    });

    it("issue different amount of share when performanceFee is non-zero", async () => {

      // when performance fees is zero
      expect(await strategy.accPerformanceFee()).to.eq(0)
      
      expect(await strategy.totalSupply()).to.eq(0)

      await mint(signers[0])

      expect(await strategy.balanceOf(signers[0].address)).to.eq("64199996762030683443")

      const shareTobeBurned = (await strategy.balanceOf(signers[0].address)).toString();
  
      // swap tokens
      const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;

      const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9;
      await periphery.swap(
        pool.address,
        false,
        "10000000000000000000",
        expandToString(sqrtPriceLimitX96)
      );

      expect(await strategy.accPerformanceFee()).to.equal(0);

      await strategy.connect(signers[0]).burn(shareTobeBurned, 0, 0)

      // performance fees non-zero
      expect(await strategy.accPerformanceFee()).to.equal("53619");

      expect(await strategy.balanceOf(signers[0].address)).to.eq("0")

      await mint(signers[0])

      expect(await strategy.balanceOf(signers[0].address)).to.eq("64199996767509459938")

      await strategy.claimFee()

      expect(await strategy.accPerformanceFee()).to.equal("0");

    })

    it("issue different amount of share when performanceFee is zero", async () => {
        // performance fees is zero
        expect(await strategy.accPerformanceFee()).to.eq(0)
        
        expect(await strategy.totalSupply()).to.eq(0)
  
        await mint(signers[0])
  
        expect(await strategy.balanceOf(signers[0].address)).to.eq("64199996762030683443")
  
        const shareTobeBurned = (await strategy.balanceOf(signers[0].address)).toString();
    
        await strategy.connect(signers[0]).burn(shareTobeBurned, 0, 0)
  
        expect(await strategy.balanceOf(signers[0].address)).to.eq("0")
  
        await mint(signers[0])
  
        expect(await strategy.balanceOf(signers[0].address)).to.eq("64199996762030689403")
  
    })
  });

  describe("#Burn", async () => {
    beforeEach("add liquidity", async () => {
      await mint(signers[0]);
    });

    it("should revert if msg.sender has no balance", async () => {
      expect(
        strategy.connect(signers[1]).burn(expandTo18Decimals(3000), 0, 0)
      ).to.be.revertedWith("INS");
    });

    it("should calaculate unused balance while burning", async () => {
      await approve(strategy.address, signers[0]);
      await strategy.mint(expandTo18Decimals(0.1), 0, 0, 0, 0);
      await strategy.mint(0, expandTo18Decimals(10), 0, 0, 0);

      let sBalance0 = (await token0.balanceOf(strategy.address)).toString();
      let sBalance1 = (await token1.balanceOf(strategy.address)).toString();

      // console.log('token0 balance: ' + sBalance0)
      // console.log('token1 balance: ' + sBalance1)

      await approve(strategy.address, signers[0]);
      await strategy.mint(
        expandTo18Decimals(0.0025),
        expandTo18Decimals(10),
        0,
        0,
        0
      );

      const shares = (await strategy.balanceOf(signers[0].address)).toString();
      // console.log('shares balance: '+ shares)

      await expect(strategy.connect(signers[0]).burn(shares, 0, 0))
        .to.emit(strategy, "Burn")
        .withArgs(
          signers[0].address,
          "67444996753935760153",
          "1096987500000000000",
          "3453537175393576015189"
        );
    });

    it("should burn the liquidity", async () => {
      const tick = await strategy.ticks(0);

      let amount0 = tick.amount0.toString();
      let amount1 = tick.amount1.toString();

      // console.log('amount0: '+ amount0)
      // console.log('amount1: '+ amount1)

      const shares = (await strategy.balanceOf(signers[0].address)).toString();
      // const shares = "64199996762030683443";
      console.log("shares balance: " + shares);

      const totalSupply = parseInt((await strategy.totalSupply()).toString());
      console.log("shares totalSupply: " + totalSupply);

      // calculate amounts to be given back
      // amount0 = (amount0 * parseInt(shares.toString())) / totalSupply;
      // amount1 = (amount1 * parseInt(shares.toString())) / totalSupply;

      amount0 = new bn(amount0)
        .multipliedBy(shares)
        .dividedBy(totalSupply)
        .toFixed(0);
      amount1 = new bn(amount1)
        .multipliedBy(shares)
        .dividedBy(totalSupply)
        .toFixed(0);

      // console.log('amount0: '+ amount0)
      // console.log('amount1: '+ amount1)

      await expect(strategy.connect(signers[0]).burn(shares, 0, 0))
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

    it("should burn the liquidity with proper amounts when there is multiple ticks", async () => {
      await strategy.rebalance(
        "0x",
        [],
        [
          {
            amount0: expandTo18Decimals(0.1),
            amount1: expandTo18Decimals(350),
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3300, 60),
          },
          {
            amount0: expandTo18Decimals(0.001),
            amount1: expandTo18Decimals(3.5),
            tickLower: calculateTick(2200, 60),
            tickUpper: calculateTick(3600, 60),
          },
        ],
        true
      );

      await approve(strategy.address, signers[0]);
      await strategy
        .connect(signers[0])
        .mint(expandTo18Decimals(1), expandTo18Decimals(3500), 0, 0, 0);

      const tick = await strategy.ticks(0);
      const tick1 = await strategy.ticks(1);

      let amount0 = tick.amount0.toString();
      let amount1 = tick.amount1.toString();
      let amount02 = tick1.amount0.toString();
      let amount12 = tick1.amount1.toString();

      const shares = (await strategy.balanceOf(signers[0].address)).toString();
      // const shares = "64199996762030683443";
      console.log("shares balance: " + shares);

      const totalSupply = parseInt((await strategy.totalSupply()).toString());
      console.log("shares totalSupply: " + totalSupply);

      // calculate amounts to be given back
      // amount0 = (amount0 * parseInt(shares.toString())) / totalSupply;
      // amount1 = (amount1 * parseInt(shares.toString())) / totalSupply;

      amount0 = new bn(amount0)
        .multipliedBy(shares)
        .dividedBy(totalSupply)
        .toFixed(0);
      amount1 = new bn(amount1)
        .multipliedBy(shares)
        .dividedBy(totalSupply)
        .toFixed(0);

      // console.log('amount0: '+ amount0)
      // console.log('amount1: '+ amount1)

      await expect(strategy.connect(signers[0]).burn(shares, 0, 0))
        .to.emit(strategy, "Burn")
        .withArgs(
          signers[0].address,
          "117926706797723864562",
          "1625057001189772697",
          "6917499676203068344311"
        );
    });

    it("should operator claim fee and burn token", async () => {
      const tick = await strategy.ticks(0);

      let amount0 = tick.amount0.toString();
      let amount1 = tick.amount1.toString();

      // console.log('amount0: '+ amount0)
      // console.log('amount1: '+ amount1)

      const shares = (await strategy.balanceOf(signers[0].address)).toString();
      // const shares = "64199996762030683443";
      console.log("shares balance: " + shares);

      const totalSupply = parseInt((await strategy.totalSupply()).toString());
      console.log("shares totalSupply: " + totalSupply);

      // calculate amounts to be given back
      amount0 = new bn(amount0)
        .multipliedBy(shares)
        .dividedBy(totalSupply)
        .toFixed(0);
      amount1 = new bn(amount1)
        .multipliedBy(shares)
        .dividedBy(totalSupply)
        .toFixed(0);

      // console.log('amount0: '+ amount0)
      // console.log('amount1: '+ amount1)

      await expect(strategy.connect(signers[0]).burn(shares, 0, 0))
        .to.emit(pool, "Burn")
        .withArgs(
          strategy.address,
          calculateTick(2500, 60),
          calculateTick(3500, 60),
          "727510375048865599114",
          "994999999999999999",
          "3434999676203068344308"
        );

      await factory.changeFeeTo(signers[3].address);

      let claimFee = await strategy.claimFee();

      await expect(claimFee)
        .to.emit(strategy, "ClaimFee")
        .withArgs("322613049055430570", "0");

      const sharesFeeto = (
        await strategy.balanceOf(signers[1].address)
      ).toString();
      // const shares = "64199996762030683443";
      console.log("shares balance feeTo: " + sharesFeeto);

      await expect(strategy.connect(signers[1]).burn(sharesFeeto, 0, 0))
        .to.emit(pool, "Burn")
        .withArgs(
          strategy.address,
          calculateTick(2500, 60),
          calculateTick(3500, 60),
          "3655831030396309543",
          "4999999999999999",
          "17261304905543057005"
        );
    });

    it("should decrease the tick amount", async () => {
      let tick;
      tick = await strategy.ticks(0);
      const before = {
        amount0: expandToString(
          parseInt(tick.amount0.toString()) - 999999999999999998
        ),
        amount1: expandToString(
          parseInt(tick.amount1.toString()) - 3452260981108611401313
        ),
      };
      await strategy.connect(signers[0]).burn("64199996762030683443", 0, 0);
      tick = await strategy.ticks(0);
      const after = {
        amount0: "0",
        amount1: "0",
      };
      expect(before).to.eqls(after);
    });

    it("should revert if burned amounts are less than min amounts", async () => {
      expect(
        strategy
          .connect(signers[0])
          .burn(
            "3452260981108611401310",
            "1099999999999999999",
            "3552260981108611397869"
          )
      ).to.be.revertedWith("S");
    });

    it("should decrease the total supply (burn shares)", async () => {
      const totalSupplyBefore = parseInt(
        (await strategy.balanceOf(signers[0].address)).toString()
      );
      await strategy.connect(signers[0]).burn("64199996762030683443", 0, 0);
      const totalSupplyAfter = parseInt(
        (await strategy.balanceOf(signers[0].address)).toString()
      );

      expect(0).to.equal(totalSupplyAfter);
    });

    it("should transfer amount0 back to the user", async () => {
      await strategy.connect(signers[0]).burn("64199996762030683443", 0, 0);
      let token0A = await ethers.getContractAt(
        "TestERC20",
        await pool.token0()
      );
      const balanceAfter = await token0A.balanceOf(signers[0].address);
      expect("948499999994999999999999999").to.equal(balanceAfter.toString());
    });

    it("should transfer amount1 back to the user", async () => {
      await strategy.connect(signers[0]).burn("64199996762030683443", 0, 0);
      let token1A = await ethers.getContractAt(
        "TestERC20",
        await pool.token1()
      );
      const balanceAfter = await token1A.balanceOf(signers[0].address);
      expect("998499972738695094456942994").to.equal(balanceAfter.toString());
    });

    it("should emit burn event", async () => {
      const shares = "64199996762030683443";
      await expect(strategy.connect(signers[0]).burn(shares, 0, 0))
        .to.emit(strategy, "Burn")
        .withArgs(
          signers[0].address,
          shares,
          "994999999999999999",
          "3434999676203068344308"
        );
    });

    it("burn 25% - should calculate correct amount if there is unused balance", async () => {
      await approve(strategy.address, signers[0]);
      await strategy.mint(expandTo18Decimals(0.1), 0, 0, 0, 0);
      await strategy.mint(0, expandTo18Decimals(100), 0, 0, 0);

      await approve(strategy.address, signers[0]);
      await strategy.mint(
        expandTo18Decimals(1000),
        expandTo18Decimals(1000),
        0,
        0,
        0
      );

      let tick = await strategy.ticks(0);

      let token0A = await ethers.getContractAt(
        "TestERC20",
        await pool.token0()
      );
      let token1A = await ethers.getContractAt(
        "TestERC20",
        await pool.token1()
      );

      let unusedAmount0 = (
        await token0A.balanceOf(strategy.address)
      ).toString();
      let unusedAmount1 = (
        await token1A.balanceOf(strategy.address)
      ).toString();

      // console.log('unusedAmount0: ' + unusedAmount0)
      // console.log('unusedAmount1: ' + unusedAmount1)

      const shares = (await strategy.balanceOf(signers[0].address)).toString();
      const shareTotalSupply = (await strategy.totalSupply()).toString();

      let shareTobeBurned = new bn(shares).multipliedBy(0.25).toFixed(0);

      // console.log('shareTobeBurned: '+ shareTobeBurned)
      // console.log('shareTotalSupply: '+ shareTotalSupply)

      let unusedReturnAmount0 = new bn(unusedAmount0)
        .multipliedBy(shareTobeBurned)
        .dividedBy(shareTotalSupply)
        .toFixed(0);
      let unusedReturnAmount1 = new bn(unusedAmount1)
        .multipliedBy(shareTobeBurned)
        .dividedBy(shareTotalSupply)
        .toFixed(0);

      let returnAmount0 = new bn(tick.amount0.toString())
        .multipliedBy(shareTobeBurned)
        .dividedBy(shareTotalSupply)
        .toFixed(0);
      let returnAmount1 = new bn(tick.amount1.toString())
        .multipliedBy(shareTobeBurned)
        .dividedBy(shareTotalSupply)
        .toFixed(0);

      // console.log('tick amount0: ' + tick.amount0.toString())
      // console.log('tick amount1: ' + tick.amount1.toString())

      // console.log('returnAmount0: ' + returnAmount0)
      // console.log('returnAmount1: ' + returnAmount1)

      // console.log('unusedReturnAmount0: ' + unusedReturnAmount0)
      // console.log('unusedReturnAmount1: ' + unusedReturnAmount1)

      let totalAmount0 = new bn(unusedReturnAmount0)
        .plus(returnAmount0)
        .toFixed(0);
      let totalAmount1 = new bn(unusedReturnAmount1)
        .plus(returnAmount1)
        .minus(2)
        .toFixed(0);

      // console.log('totalAmount0: ' + totalAmount0)
      // console.log('totalAmount1: ' + totalAmount1)

      await expect(strategy.connect(signers[0]).burn(shareTobeBurned, 0, 0))
        .to.emit(strategy, "Burn")
        .withArgs(
          signers[0].address,
          shareTobeBurned,
          totalAmount0,
          totalAmount1
        );
    });

    it("burn 50% - should calculate correct amount if there is unused balance", async () => {
      await approve(strategy.address, signers[0]);
      await strategy.mint(expandTo18Decimals(0.1), 0, 0, 0, 0);
      await strategy.mint(0, expandTo18Decimals(100), 0, 0, 0);

      await approve(strategy.address, signers[0]);
      await strategy.mint(
        expandTo18Decimals(1000),
        expandTo18Decimals(1000),
        0,
        0,
        0
      );

      let tick = await strategy.ticks(0);

      let token0A = await ethers.getContractAt(
        "TestERC20",
        await pool.token0()
      );
      let token1A = await ethers.getContractAt(
        "TestERC20",
        await pool.token1()
      );

      let unusedAmount0 = (
        await token0A.balanceOf(strategy.address)
      ).toString();
      let unusedAmount1 = (
        await token1A.balanceOf(strategy.address)
      ).toString();

      // console.log('unusedAmount0: ' + unusedAmount0)
      // console.log('unusedAmount1: ' + unusedAmount1)

      const shares = (await strategy.balanceOf(signers[0].address)).toString();
      const shareTotalSupply = (await strategy.totalSupply()).toString();

      let shareTobeBurned = new bn(shares).multipliedBy(0.5).toFixed(0);

      // console.log('shareTobeBurned: '+ shareTobeBurned)
      // console.log('shareTotalSupply: '+ shareTotalSupply)

      let unusedReturnAmount0 = new bn(unusedAmount0)
        .multipliedBy(shareTobeBurned)
        .dividedBy(shareTotalSupply)
        .toFixed(0);
      let unusedReturnAmount1 = new bn(unusedAmount1)
        .multipliedBy(shareTobeBurned)
        .dividedBy(shareTotalSupply)
        .toFixed(0);

      let returnAmount0 = new bn(tick.amount0.toString())
        .multipliedBy(shareTobeBurned)
        .dividedBy(shareTotalSupply)
        .toFixed(0);
      let returnAmount1 = new bn(tick.amount1.toString())
        .multipliedBy(shareTobeBurned)
        .dividedBy(shareTotalSupply)
        .toFixed(0);

      // console.log('tick amount0: ' + tick.amount0.toString())
      // console.log('tick amount1: ' + tick.amount1.toString())

      // console.log('returnAmount0: ' + returnAmount0)
      // console.log('returnAmount1: ' + returnAmount1)

      // console.log('unusedReturnAmount0: ' + unusedReturnAmount0)
      // console.log('unusedReturnAmount1: ' + unusedReturnAmount1)

      let totalAmount0 = new bn(unusedReturnAmount0)
        .plus(returnAmount0)
        .toFixed(0);
      let totalAmount1 = new bn(unusedReturnAmount1)
        .plus(returnAmount1)
        .minus(2)
        .toFixed(0);

      // console.log('totalAmount0: ' + totalAmount0)
      // console.log('totalAmount1: ' + totalAmount1)

      await expect(strategy.connect(signers[0]).burn(shareTobeBurned, 0, 0))
        .to.emit(strategy, "Burn")
        .withArgs(
          signers[0].address,
          shareTobeBurned,
          totalAmount0,
          totalAmount1
        );
    });

    it("burn 75% - should calculate correct amount if there is unused balance", async () => {
      await approve(strategy.address, signers[0]);
      await strategy.mint(expandTo18Decimals(0.1), 0, 0, 0, 0);
      await strategy.mint(0, expandTo18Decimals(100), 0, 0, 0);

      await approve(strategy.address, signers[0]);
      await strategy.mint(
        expandTo18Decimals(1000),
        expandTo18Decimals(1000),
        0,
        0,
        0
      );

      let tick = await strategy.ticks(0);

      let token0A = await ethers.getContractAt(
        "TestERC20",
        await pool.token0()
      );
      let token1A = await ethers.getContractAt(
        "TestERC20",
        await pool.token1()
      );

      let unusedAmount0 = (
        await token0A.balanceOf(strategy.address)
      ).toString();
      let unusedAmount1 = (
        await token1A.balanceOf(strategy.address)
      ).toString();

      // console.log('unusedAmount0: ' + unusedAmount0)
      // console.log('unusedAmount1: ' + unusedAmount1)

      const shares = (await strategy.balanceOf(signers[0].address)).toString();
      const shareTotalSupply = (await strategy.totalSupply()).toString();

      let shareTobeBurned = new bn(shares).multipliedBy(0.75).toFixed(0);

      // console.log('shareTobeBurned: '+ shareTobeBurned)
      // console.log('shareTotalSupply: '+ shareTotalSupply)

      let unusedReturnAmount0 = new bn(unusedAmount0)
        .multipliedBy(shareTobeBurned)
        .dividedBy(shareTotalSupply)
        .toFixed(0);
      let unusedReturnAmount1 = new bn(unusedAmount1)
        .multipliedBy(shareTobeBurned)
        .dividedBy(shareTotalSupply)
        .toFixed(0);

      let returnAmount0 = new bn(tick.amount0.toString())
        .multipliedBy(shareTobeBurned)
        .dividedBy(shareTotalSupply)
        .toFixed(0);
      let returnAmount1 = new bn(tick.amount1.toString())
        .multipliedBy(shareTobeBurned)
        .dividedBy(shareTotalSupply)
        .toFixed(0);

      // console.log('tick amount0: ' + tick.amount0.toString())
      // console.log('tick amount1: ' + tick.amount1.toString())

      // console.log('returnAmount0: ' + returnAmount0)
      // console.log('returnAmount1: ' + returnAmount1)

      // console.log('unusedReturnAmount0: ' + unusedReturnAmount0)
      // console.log('unusedReturnAmount1: ' + unusedReturnAmount1)

      let totalAmount0 = new bn(unusedReturnAmount0)
        .plus(returnAmount0)
        .toFixed(0);
      let totalAmount1 = new bn(unusedReturnAmount1)
        .plus(returnAmount1)
        .minus(4)
        .toFixed(0);

      // console.log('totalAmount0: ' + totalAmount0)
      // console.log('totalAmount1: ' + totalAmount1)

      await expect(strategy.connect(signers[0]).burn(shareTobeBurned, 0, 0))
        .to.emit(strategy, "Burn")
        .withArgs(
          signers[0].address,
          shareTobeBurned,
          totalAmount0,
          totalAmount1
        );
    });

    it("burn 100% - should calculate correct amount if there is unused balance", async () => {
      await approve(strategy.address, signers[0]);
      await strategy.mint(expandTo18Decimals(0.1), 0, 0, 0, 0);
      await strategy.mint(0, expandTo18Decimals(100), 0, 0, 0);

      await approve(strategy.address, signers[0]);
      await strategy.mint(
        expandTo18Decimals(1000),
        expandTo18Decimals(1000),
        0,
        0,
        0
      );

      let tick = await strategy.ticks(0);

      let token0A = await ethers.getContractAt(
        "TestERC20",
        await pool.token0()
      );
      let token1A = await ethers.getContractAt(
        "TestERC20",
        await pool.token1()
      );

      let unusedAmount0 = (
        await token0A.balanceOf(strategy.address)
      ).toString();
      let unusedAmount1 = (
        await token1A.balanceOf(strategy.address)
      ).toString();

      // console.log('unusedAmount0: ' + unusedAmount0)
      // console.log('unusedAmount1: ' + unusedAmount1)

      const shares = (await strategy.balanceOf(signers[0].address)).toString();
      const shareTotalSupply = (await strategy.totalSupply()).toString();

      let shareTobeBurned = new bn(shares).multipliedBy(1).toFixed(0);

      // console.log('shareTobeBurned: '+ shareTobeBurned)
      // console.log('shareTotalSupply: '+ shareTotalSupply)

      let unusedReturnAmount0 = new bn(unusedAmount0)
        .multipliedBy(shareTobeBurned)
        .dividedBy(shareTotalSupply)
        .toFixed(0);
      let unusedReturnAmount1 = new bn(unusedAmount1)
        .multipliedBy(shareTobeBurned)
        .dividedBy(shareTotalSupply)
        .toFixed(0);

      let returnAmount0 = new bn(tick.amount0.toString())
        .multipliedBy(shareTobeBurned)
        .dividedBy(shareTotalSupply)
        .toFixed(0);
      let returnAmount1 = new bn(tick.amount1.toString())
        .multipliedBy(shareTobeBurned)
        .dividedBy(shareTotalSupply)
        .toFixed(0);

      // console.log('tick amount0: ' + tick.amount0.toString())
      // console.log('tick amount1: ' + tick.amount1.toString())

      // console.log('returnAmount0: ' + returnAmount0)
      // console.log('returnAmount1: ' + returnAmount1)

      // console.log('unusedReturnAmount0: ' + unusedReturnAmount0)
      // console.log('unusedReturnAmount1: ' + unusedReturnAmount1)

      let totalAmount0 = new bn(unusedReturnAmount0)
        .plus(returnAmount0)
        .toFixed(0);
      let totalAmount1 = new bn(unusedReturnAmount1)
        .plus(returnAmount1)
        .minus(4)
        .toFixed(0);

      // console.log('totalAmount0: ' + totalAmount0)
      // console.log('totalAmount1: ' + totalAmount1)

      await expect(strategy.connect(signers[0]).burn(shareTobeBurned, 0, 0))
        .to.emit(strategy, "Burn")
        .withArgs(
          signers[0].address,
          shareTobeBurned,
          totalAmount0,
          totalAmount1
        );
    });
    
      it("burn 100% - should calculate correct amount performance fees and return correct amount on totalSupply", async () => {
        await approve(strategy.address, signers[0]);
        await strategy.mint(expandTo18Decimals(0.1), 0, 0, 0, 0);
        await strategy.mint(0, expandTo18Decimals(100), 0, 0, 0);
    
        await approve(strategy.address, signers[0]);
        await strategy.mint(
          expandTo18Decimals(1000),
          expandTo18Decimals(1000),
          0,
          0,
          0
        );
    
        await factory.changeFee("1000000");
        await factory.changeFeeTo(signers[3].address);

        const shares = (await strategy.balanceOf(signers[0].address)).toString();
        const shareTotalSupply = (await strategy.totalSupply()).toString();
  
        let shareTobeBurned = new bn(shares).multipliedBy(1).toFixed(0);
  
        // swap tokens
        const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;

        const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9;
        await periphery.swap(
          pool.address,
          false,
          "10000000000000000000",
          expandToString(sqrtPriceLimitX96)
        );

        expect(await strategy.accPerformanceFee()).to.equal(0);

        await strategy.connect(signers[0]).burn(shareTobeBurned, 0, 0)

        expect(await strategy.accPerformanceFee()).to.equal("69151");

        let expectedSupply = new bn(shareTotalSupply).minus(shareTobeBurned).plus("69151").toFixed()
        console.log('expectedSupply: '+ expectedSupply)

        expect(await strategy.totalSupply()).to.eq(expectedSupply);
    
      })

      it("burn different amount when performanceFee is non-zero", async () => {

        // when performance fees is zero
        expect(await strategy.accPerformanceFee()).to.eq(0)
            
        expect(await strategy.balanceOf(signers[0].address)).to.eq("64199996762030683443")
  
        const shareTobeBurned1 = (await strategy.balanceOf(signers[0].address)).toString();
    
        // swap tokens
        const sqrtRatioX96 = (await pool.slot0()).sqrtPriceX96;
  
        const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9;
        await periphery.swap(
          pool.address,
          false,
          "10000000000000000000",
          expandToString(sqrtPriceLimitX96)
        );
  
        expect(await strategy.accPerformanceFee()).to.equal(0);
  
        await strategy.connect(signers[0]).burn(shareTobeBurned1, 0, 0)
  
        // performance fees non-zero
        expect(await strategy.accPerformanceFee()).to.equal("53619");
    
        await mint(signers[0])
  
        expect(await strategy.balanceOf(signers[0].address)).to.eq("64199996767509459938")

        await expect(strategy.connect(signers[0]).burn("60000000000000000000", 0, 0))
          .to.emit(strategy, "Burn")
          .withArgs(
            signers[0].address,
            "60000000000000000000",
            "929906588877015244",
            "3210280233568471039977"
          );
  
      })

      it("burn different amount when performanceFee is zero", async () => {

        // when performance fees is zero
        expect(await strategy.accPerformanceFee()).to.eq(0)
            
        expect(await strategy.balanceOf(signers[0].address)).to.eq("64199996762030683443")
  
        const shareTobeBurned1 = (await strategy.balanceOf(signers[0].address)).toString();
      
        await strategy.connect(signers[0]).burn(shareTobeBurned1, 0, 0)
  
        // performance fees zero
        expect(await strategy.accPerformanceFee()).to.equal("0");
    
        await mint(signers[0])
  
        expect(await strategy.balanceOf(signers[0].address)).to.eq("64199996762030689403")

        await expect(strategy.connect(signers[0]).burn("60000000000000000000", 0, 0))
          .to.emit(strategy, "Burn")
          .withArgs(
            signers[0].address,
            "60000000000000000000",
            "929906588956526429",
            "3210280233130420156483"
          );
  
      })
  });

  describe("#Rebalance - Hold", async () => {
    beforeEach("add liquidity and rebalance", async () => {
      await mint(signers[1]);
      await strategy.rebalance(
        "0x",
        [],
        [
          {
            amount0: expandTo18Decimals(0.001),
            amount1: expandTo18Decimals(0.35),
            tickLower: calculateTick(2000, 60),
            tickUpper: calculateTick(4000, 60),
          },
        ],
        true
      );
    });

    it("should set on hold to true", async () => {
      await strategy.rebalance("0x", [], [], true);
      expect(await strategy.onHold()).to.equal(true);
    });

    it("should burn all the liquidity", async () => {
      await strategy.rebalance("0x", [], [], true);
      const positionKey = getPositionKey(
        strategy.address,
        calculateTick(2500, 60),
        calculateTick(3500, 60)
      );

      const position = await pool.positions(positionKey);
      expect(position.liquidity).to.equal(0);
    });

    it("should delete the ticks", async () => {
      await strategy.rebalance("0x", [], [], true);
      await expect(strategy.ticks(0)).to.be.reverted;
    });

    it("should emit the hold event", async () => {
      await expect(strategy.rebalance("0x", [], [], true)).to.emit(
        strategy,
        "Hold"
      );
    });
  });

  describe("#Rebalance - partialRebalance", async () => {
    beforeEach("add liquidity", async () => {
      await mint(signers[1]);
    });

    it("should revert if caller is not operator", async () => {
      await expect(
        strategy.connect(signers[1]).rebalance(
          "0x",
          [
            {
              index: "0",
              burn: false,
              amount0: expandTo18Decimals(0.001),
              amount1: expandTo18Decimals(0.001),
            },
          ],
          [],
          false
        )
      ).to.be.revertedWith("N");
    });

    it("should revert if strategy is invalid", async () => {

      await factory.deny(strategy.address, true);

      await expect(
        strategy.rebalance(
          "0x",
          [
            {
              index: "0",
              burn: false,
              amount0: expandTo18Decimals(0.001),
              amount1: expandTo18Decimals(0.001),
            },
          ],
          [],
          false
        )
      ).to.be.revertedWith("DL");
    });

    it("should burn all previous liquidity and decrease tick amounts", async () => {
      expect((await strategy.ticks(0)).amount0).to.eq("1000000000000000000");
      expect((await strategy.ticks(0)).amount1).to.eq("3452260981108611401314");

      await strategy.rebalance(
        "0x",
        [
          {
            index: "0",
            burn: true,
            amount0: 0,
            amount1: 0,
          },
        ],
        [],
        false
      );

      await expect(strategy.ticks(0)).to.be.reverted;
    });

    it("should revert if contract have no balance left to mint liquidity", async () => {
      expect(await token0.balanceOf(strategy.address)).to.eq("0");
      expect(await token1.balanceOf(strategy.address)).to.eq("0");

      await expect(
        strategy.rebalance(
          "0x",
          [
            {
              index: "0",
              burn: false,
              amount0: expandTo18Decimals(0.001),
              amount1: expandTo18Decimals(0.001),
            },
          ],
          [],
          false
        )
      ).to.be.revertedWith("ST");
    });

    it("should mint liquidity and update tick amount", async () => {
      await approve(strategy.address, signers[0]);
      await strategy.mint(expandTo18Decimals(1), 0, 0, 0, 0);
      await strategy.mint(0, expandTo18Decimals(3500), 0, 0, 0);

      expect((await strategy.ticks(0)).amount0).to.eq("1000000000000000000");
      expect((await strategy.ticks(0)).amount1).to.eq("3452260981108611401314");

      await strategy.rebalance(
        "0x",
        [
          {
            index: "0",
            burn: false,
            amount0: expandTo18Decimals(1),
            amount1: expandTo18Decimals(3500),
          },
        ],
        [],
        false
      );

      expect((await strategy.ticks(0)).amount0).to.eq("2000000000000000000");
      expect((await strategy.ticks(0)).amount1).to.eq("6904521962217222802628");
    });

    it("should burn and redeploy all liquidity", async () => {
      expect((await strategy.ticks(0)).amount0).to.eq("1000000000000000000");
      expect((await strategy.ticks(0)).amount1).to.eq("3452260981108611401314");

      await strategy.rebalance(
        "0x",
        [
          {
            index: "0",
            burn: true,
            amount0: expandTo18Decimals(1),
            amount1: expandTo18Decimals(3452),
          },
        ],
        [],
        false
      );

      expect((await strategy.ticks(0)).amount0).to.eq("999924402844964638");
      expect((await strategy.ticks(0)).amount1).to.eq("3451999999999999999998");

    });
  });

  describe("#Rebalance - newticks", async () => {
    beforeEach("add liquidity", async () => {
      await mint(signers[1]);
    });

    it("should revert there is price difference", async () => {
      await chainlinkRegistry.setAnswer(
        expandTo18Decimals(3000),
        expandTo18Decimals(0.01)
      );
      await expect(
        strategy.rebalance(
          "0x",
          [],
          [
            {
              amount0: expandTo18Decimals(0.001),
              amount1: expandTo18Decimals(0.001),
              tickLower: "60",
              tickUpper: "60",
            },
          ],
          true
        )
      ).to.be.revertedWith("D");
    });

    it("should revert if caller is not operator", async () => {
      await expect(
        strategy.connect(signers[1]).rebalance(
          "0x",
          [],
          [
            {
              amount0: expandTo18Decimals(0.001),
              amount1: expandTo18Decimals(0.001),
              tickLower: "60",
              tickUpper: "60",
            },
          ],
          true
        )
      ).to.be.revertedWith("N");
    });

    it("should redeploy when funds are on hold", async () => {
      await strategy.rebalance("0x", [], [], true); // hold

      await strategy.rebalance(
        "0x",
        [],
        [
          {
            amount0: expandTo18Decimals(0.001),
            amount1: expandTo18Decimals(0.3),
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3300, 60),
          },
        ],
        true
      );

      const tick = await strategy.ticks(0);

      const ticks = {
        amount0: tick.amount0,
        amount1: tick.amount1,
        tickLower: tick.tickLower,
        tickUpper: tick.tickUpper,
      };

      expect(ticks).to.eqls({
        amount0: BigNumber.from(expandTo18Decimals(0.000054276267152027)),
        amount1: BigNumber.from(expandTo18Decimals(0.3)),
        tickLower: 78300,
        tickUpper: 81060,
      });
    });

    it("should burn liquidity", async () => {
      const positionKey = getPositionKey(
        strategy.address,
        calculateTick(2500, 60),
        calculateTick(3500, 60)
      );
      await strategy.rebalance(
        "0x",
        [],
        [
          {
            amount0: expandTo18Decimals(0.001),
            amount1: expandTo18Decimals(0.3),
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3300, 60),
          },
        ],
        true
      );
      const position = await pool.positions(positionKey);
      expect(position.liquidity).to.equal(0);
    });

    it("should emit rebalance event with ticks", async () => {
      await expect(
        strategy.rebalance(
          "0x",
          [],
          [
            {
              amount0: expandTo18Decimals(0.001),
              amount1: expandTo18Decimals(0.3),
              tickLower: calculateTick(2500, 60),
              tickUpper: calculateTick(3300, 60),
            },
          ],
          true
        )
      ).to.emit(strategy, "Rebalance");
    });
  });

  describe("#Redeploy", async () => {
    let oldTicks: ([BigNumber, BigNumber, number, number] & {
      amount0: BigNumber;
      amount1: BigNumber;
      tickLower: number;
      tickUpper: number;
    })[];

    beforeEach("Rebalance the ticks", async () => {
      await mint(signers[1]);
      oldTicks = [await strategy.ticks(0)];
      await strategy.rebalance(
        "0x",
        [],
        [
          {
            amount0: expandTo18Decimals(0.001),
            amount1: expandTo18Decimals(0.3),
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3300, 60),
          },
        ],
        true
      );
    });

    it("should set onHold to false", async () => {
      expect(await strategy.onHold()).to.equal(false);
    });

    it("should delete ticks", async () => {
      expect([await strategy.ticks(0)]).to.not.equal(oldTicks);
    });

    it("should mint liquidity to the ticks", async () => {
      const positionKey = getPositionKey(
        strategy.address,
        calculateTick(2500, 60),
        calculateTick(3300, 60)
      );
      const position = await pool.positions(positionKey);
      expect(position.liquidity.toString()).to.equal("63538030011085543");
    });

    it("should push new tick and amounts to ticks", async () => {
      const tick = await strategy.ticks(0);
      const newTick = {
        amount0: tick.amount0.toString(),
        amount1: tick.amount1.toString(),
        tickLower: tick.tickLower.toString(),
        tickUpper: tick.tickUpper.toString(),
      };
      expect(newTick).to.eqls({
        amount0: expandTo18Decimals(0.000054276267152027),
        amount1: expandTo18Decimals(0.3),
        tickLower: "78300",
        tickUpper: "81060",
      });
    });
  });

  // describe("#Swap", async () => {
  //   beforeEach("add some liquidity", async () => {
  //     await mint(signers[0]);
  //     await strategy.hold();
  //   });

  //   it("should revert if caller is not operator", async () => {
  //     const sqrtRatioX96 = ((await pool.slot0()).sqrtPriceX96).toString();
  //     const sqrtPriceLimitX96 =
  //       (new bn(sqrtRatioX96).plus(sqrtRatioX96).multipliedBy(0.1)).toFixed(0);

  //     const params = {
  //       zeroForOne: true,
  //       fee: 0,
  //       recipient: signers[0].address,
  //       deadline: constants.MaxUint256,
  //       amountIn: expandTo18Decimals(0.0001),
  //       amountOutMinimum: 0,
  //       sqrtPriceLimitX96: sqrtPriceLimitX96
  //     }
  //     await expect(
  //       strategy
  //         .connect(signers[1])
  //         .swapExactInputSingle(params)
  //     ).to.be.revertedWith('N');
  //   });

  //   it("should burn all liquidity", async () => {
  //     const positionKey = getPositionKey(
  //       strategy.address,
  //       calculateTick(2500, 60),
  //       calculateTick(3500, 60)
  //     );

  //     const position = await pool.positions(positionKey);
  //     expect(position.liquidity).to.equal(0);
  //   });

  //   it("should delete the ticks", async () => {
  //     expect(await strategy.tickLength()).to.equal(0);
  //   });

  //   it("should swap the amount", async () => {
  //     const sqrtRatioX96 = ((await pool.slot0()).sqrtPriceX96).toString();
  //     const sqrtPriceLimitX96 =
  //       (new bn(sqrtRatioX96).plus(sqrtRatioX96).multipliedBy(0.6)).toFixed(0);

  //     const params = {
  //       zeroForOne: false,
  //       fee: 0,
  //       recipient: strategy.address,
  //       deadline: constants.MaxUint256,
  //       amountIn: expandTo18Decimals(0.0001),
  //       amountOutMinimum: 0,
  //       sqrtPriceLimitX96: sqrtPriceLimitX96
  //     }

  //     await expect(
  //       await strategy.swapExactInputSingle(params)
  //     )
  //       .to.emit(pool, "Swap")
  //       .withArgs(
  //         router.address,
  //         strategy.address,
  //         -33126097943,
  //         expandTo18Decimals(0.0001),
  //         BigInt("4346523400550973496567325094984"),
  //         80100
  //       );
  //   });

  // it("should emit swap event with correct valuess", async () => {
  //   const sqrtRatioX96 = ((await pool.slot0()).sqrtPriceX96).toString();
  //   const sqrtPriceLimitX96 =
  //     (new bn(sqrtRatioX96).plus(sqrtRatioX96).multipliedBy(0.6)).toFixed(0);

  //   const params = {
  //     zeroForOne: false,
  //     fee: 0,
  //     recipient: strategy.address,
  //     deadline: constants.MaxUint256,
  //     amountIn: expandTo18Decimals(0.0001),
  //     amountOutMinimum: 0,
  //     sqrtPriceLimitX96: sqrtPriceLimitX96
  //   }

  //   expect(
  //     await strategy.swapExactInputSingle(params)
  //   )
  //     .to.emit(strategy, "Swap")
  //     .withArgs(expandTo18Decimals(0.001), 331260979439, false);
  // });
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
