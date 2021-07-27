// SPDX-License-Identifier: MIT

pragma solidity =0.7.6;
pragma abicoder v2;

import "./DefiEdgeStrategy.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract DefiEdgeStrategyFactory {
    using SafeMath for uint256;

    event NewStrategy(address indexed strategy, address indexed creater);

    mapping(uint256 => address) public strategyByIndex; // map strategies by index
    mapping(address => bool) public isValid; // make strategy valid when deployed

    // total number of strategies
    uint256 public totalIndex;

    // governance address
    address public governance;

    // pending governance
    address public pendingGovernance;

    // protocol fee
    uint256 public PROTOCOL_FEE; // 1e8 means 100%
    address public feeTo; // receive protocol fees here

    // mapping of whitelisted pools
    mapping(address => bool) public whitelistedPools;

    // mapping of blacklisted strategies
    mapping(address => bool) public denied;

    // Modifiers
    modifier onlyGovernance() {
        require(
            msg.sender == governance,
            "Ownable: caller is not the governance"
        );
        _;
    }

    constructor(address _governance) {
        governance = _governance;
    }

    /**
     * @notice Launches strategy contract
     * @param _pool Address of the pool
     * @param _operator Address of the operator
     * @param _ticks Array of the ticks
     */
    function createStrategy(
        address _pool,
        address _operator,
        DefiEdgeStrategy.Tick[] memory _ticks
    ) external returns (address strategy) {
        strategy = address(
            new DefiEdgeStrategy(address(this), _pool, _operator, _ticks)
        );
        strategyByIndex[totalIndex.add(1)] = strategy;
        totalIndex = totalIndex.add(1);
        isValid[strategy] = true;
        emit NewStrategy(strategy, msg.sender);
    }

    /**
     * @notice Changes protocol fees
     * @param _fee New fee in 1e8 format
     */
    function changeProtocolFee(uint256 _fee) external onlyGovernance {
        PROTOCOL_FEE = _fee;
    }

    /**
     * @notice Change feeTo address
     * @param _feeTo New fee to address
     */
    function changeFeeTo(address _feeTo) external onlyGovernance {
        feeTo = _feeTo;
    }

    /**
     * @notice Change the governance address
     * @param _governance Address of the new governance
     */
    function changeGovernance(address _governance) external onlyGovernance {
        require(_governance != address(0), "invalid operator");
        pendingGovernance = _governance;
    }

    /**
     * @notice Change the operator
     */
    function acceptGovernance() external {
        require(msg.sender == pendingGovernance, "invalid match");
        governance = pendingGovernance;
    }

    /**
     * @notice Adds strategy to Denylist, rebalance and add liquidity will be stopped
     * @param _strategy Address of the strategy
     */
    function deny(address _strategy) external onlyGovernance() {
        denied[_strategy] = true;
    }

    /**
     * @notice Allows strategy to operate again
     * @param _strategy Address of the strategy
     */
    function allowAgain(address _strategy) external onlyGovernance() {
        denied[_strategy] = false;
    }
}
