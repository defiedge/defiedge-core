// SPDX-License-Identifier: BSL

pragma solidity =0.7.6;
pragma abicoder v2;
import "./DefiEdgeStrategy.sol";

contract DefiEdgeStrategyDeployerProxy {
    /**
     * @notice Launches strategy contract
     * @param _pool Address of the pool
     * @param _operator Address of the operator
     * @param _ticks Array of the ticks
     */
    function createStrategy(
        address _pool,
        address _operator,
        bool[] memory _usdAsBase,
        DefiEdgeStrategy.Tick[] memory _ticks
    ) external returns (address strategy) {
        strategy = address(
            new DefiEdgeStrategy(
                address(this),
                _pool,
                _operator,
                _ticks,
                _usdAsBase
            )
        );
    }
}
