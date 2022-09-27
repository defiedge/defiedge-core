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
const PrivateOneInchHelperLibrary = ethers.getContractFactory("PrivateOneInchHelper");
const OracleLibraryLibrary = ethers.getContractFactory("OracleLibrary");
const ChainlinkRegistryMockFactory = ethers.getContractFactory(
  "ChainlinkRegistryMock"
);
const SwapRouterContract = ethers.getContractFactory("SwapRouter");

import { TestERC20 } from "../../typechain/TestERC20";
import { WETH9 } from "../../typechain/WETH9";
import { UniswapV3Factory } from "../../typechain/UniswapV3Factory";
import { UniswapV3Pool } from "../../typechain/UniswapV3Pool";
import { DefiEdgeStrategy } from "../../typechain/DefiEdgeStrategy";
import { StrategyManager } from "../../typechain/StrategyManager";
import { DefiEdgeStrategyDeployer } from "../../typechain/DefiEdgeStrategyDeployer";
import { DefiEdgeStrategyFactory } from "../../typechain/DefiEdgeStrategyFactory";
import { Periphery } from "../../typechain/Periphery";
import { UniswapV3OracleTest } from "../../typechain/UniswapV3OracleTest";
import { ShareHelper } from "../../typechain/ShareHelper";
import { LiquidityHelper } from "../../typechain/LiquidityHelper";
import { PrivateOneInchHelper } from "../../typechain/PrivateOneInchHelper";
import { OracleLibrary } from "../../typechain/OracleLibrary";
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
let factory: any;
let strategy: any;
let strategyManager: StrategyManager;
let strategyDeplopyer: DefiEdgeStrategyDeployer;
let periphery: Periphery;
let oracle: UniswapV3OracleTest;
let shareHelper: ShareHelper;
let liquidityHelper: LiquidityHelper;
let privateOneInchHelper: PrivateOneInchHelper;
let oracleLibrary: OracleLibrary;
let chainlinkRegistry: ChainlinkRegistryMock;
let router: SwapRouter;
let weth9: WETH9;

describe("DeFiEdgeStrategy - Personal", () => {
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

    privateOneInchHelper = (await (
      await PrivateOneInchHelperLibrary
    ).deploy()) as PrivateOneInchHelper;

    // const DefiEdgeStrategyDeployerContract = ethers.getContractFactory(
    //   "DefiEdgeStrategyDeployer",
    //   {
    //     libraries: {
    //       ShareHelper: shareHelper.address,
    //       OracleLibrary: oracleLibrary.address,
    //       LiquidityHelper: liquidityHelper.address,
    //       OneInchHelper: oneInchHelper.address,
    //     },
    //   }
    // );

    // strategyDeplopyer = (await (
    //   await DefiEdgeStrategyDeployerContract
    // ).deploy()) as DefiEdgeStrategyDeployer;

    // chainlinkRegistry = (await (
    //   await ChainlinkRegistryMockFactory
    // ).deploy(
    //   await pool.token0(),
    //   await pool.token1()
    // )) as ChainlinkRegistryMock;

    // await chainlinkRegistry.setDecimals(8);
    // await chainlinkRegistry.setAnswer("300000000000", "100000000");

    const DefiEdgeStrategyFactoryF = await ethers.getContractFactory(
      "DefiEgdePrivateFactory",
      {
        libraries: {
          LiquidityHelper: liquidityHelper.address,
          PrivateOneInchHelper: privateOneInchHelper.address,
        },
      }
    );

    // deploy strategy factory
    factory = (await DefiEdgeStrategyFactoryF.deploy(
      signers[0].address,
      router.address
    )) ;


    // create strategy
    await factory.createStrategy(pool.address, signers[0].address);

    // get strategy
    strategy = (await ethers.getContractAt(
      "DefiEdgePrivateManager",
      await factory.strategyByIndex(await factory.totalIndex())
    ));

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
    it("should set oneInch swap router contract address", async () => {
      expect(await strategy.oneInchRouter()).to.be.equal(router.address);
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
  });


  describe("#Mint", async () => {

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

 

    it("should burn all previous liquidity and decrease tick amounts", async () => {

      await strategy.connect(signers[0]).rebalance(
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

      expect((await strategy.ticks(0)).amount0).to.eq("84513497141328");
      expect((await strategy.ticks(0)).amount1).to.eq("349999999999999995");

      // strategy.connect(signers[1]).rebalance(
      //   "0x",
      //   [
      //     {
      //       index: "0",
      //       burn: false,
      //       amount0: expandTo18Decimals(0.001),
      //       amount1: expandTo18Decimals(0.001),
      //     },
      //   ],
      //   [],
      //   false
      // )
      
      await strategy.connect(signers[0]).rebalance(
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

    // it("should mint liquidity and update tick amount", async () => {
    //   await approve(strategy.address, signers[0]);
    //   await strategy.deposit(expandTo18Decimals(1));
    //   await strategy.deposit(expandTo18Decimals(3500));

    //   // expect((await strategy.ticks(0)).amount0).to.eq("1000000000000000000");
    //   // expect((await strategy.ticks(0)).amount1).to.eq("3452260981108611401314");

    //   // await strategy.rebalance(
    //   //   "0x",
    //   //   [
    //   //     {
    //   //       index: "0",
    //   //       burn: false,
    //   //       amount0: expandTo18Decimals(1),
    //   //       amount1: expandTo18Decimals(3500),
    //   //     },
    //   //   ],
    //   //   [],
    //   //   false
    //   // );

    //   // expect((await strategy.ticks(0)).amount0).to.eq("2000000000000000000");
    //   // expect((await strategy.ticks(0)).amount1).to.eq("6904521962217222802628");
    // });

    it("should burn and redeploy all liquidity", async () => {

      await strategy.connect(signers[0]).rebalance(
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

      expect((await strategy.ticks(0)).amount0).to.eq("84513497141328");
      expect((await strategy.ticks(0)).amount1).to.eq("349999999999999995");

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

      expect((await strategy.ticks(0)).amount0).to.eq("833544548948182752");
      expect((await strategy.ticks(0)).amount1).to.eq("3451999999999999999995");

    });
  });

  describe("#Rebalance - newticks", async () => {
    beforeEach("add liquidity", async () => {
      await mint(signers[1]);
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
      console.log(await strategy.onHold())
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
    .deposit(expandTo18Decimals(1), expandTo18Decimals(3500));
}

function getPositionKey(address: any, lowerTick: any, upperTick: any) {
  return utils.keccak256(
    utils.solidityPack(
      ["address", "int24", "int24"],
      [address, lowerTick, upperTick]
    )
  );
}
