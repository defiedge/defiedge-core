// SPDX-License-Identifier: BSL

pragma solidity ^0.7.6;
pragma abicoder v2;

import "./DefiEdgePrivateManager.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract DefiEgdePrivateFactory {
    using SafeMath for uint256;

    uint256 public PROTOCOL_FEE;
    address public governance;
    address public oneInchRouter;
    address public pendingGovernance;

    mapping(uint256 => address) public strategyByIndex; // map strategies by index

    uint256 public constant MAX_PROTOCOL_PERFORMANCE_FEES_RATE = 20e6; // maximum 20%
    uint256 public totalIndex;

    event NewStrategy(address strategy, address operator);
    event ChangeProtocolFee(uint256 fee);

    // Modifiers
    modifier onlyGovernance() {
        require(msg.sender == governance, "NO");
        _;
    }

    constructor(address _governance, address _oneInchRouter) {
        governance = _governance;
        oneInchRouter = _oneInchRouter;
    }

    /**
     * @notice Create private strategy
     * @param _pool Address of the pool
     * @param _operator Address of the operator
     */
    function createStrategy(address _pool, address _operator) external {
        address strategy = address(
            new DefiEdgePrivateManager(
                _pool,
                _operator,
                address(this),
                oneInchRouter
            )
        );
        totalIndex = totalIndex.add(1);
        strategyByIndex[totalIndex] = strategy;
        emit NewStrategy(strategy, msg.sender);
    }

    /**
     * @notice Change protocol fee
     * @param _fee New fee, should be less than 20%
     */
    function changeProtocolFee(uint256 _fee) external {
        require(_fee <= MAX_PROTOCOL_PERFORMANCE_FEES_RATE, "IA"); // should be less than 20%
        PROTOCOL_FEE = _fee;
        emit ChangeProtocolFee(_fee);
    }

    /**
     * @notice Change the governance address
     * @param _governance Address of the new governance
     */
    function changeGovernance(address _governance) external onlyGovernance {
        pendingGovernance = _governance;
    }

    /**
     * @notice Change the operator
     */
    function acceptGovernance() external {
        require(msg.sender == pendingGovernance);
        governance = pendingGovernance;
    }
}
