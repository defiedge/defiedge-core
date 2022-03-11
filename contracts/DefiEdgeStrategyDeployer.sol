// SPDX-License-Identifier: BSL

pragma solidity ^0.7.6;
pragma abicoder v2;

import "./DefiEdgeStrategy.sol";

contract DefiEdgeStrategyDeployer {
    function createStrategy(
        address _factory,
        address _pool,
        address _swapRouter,
        address _chainlinkRegistry,
        address _manager,
        bool[] memory _usdAsBase,
        DefiEdgeStrategy.Tick[] memory _ticks
    ) external returns (address strategy) {
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
    }
}
