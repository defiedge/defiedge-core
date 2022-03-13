//SPDX-License-Identifier: Unlicense
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@chainlink/contracts/src/v0.7/interfaces/FeedRegistryInterface.sol";
import "./IOneInchRouter.sol";
import "./IStrategyBase.sol";
import "./IDefiEdgeStrategyDeployer.sol";

interface IStrategyFactory {

    struct CreateStrategyParams {
        address operator;
        address feeTo;
        uint256 managementFee;
        uint256 performanceFee;
        uint256 limit;
        IUniswapV3Pool pool;
        bool[2] usdAsBase;
        IStrategyBase.Tick[] ticks;
    }

    function totalIndex() external view returns (uint256);

    function allowedDeviation() external view returns (uint256); // 1e18 means 100%

    function allowedSlippage() external view returns (uint256); // 1e18 means 100%

    function isValidStrategy(address) external view returns (bool);

    function strategyByIndex(uint256) external view returns (address);

    function strategyByManager(address) external view returns (address);

    function feeTo() external view returns (address);

    function denied(address) external view returns (bool);

    function protocolFee() external view returns (uint256);  // 1e8 means 100%

    function governance() external view returns (address);

    function pendingGovernance() external view returns (address);
    
    function deployerProxy() external view returns (IDefiEdgeStrategyDeployer);

    function uniswapV3Factory() external view returns (IUniswapV3Factory);

    function chainlinkRegistry() external view returns (FeedRegistryInterface);

    function oneInchRouter() external view returns (IOneInchRouter);

    function createStrategy(CreateStrategyParams calldata params) external;

    event NewStrategy (address indexed strategy, address indexed creater);
    event ChangeDeviation (uint256 deviation);
    event ChangeSlippage (uint256 slippage);
    event ChangeProtocolFee (uint256 fee);
    event StrategyStatusChanged (bool status);

}
