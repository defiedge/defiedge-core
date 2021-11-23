// SPDX-License-Identifier: BSL

pragma solidity =0.7.6;
pragma abicoder v2;

import "./DefiEdgeStrategy.sol";

contract DefiEdgeStrategyDeployer {
    function createStrategy(
        address _manager,
        address _pool,
        bool[] memory _usdAsBase,
        DefiEdgeStrategy.Tick[] memory _ticks
    ) external returns (address strategy) {
        strategy = address(
            new DefiEdgeStrategy(
                _manager,
                address(this),
                _pool,
                _ticks,
                _usdAsBase
            )
        );
    }
}
