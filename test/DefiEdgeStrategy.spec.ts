import { ethers, waffle } from "hardhat";
import { BigNumber, utils, Signer } from "ethers";
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
);
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

    const ShareHelperLibrary = ethers.getContractFactory("ShareHelper", {
      libraries: {
        OracleLibrary: oracleLibrary.address
      }
    });

    // deploy strategy factory
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
    ).deploy(pool.token0(), pool.token1())) as ChainlinkRegistryMock;

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
      expect(await strategy.swapRouter()).to.be.equal(router.address);
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
      let tick = await strategy.ticks(0)

      expect(tick.amount0).to.be.equal(0);
      expect(tick.amount1).to.be.equal(0);
      expect(tick.tickLower).to.be.equal(calculateTick(2500, 60));
      expect(tick.tickUpper).to.be.equal(calculateTick(3500, 60));

    });

    it("validTicks - should revert if tick length is more than 5", async () => {
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
            amount0: "1",
            amount1: "1",
            tickLower: "60",
            tickUpper: "60",
          },
          {
            amount0: "2",
            amount1: "2",
            tickLower: "60",
            tickUpper: "60",
          },
          {
            amount0: "3",
            amount1: "3",
            tickLower: "60",
            tickUpper: "60",
          },
          {
            amount0: "4",
            amount1: "4",
            tickLower: "60",
            tickUpper: "60",
          },
          {
            amount0: "5",
            amount1: "5",
            tickLower: "60",
            tickUpper: "60",
          },
          {
            amount0: "6",
            amount1: "6",
            tickLower: "60",
            tickUpper: "60",
          }
        ]
      }
    
      expect(factory.createStrategy(params)).to.be.revertedWith('ITL');
    });
    it("validTicks - should revert if two ticks are the same", async () => {
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
        ]
      }
    
      expect(factory.createStrategy(params)).to.be.revertedWith('TS');
    });
  });

  describe("#Mint", async () => {
    it("should revert if strategy is onHold", async () => {

      await mint(signers[0])

      expect(await strategy.onHold()).to.equal(false);

      await strategy.hold();

      expect(await strategy.onHold()).to.equal(true);

      await expect(
        strategy.mint(expandTo18Decimals(1), expandTo18Decimals(3500), 0, 0, 0, 0)
      )
      .to.be.revertedWith("H")

    });
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

    it("should update the values in the second ticks", async () => {

      await mint(signers[0]);

      await strategy.rebalance([
        {
          amount0: expandTo18Decimals(0.001),
          amount1: expandTo18Decimals(0.3),
          tickLower: calculateTick(2500, 60),
          tickUpper: calculateTick(3300, 60),
        },
        {
          amount0: expandTo18Decimals(0.1),
          amount1: expandTo18Decimals(0.3),
          tickLower: calculateTick(3000, 60),
          tickUpper: calculateTick(4000, 60),
        }
      ]);

      await approve(strategy.address, signers[0]);
      await strategy.mint(expandTo18Decimals(1), expandTo18Decimals(3500), 0, 0, 0, 1);  

      expect((await strategy.ticks(1)).amount0).to.equal("1100000000000000000");
      expect((await strategy.ticks(1)).amount1).to.equal(
        "219340000016"
      );
    });

    it("should revert if minted share is less than minimum share", async () => {

      await approve(strategy.address, signers[0]);

      await expect(
        strategy.mint(
          expandTo18Decimals(1),
          expandTo18Decimals(3500),
          0,
          0,
          expandTo18Decimals(5000),
          0
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
          0,
          0
        )
      ).to.be.revertedWith("S");
    });

    it("should revert if minted amounts exceeds maximum share mint limit", async () => {

      await strategyManager.changeLimit(1);

      await approve(strategy.address, signers[0]);

      await expect(
        strategy.mint(
          expandTo18Decimals(1),
          expandTo18Decimals(3500),
          0,
          0,
          0,
          0
        )
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

    it("if tick number is less then 0 then transfer amount0 and amount 1 to strategy contract", async () => {

      await approve(strategy.address, signers[0]);
      let mint = await strategy.mint(expandTo18Decimals(1), expandTo18Decimals(3500), 0, 0, 0, -1);  

      let token0A = (await ethers.getContractAt("TestERC20", await pool.token0()));
      let token1A = (await ethers.getContractAt("TestERC20", await pool.token1()));

      await expect(mint).to.emit(token0A, "Transfer").withArgs(signers[0].address, strategy.address, expandTo18Decimals(1))
      await expect(mint).to.emit(token1A, "Transfer").withArgs(signers[0].address, strategy.address, expandTo18Decimals(3500))

    });
  });

  describe("#Burn", async () => {
    beforeEach("add liquidity", async () => {
      await mint(signers[0]);
    });

    it("should revert if msg.sender has no balance", async () => {
      expect(strategy.connect(signers[1]).burn(expandTo18Decimals(3000), 0, 0))
        .to.be.revertedWith("INS");
    });

    it("should calaculate unused balance while burning", async () => {
      await approve(strategy.address, signers[0]);
      await strategy.mint(expandTo18Decimals(0.1), expandTo18Decimals(10), 0, 0, 0, -1);

      let sBalance0 = (await token0.balanceOf(strategy.address)).toString()
      let sBalance1 = (await token1.balanceOf(strategy.address)).toString()

      // console.log('token0 balance: ' + sBalance0)
      // console.log('token1 balance: ' + sBalance1)

      await approve(strategy.address, signers[0]);
      await strategy.mint(expandTo18Decimals(0.0025), expandTo18Decimals(10), 0, 0, 0, 0);

      const shares = (await strategy.balanceOf(signers[0].address)).toString();
      // console.log('shares balance: '+ shares)

      await expect(strategy.connect(signers[0]).burn(shares, 0, 0))
        .to.emit(strategy, "Burn")
        .withArgs(
          signers[0].address,
          "64353139008112348158",
          "1092000062500000000",
          "3436319239516608135156"
        );    
    })

    it("should burn the liquidity", async () => {
      const tick = await strategy.ticks(0);

      let amount0 = tick.amount0.toString();
      let amount1 = tick.amount1.toString();

      // console.log('amount0: '+ amount0)
      // console.log('amount1: '+ amount1)

      const shares = (await strategy.balanceOf(signers[0].address)).toString();
      // const shares = "64199996762030683443";
      console.log('shares balance: '+ shares)

      const totalSupply = parseInt((await strategy.totalSupply()).toString());
      console.log('shares totalSupply: '+ totalSupply)

      // calculate amounts to be given back
      // amount0 = (amount0 * parseInt(shares.toString())) / totalSupply;
      // amount1 = (amount1 * parseInt(shares.toString())) / totalSupply;

      amount0 = new bn(amount0).multipliedBy(shares).dividedBy(totalSupply).toFixed(0);
      amount1 = new bn(amount1).multipliedBy(shares).dividedBy(totalSupply).toFixed(0);

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

      await strategy.rebalance([
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
        }
      ]);

      await approve(strategy.address, signers[0]);
      await strategy
        .connect(signers[0])
        .mint(expandTo18Decimals(1), expandTo18Decimals(3500), 0, 0, 0, 1);

      const tick = await strategy.ticks(0);
      const tick1 = await strategy.ticks(1);

      let amount0 = tick.amount0.toString();
      let amount1 = tick.amount1.toString();
      let amount02 = tick1.amount0.toString();
      let amount12 = tick1.amount1.toString();

      const shares = (await strategy.balanceOf(signers[0].address)).toString();
      // const shares = "64199996762030683443";
      console.log('shares balance: '+ shares)

      const totalSupply = parseInt((await strategy.totalSupply()).toString());
      console.log('shares totalSupply: '+ totalSupply)

      // calculate amounts to be given back
      // amount0 = (amount0 * parseInt(shares.toString())) / totalSupply;
      // amount1 = (amount1 * parseInt(shares.toString())) / totalSupply;

      amount0 = new bn(amount0).multipliedBy(shares).dividedBy(totalSupply).toFixed(0);
      amount1 = new bn(amount1).multipliedBy(shares).dividedBy(totalSupply).toFixed(0);

      // console.log('amount0: '+ amount0)
      // console.log('amount1: '+ amount1)

      await expect(strategy.connect(signers[0]).burn(shares, 0, 0))
        .to.emit(strategy, "Burn")
        .withArgs(
          signers[0].address,
          "119709387062427261951",
          "1680713802397508225",
          "6898328513703068344365"
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
      console.log('shares balance: '+ shares)

      const totalSupply = parseInt((await strategy.totalSupply()).toString());
      console.log('shares totalSupply: '+ totalSupply)

      // calculate amounts to be given back
      amount0 = new bn(amount0).multipliedBy(shares).dividedBy(totalSupply).toFixed(0);
      amount1 = new bn(amount1).multipliedBy(shares).dividedBy(totalSupply).toFixed(0);

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

      await expect(claimFee).to.emit(strategy, "ClaimFee").withArgs("322613049055430570", "0");

      const sharesFeeto = (await strategy.balanceOf(signers[1].address)).toString();
      // const shares = "64199996762030683443";
      console.log('shares balance feeTo: '+ sharesFeeto)

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
    })

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
      let token0A = (await ethers.getContractAt("TestERC20", await pool.token0()));
      const balanceAfter = await token0A.balanceOf(signers[0].address);
      expect("948499999990024999999999999").to.equal(balanceAfter.toString());
    });

    it("should transfer amount1 back to the user", async () => {
      await strategy.connect(signers[0]).burn("64199996762030683443", 0, 0);
      let token1A = (await ethers.getContractAt("TestERC20", await pool.token1()));
      const balanceAfter = await token1A.balanceOf(signers[0].address);
      expect("998499955563696713441601275").to.equal(balanceAfter.toString());
    });

    it("should emit burn event", async () => {
      const shares = "64199996762030683443";
      expect(await strategy.connect(signers[0]).burn(shares, 0, 0))
        .to.emit(strategy, "Burn")
        .withArgs(
          signers[0].address,
          shares,
          "990024999999999999",
          "3417824677822053002589"
        );
    });
  });

  describe("#Rebalance", async () => {
    beforeEach("add liquidity", async () => {
      await mint(signers[1]);
    });

    it("should revert there is price difference", async () => {
      await chainlinkRegistry.setAnswer(
        expandTo18Decimals(3000),
        expandTo18Decimals(0.01)
      );
      expect(
        strategy.rebalance([
          {
            amount0: expandTo18Decimals(0.001),
            amount1: expandTo18Decimals(0.001),
            tickLower: "60",
            tickUpper: "60",
          },
        ])
      ).to.be.revertedWith('D');
    });

    it("should revert if caller is not operator", async () => {
      expect(
        strategy.connect(signers[1]).rebalance([
          {
            amount0: expandTo18Decimals(0.001),
            amount1: expandTo18Decimals(0.001),
            tickLower: "60",
            tickUpper: "60",
          },
        ])
      ).to.be.revertedWith("N");
    });

    it("should redeploy when funds are on hold", async () => {
      await strategy.hold();

      await strategy.rebalance([
        {
          amount0: expandTo18Decimals(0.001),
          amount1: expandTo18Decimals(0.3),
          tickLower: calculateTick(2500, 60),
          tickUpper: calculateTick(3300, 60),
        },
      ]);

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
      await strategy.rebalance([
        {
          amount0: expandTo18Decimals(0.001),
          amount1: expandTo18Decimals(0.3),
          tickLower: calculateTick(2500, 60),
          tickUpper: calculateTick(3300, 60),
        },
      ]);
      const position = await pool.positions(positionKey);
      expect(position.liquidity).to.equal(0);
    });

    it("should emit rebalance event with ticks", async () => {
      expect(
        strategy.rebalance([
          {
            amount0: expandTo18Decimals(0.001),
            amount1: expandTo18Decimals(0.3),
            tickLower: calculateTick(2500, 60),
            tickUpper: calculateTick(3300, 60),
          },
        ])
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
      strategy.rebalance([
        {
          amount0: expandTo18Decimals(0.001),
          amount1: expandTo18Decimals(0.3),
          tickLower: calculateTick(2500, 60),
          tickUpper: calculateTick(3300, 60),
        },
      ]);
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

  describe("#Hold", async () => {
    beforeEach("add liquidity and rebalance", async () => {
      await mint(signers[1]);
      await strategy.rebalance([
        {
          amount0: expandTo18Decimals(0.001),
          amount1: expandTo18Decimals(0.35),
          tickLower: calculateTick(2000, 60),
          tickUpper: calculateTick(4000, 60),
        },
      ]);
    });

    it("should set on hold to true", async () => {
      await strategy.hold();
      expect(await strategy.onHold()).to.equal(true);
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

    it("should delete the ticks", async () => {
      await strategy.hold();
      await expect(strategy.ticks(0)).to.be.reverted;
    });

    it("should emit the hold event", async () => {
      await strategy.hold();
      expect(strategy.hold()).to.emit(strategy, "Hold");
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
