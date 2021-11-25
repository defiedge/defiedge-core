import { ethers, waffle } from "hardhat";
import { BigNumber, utils, Signer } from "ethers";
import chai from "chai";

const TestERC20Factory = ethers.getContractFactory("TestERC20");
const WETH9Factory = ethers.getContractFactory("WETH9");
const UniswapV3FactoryFactory = ethers.getContractFactory("UniswapV3Factory");

const UniswapV3OracleTestFactory = ethers.getContractFactory(
  "UniswapV3OracleTest"
);
const ShareHelperLibrary = ethers.getContractFactory("ShareHelper");
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

    // deploy strategy factory
    shareHelper = (await (await ShareHelperLibrary).deploy()) as ShareHelper;

    liquidityHelper = (await (
      await LiquidityHelperLibrary
    ).deploy()) as LiquidityHelper;

    // deploy sharehelper library
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
      uniswapV3Factory.address,
      router.address
    )) as DefiEdgeStrategyFactory;

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

  describe("#Constants", async () => {
    it("should set onHold to false by default", async () => {
      expect(await strategy.onHold()).to.be.equal(false);
    });
    it("should set uniswap swap router contract address", async () => {
      expect(await strategy.swapRouter()).to.be.equal(router.address);
    });
  });

  describe("#Constructor", async () => {
    it("should pass via validStrategy modifier", async () => {
      expect(
        factory.createStrategy(
          pool.address,
          signers[0].address,
          [true, true],
          [
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
        )
      ).to.be.reverted;
    });
  });

  describe("#Mint", async () => {
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

    it("should revert if minted share is less than minimum share", async () => {
      expect(
        strategy.mint(
          expandTo18Decimals(1),
          expandTo18Decimals(3500),
          0,
          0,
          expandTo18Decimals(5000)
        )
      ).to.be.reverted;
    });

    it("should revert if minted amounts are less than minimum amounts", async () => {
      expect(
        strategy.mint(
          expandTo18Decimals(1),
          expandTo18Decimals(3500),
          expandTo18Decimals(1),
          expandTo18Decimals(3500),
          0
        )
      ).to.be.reverted;
    });

    it("should emit mint event with correct values", async () => {
      expect(await mint(signers[1]))
        .to.emit(strategy, "Mint")
        .withArgs(
          signers[1].address,
          "3452260981108611401314",
          expandTo18Decimals(1),
          "3452260981108611401314"
        );
    });
  });

  describe("#Burn", async () => {
    beforeEach("add liquidity", async () => {
      await mint(signers[0]);
    });

    it("should revert if msg.sender has no balance", async () => {
      expect(strategy.connect(signers[1]).burn(expandTo18Decimals(3000), 0, 0))
        .to.be.reverted;
    });

    it("should burn the liquidity", async () => {
      const tick = await strategy.ticks(0);

      let amount0 = 0,
        amount1 = 0;

      amount0 = parseInt(tick.amount0.toString());
      amount1 = parseInt(tick.amount1.toString());
      // const shares = parseInt((await strategy.balanceOf(signers[0].address)).toString())
      const shares = "3452260981108611401314";
      const totalSupply = parseInt((await strategy.totalSupply()).toString());

      // calculate amounts to be given back
      amount0 = (amount0 * parseInt(shares.toString())) / totalSupply;
      amount1 = (amount1 * parseInt(shares.toString())) / totalSupply;

      expect(await strategy.connect(signers[0]).burn(shares, 0, 0))
        .to.emit(pool, "Burn")
        .withArgs(
          strategy.address,
          calculateTick(2500, 60),
          calculateTick(3500, 60),
          "731166206079261908657",
          "999999999999999999",
          "3452260981108611401313"
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
      await strategy.connect(signers[0]).burn("3452260981108611401314", 0, 0);
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
      ).to.be.reverted;
    });

    it("should decrease the total supply (burn shares)", async () => {
      const totalSupplyBefore = parseInt(
        (await strategy.balanceOf(signers[0].address)).toString()
      );
      await strategy.connect(signers[0]).burn("3452260981108611401314", 0, 0);
      const totalSupplyAfter = parseInt(
        (await strategy.balanceOf(signers[0].address)).toString()
      );

      expect(0).to.equal(totalSupplyAfter);
    });

    it("should transfer amount0 back to the user", async () => {
      await strategy.connect(signers[0]).burn("3452260981108611401314", 0, 0);
      const balanceAfter = await token0.balanceOf(signers[0].address);
      expect("948499999999999999999999999").to.equal(balanceAfter.toString());
    });

    it("should transfer amount1 back to the user", async () => {
      await strategy.connect(signers[0]).burn("3452260981108611401314", 0, 0);
      const balanceAfter = await token1.balanceOf(signers[0].address);
      expect("998499989999999999999999999").to.equal(balanceAfter.toString());
    });

    it("should emit burn event", async () => {
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
        strategy.connect(signers[1]).rebalance([
          {
            amount0: expandTo18Decimals(0.001),
            amount1: expandTo18Decimals(0.001),
            tickLower: "60",
            tickUpper: "60",
          },
        ])
      ).to.be.reverted;
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
      ).to.be.reverted;
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
      oldTicks = await strategy.getTicks();
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
      expect(await strategy.getTicks()).to.not.equal(oldTicks);
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
      expect(await strategy.tickLength()).to.equal(0);
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
