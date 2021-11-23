//SPDX-License-Identifier: BSL
pragma solidity =0.7.6;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "../interfaces/IStrategyFactory.sol";
import "../libraries/ShareHelper.sol";
import "../libraries/OracleLibrary.sol";

contract StrategyManager {
    using SafeMath for uint256;

    event ChangeFee(uint256 tier);
    event ChangeOperator(address indexed operator);
    event ChangeLimit(uint256 limit);
    event ChangeAllowedDeviation(uint256 deviation);
    event ClaimFee(uint256 managerFee, uint256 protocolFee);
    event ChangePerformanceFee(uint256 performanceFee);

    // fee to take when user adds the liquidity
    uint256 public managementFee;
    // fees for the manager
    uint256 public performanceFee; // 1e8 is 100%

    address public operator;
    address public pendingOperator;

    // max number of shares to be minted
    // if set 0, allows unlimited deposits
    uint256 public limit;

    // Uniswap pool for the strategy

    // when true emergency functions will be frozen forever
    bool public freezeEmergency;

    // allowed price difference for the oracle and the current price
    // 1e18 is 1%
    uint256 public allowedDeviation;

    address public feeTo;

    IStrategyFactory public factory;

    constructor() {
        allowedDeviation = 1;
    }

    // Modifiers
    modifier onlyOperator() {
        require(msg.sender == operator, "N");
        _;
    }

    // Modifiers
    modifier onlyGovernance() {
        require(msg.sender == factory.governance(), "N");
        _;
    }

    /**
     * @notice Changes the fee
     * @dev 1000000 is 1%
     * @param _fee Fee tier from indexes 0 to 2
     */
    function changeFee(uint256 _fee) public onlyOperator {
        managementFee = _fee;
        emit ChangeFee(managementFee);
    }

    /**
     * @notice changes address where the operator is receiving the fee
     * @param _newFeeTo New address where fees should be received
     */
    function changeFeeTo(address _newFeeTo) external onlyOperator {
        feeTo = _newFeeTo;
    }

    /**
     * @notice Change the operator
     * @param _operator Address of the new operator
     */
    function changeOperator(address _operator) external onlyOperator {
        require(_operator != address(0));
        require(_operator != operator);
        pendingOperator = _operator;
    }

    /**
     * @notice Change the operator
     */
    function acceptOperator() external {
        require(msg.sender == pendingOperator);
        operator = pendingOperator;
        emit ChangeOperator(pendingOperator);
    }

    /**
     * @notice Change strategy limit in terms of share
     * @param _limit Number of shares the strategy can mint, 0 means unlimited
     */
    function changeLimit(uint256 _limit) external onlyOperator {
        limit = _limit;
    }

    /**
     * @notice Manager can set the performance fee
     * @param _performanceFee New performance fee, should not be more than 20%
     */
    function changePerformanceFee(uint256 _performanceFee)
        external
        onlyOperator
    {
        require(_performanceFee <= 2 * 1e6);
        performanceFee = _performanceFee;
        emit ChangePerformanceFee(_performanceFee);
    }

    /**
     * @notice Freeze emergency function, can be done only once
     */
    function freezeEmergencyFunctions() external onlyGovernance {
        freezeEmergency = true;
    }

    /**
     * @notice Changes allowed price deviation
     * @param _allowedDeviation New allowed price deviation, 1e18 is 100%
     */
    function changeAllowedDeviation(uint256 _allowedDeviation)
        external
        onlyGovernance
    {
        allowedDeviation = _allowedDeviation;
        emit ChangeAllowedDeviation(_allowedDeviation);
    }
}
