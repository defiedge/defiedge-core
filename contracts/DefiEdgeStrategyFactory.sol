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
    address pendingGovernance;

    // protocol fee
    uint256 public PROTOCOL_FEE; // 1e8 means 100%
    address public feeTo; // receive protocol fees here

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
     */
    function createStrategy(address _pool, address _operator)
        external
        returns (address strategy)
    {
        strategy = address(
            new DefiEdgeStrategy(address(this), _pool, _operator)
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
    function acceptOperator() external {
        require(msg.sender == pendingGovernance, "invalid match");
        governance = pendingGovernance;
    }
}
