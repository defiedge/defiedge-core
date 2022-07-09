import { ethers, waffle } from "hardhat";
import { BigNumber, Signer } from "ethers";
import chai from "chai";

const TestERC20Factory = ethers.getContractFactory("TestERC20");
const WETH9Factory = ethers.getContractFactory("WETH9");
const UniswapV3FactoryFactory = ethers.getContractFactory("UniswapV3Factory");

const ShareHelperTestFactory = ethers.getContractFactory("ShareHelperTest");
const UniswapV3OracleTestFactory = ethers.getContractFactory(
  "UniswapV3OracleTest"
);

const LiquidityHelperLibrary = ethers.getContractFactory("LiquidityHelper");
const OneInchHelperLibrary = ethers.getContractFactory("OneInchHelper");
const OracleLibraryLibrary = ethers.getContractFactory("OracleLibrary");
const ChainlinkRegistryMockFactory = ethers.getContractFactory(
  "ChainlinkRegistryMock"
)
const SwapRouterContract = ethers.getContractFactory(
  "SwapRouter"
);
const UniswapV3TwapContract = ethers.getContractFactory("UniswapV3Twap");

import { TestERC20 } from "../typechain/TestERC20";
import { WETH9 } from "../typechain/WETH9";
import { UniswapV3Factory } from "../typechain/UniswapV3Factory";
import { UniswapV3Pool } from "../typechain/UniswapV3Pool";
import { DefiEdgeStrategy } from "../typechain/DefiEdgeStrategy";
import { StrategyManager } from "../typechain/StrategyManager";
import { DefiEdgeStrategyDeployer } from "../typechain/DefiEdgeStrategyDeployer";
import { DefiEdgeStrategyFactory } from "../typechain/DefiEdgeStrategyFactory";
import { Periphery } from "../typechain/Periphery";
import { ShareHelperTest } from "../typechain/ShareHelperTest";
import { UniswapV3OracleTest } from "../typechain/UniswapV3OracleTest";
import { ShareHelper } from "../typechain/ShareHelper";
import { LiquidityHelper } from "../typechain/LiquidityHelper";
import { OneInchHelper } from "../typechain/OneInchHelper";
import { OracleLibrary } from "../typechain/OracleLibrary";
import { ChainlinkRegistryMock } from "../typechain/ChainlinkRegistryMock";
import { SwapRouter } from "../typechain/SwapRouter";
import { UniswapV3Twap } from "../typechain/UniswapV3Twap";

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
let factory;
let strategy: DefiEdgeStrategy;
let strategyManager: StrategyManager;
let strategyDeplopyer: DefiEdgeStrategyDeployer;
let periphery: Periphery;
let shareHelper: ShareHelperTest;
let oracle: UniswapV3OracleTest;
let shareHelperL: ShareHelper;
let liquidityHelper: LiquidityHelper;
let oneInchHelper: OneInchHelper;
let oracleLibrary: OracleLibrary;
let chainlinkRegistry: ChainlinkRegistryMock;
let router: SwapRouter;
let weth9: WETH9;
let uniswapV3Twap: UniswapV3Twap;
let uniswapV3Factory: UniswapV3Factory;

describe("UniswapV3Twap", () => {
    beforeEach(async () => {
        signers = await ethers.getSigners();

        // deploy tokens
        token0 = (await (await TestERC20Factory).deploy(18)) as TestERC20;
        token1 = (await (await TestERC20Factory).deploy(18)) as TestERC20;
        weth9 = (await (await WETH9Factory).deploy()) as WETH9;

        // deploy uniswap factory
        uniswapV3Factory = (await (
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
    
        // deploy sharehelper library
        const ShareHelperLibrary = ethers.getContractFactory("ShareHelper");
        shareHelperL = (await (await ShareHelperLibrary).deploy()) as ShareHelper;

        liquidityHelper = (await (
        await LiquidityHelperLibrary
        ).deploy()) as LiquidityHelper;

        oneInchHelper = (await (await OneInchHelperLibrary).deploy()) as OneInchHelper;

        const DefiEdgeStrategyDeployerContract = ethers.getContractFactory("DefiEdgeStrategyDeployer",
        {
            libraries: {
            ShareHelper: shareHelperL.address,
            OracleLibrary: oracleLibrary.address,
            LiquidityHelper: liquidityHelper.address,
            OneInchHelper: oneInchHelper.address
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

        uniswapV3Twap = (await (await UniswapV3TwapContract).deploy(chainlinkRegistry.address,pool.address, await pool.token0())) as UniswapV3Twap;

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

        // deploy strategy factory
        shareHelper = (await (
        await ShareHelperTestFactory
        ).deploy()) as ShareHelperTest;

        oracle = (await (
        await UniswapV3OracleTestFactory
        ).deploy()) as UniswapV3OracleTest;
    });

    describe("#consult", async () => {
        it("should return correct token0 price in token1", async () => {

            // => token0 ETH, token1 DAI

            // return price of token0 in token1
            const price = await uniswapV3Twap.consult(pool.address,1800);
            expect(price).to.eq("2999796379020818450736") // 1 ETH = ~3000 DAI
        
        })

        it("should return correct token0 price in token1 - pool of ETH-USDT - decimals 18-6", async () => {
            let token2 = (await (await TestERC20Factory).deploy(6)) as TestERC20;
            await uniswapV3Factory.createPool(token1.address, token2.address, "3000");
            
            // get uniswap pool instance
            let ethUsdtpool = (await ethers.getContractAt("UniswapV3Pool",await uniswapV3Factory.getPool(token1.address, token2.address, "3000"))) as UniswapV3Pool;
    
            // initialize the pool
            await ethUsdtpool.initialize(
                encodePriceSqrt(
                    expandTo18Decimals(50000000),
                    expandTo18Decimals(150000000000)
                )
            );

            // add liquidity to the pool
            await token1.approve(periphery.address, expandTo18Decimals(50000000));
            await token2.approve(periphery.address, expandTo18Decimals(150000000000));


            await periphery.mintLiquidity(
                ethUsdtpool.address,
                calculateTick(3000, 60),
                calculateTick(4000, 60),
                "150000000000000000",
                expandTo18Decimals(50000000),
                signers[0].address
            );

            // increase cardinary
            await ethUsdtpool.increaseObservationCardinalityNext(150);

            // swap tokens
            const sqrtRatioX96 = (await ethUsdtpool.slot0()).sqrtPriceX96;

            const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9;

            await ethers.provider.send("evm_increaseTime", [1801]);

            await periphery.swap(
                ethUsdtpool.address,
                false,
                "10000000000000000000",
                expandToString(sqrtPriceLimitX96)
            );

            
            let chainlinkRegistryEthUsdt = (await (
                await ChainlinkRegistryMockFactory
            ).deploy(await ethUsdtpool.token0(), await ethUsdtpool.token1())) as ChainlinkRegistryMock;
        
            await chainlinkRegistryEthUsdt.setDecimals(8);
            await chainlinkRegistryEthUsdt.setAnswer(
                "300000000000",
                "100000000"
            );     

            let _uniswapV3Twap = (await (await UniswapV3TwapContract).deploy(
                chainlinkRegistryEthUsdt.address, 
                ethUsdtpool.address, 
                await ethUsdtpool.token0()
            )) as UniswapV3Twap;
            
            // return price of token0 in token1
            const price = await _uniswapV3Twap.consult(pool.address,1800);
            expect(price).to.eq("3009711562375639715186") // 1 ETH = ~3009 USDT
        })

    })

    describe("#latestRoundData", async () => {
        it("should return correct token0 price in USD", async () => {

            const price = await uniswapV3Twap.latestRoundData();
            expect(price.answer).to.eq("2999796379020818450736") // 1 ETH = ~3000 USD
        })

        it("should return correct token1 price in USD", async () => {

            let _uniswapV3Twap = (await (await UniswapV3TwapContract).deploy(chainlinkRegistry.address,pool.address, await pool.token1())) as UniswapV3Twap;

            const price = await _uniswapV3Twap.latestRoundData();
            expect(price.answer).to.eq("1000067878266873000") // 1 DAI = ~1 USD
        })

        it("should return correct token0 price in USD - pool of ETH-USDT - decimals 18-6", async () => {

            let token2 = (await (await TestERC20Factory).deploy(6)) as TestERC20;
            await uniswapV3Factory.createPool(token1.address, token2.address, "3000");
            
            // get uniswap pool instance
            let ethUsdtpool = (await ethers.getContractAt("UniswapV3Pool",await uniswapV3Factory.getPool(token1.address, token2.address, "3000"))) as UniswapV3Pool;
    
            // initialize the pool
            await ethUsdtpool.initialize(
                encodePriceSqrt(
                    expandTo18Decimals(50000000),
                    expandTo18Decimals(150000000000)
                )
            );

            // add liquidity to the pool
            await token1.approve(periphery.address, expandTo18Decimals(50000000));
            await token2.approve(periphery.address, expandTo18Decimals(150000000000));


            await periphery.mintLiquidity(
                ethUsdtpool.address,
                calculateTick(3000, 60),
                calculateTick(4000, 60),
                "150000000000000000",
                expandTo18Decimals(50000000),
                signers[0].address
            );

            // increase cardinary
            await ethUsdtpool.increaseObservationCardinalityNext(150);

            // swap tokens
            const sqrtRatioX96 = (await ethUsdtpool.slot0()).sqrtPriceX96;

            const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9;

            await ethers.provider.send("evm_increaseTime", [1801]);

            await periphery.swap(
                ethUsdtpool.address,
                false,
                "10000000000000000000",
                expandToString(sqrtPriceLimitX96)
            );

            
            let chainlinkRegistryEthUsdt = (await (
                await ChainlinkRegistryMockFactory
            ).deploy(await ethUsdtpool.token0(), await ethUsdtpool.token1())) as ChainlinkRegistryMock;
        
            await chainlinkRegistryEthUsdt.setDecimals(8);
            await chainlinkRegistryEthUsdt.setAnswer(
                "300000000000",
                "100000000"
            );     

            let _uniswapV3Twap = (await (await UniswapV3TwapContract).deploy(
                chainlinkRegistryEthUsdt.address, 
                ethUsdtpool.address, 
                await ethUsdtpool.token0()
            )) as UniswapV3Twap;
            const price = await _uniswapV3Twap.latestRoundData();
            expect(price.answer).to.eq("2999796379020818450736") // 1 ETH = ~3000 USD
        })

        it("should return correct token1 price in USD - pool of ETH-USDT - decimals 18-6", async () => {

            let token2 = (await (await TestERC20Factory).deploy(6)) as TestERC20;
            await uniswapV3Factory.createPool(token1.address, token2.address, "3000");
            
            // get uniswap pool instance
            let ethUsdtpool = (await ethers.getContractAt("UniswapV3Pool",await uniswapV3Factory.getPool(token1.address, token2.address, "3000"))) as UniswapV3Pool;
    
            // initialize the pool
            await ethUsdtpool.initialize(
                encodePriceSqrt(
                    expandTo18Decimals(50000000),
                    expandTo18Decimals(150000000000)
                )
            );

            // add liquidity to the pool
            await token1.approve(periphery.address, expandTo18Decimals(50000000));
            await token2.approve(periphery.address, expandTo18Decimals(150000000000));


            await periphery.mintLiquidity(
                ethUsdtpool.address,
                calculateTick(3000, 60),
                calculateTick(4000, 60),
                expandTo18Decimals(50000000),
                "150000000000000000",
                signers[0].address
            );

            // increase cardinary
            await ethUsdtpool.increaseObservationCardinalityNext(150);

            // swap tokens
            const sqrtRatioX96 = (await ethUsdtpool.slot0()).sqrtPriceX96;

            const sqrtPriceLimitX96 = Number(sqrtRatioX96) + Number(sqrtRatioX96) * 0.9;

            await ethers.provider.send("evm_increaseTime", [1801]);

            await periphery.swap(
                ethUsdtpool.address,
                false,
                "10000000000000000000",
                expandToString(sqrtPriceLimitX96)
            );

            
            let chainlinkRegistryEthUsdt = (await (
                await ChainlinkRegistryMockFactory
            ).deploy(await ethUsdtpool.token0(), await ethUsdtpool.token1())) as ChainlinkRegistryMock;
        
            await chainlinkRegistryEthUsdt.setDecimals(8);
            await chainlinkRegistryEthUsdt.setAnswer(
                "300000000000",
                "100000000"
            );     

            let _uniswapV3Twap = (await (await UniswapV3TwapContract).deploy(
                chainlinkRegistryEthUsdt.address, 
                ethUsdtpool.address, 
                await ethUsdtpool.token1()
            )) as UniswapV3Twap;
            const price = await _uniswapV3Twap.latestRoundData();
            expect(price.answer).to.eq("1000067878266873000") // 1 DAI = ~1 USD
        })

    })
});

async function approve(address: string, from: string | Signer | Provider) {
  // give approval
  await token0.connect(from).approve(address, expandTo18Decimals(150000000000));
  await token1.connect(from).approve(address, expandTo18Decimals(150000000000));
}
