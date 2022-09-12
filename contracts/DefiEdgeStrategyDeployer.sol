// SPDX-License-Identifier: BSL

pragma solidity ^0.7.6;
pragma abicoder v2;

import "./DefiEdgeStrategy.sol";
import "./interfaces/IStrategyBase.sol";
import "./interfaces/IDefiEdgeStrategyDeployer.sol";

contract DefiEdgeStrategyDeployer is IDefiEdgeStrategyDeployer {
    function createStrategy(
        IStrategyFactory _factory,
        IUniswapV3Pool _pool,
        IOneInchRouter _swapRouter,
        FeedRegistryInterface _chainlinkRegistry,
        IStrategyManager _manager,
        bool[2] memory _usdAsBase,
        IStrategyBase.Tick[] memory _ticks
    ) external override returns (address strategy) {
        strategy = address(
            new DefiEdgeStrategy(
                _factory,
                _pool,
                _swapRouter,
                _chainlinkRegistry,
                _manager,
                _usdAsBase,
                _ticks
            )
        );

        emit StrategyDeployed(address(strategy));
    }
}
