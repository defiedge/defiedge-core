//SPDX-License-Identifier: BSL
pragma solidity =0.7.6;

// libraries
import "../libraries/ShareHelper.sol";
import "../libraries/OracleLibrary.sol";
import "../libraries/DateTimeLibrary.sol";

// interfaces
import "../interfaces/IStrategyFactory.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract StrategyManager {
    using SafeMath for uint256;

    event ChangeFee(uint256 tier);
    event ChangeOperator(address indexed operator);
    event ChangeLimit(uint256 limit);
    event ChangeAllowedDeviation(uint256 deviation);
    event ClaimFee(uint256 managerFee, uint256 protocolFee);
    event ChangePerformanceFee(uint256 performanceFee);

    IStrategyFactory public factory;
    address public operator;
    address public pendingOperator;
    address public feeTo;

    // when true emergency functions will be frozen forever
    bool public freezeEmergency;

    // allowed price difference for the oracle and the current price
    // 1e18 is 100%
    uint256 public allowedDeviation;

    // allowed swap price difference for the oracle and the current price to increase swap counter
    // 1e18 is 100%
    uint256 public allowedSwapDeviation;

    // fee to take when user adds the liquidity
    uint256 public managementFee;

    // fees for the manager
    uint256 public performanceFee; // 1e8 is 100%

    // max number of shares to be minted
    // if set 0, allows unlimited deposits
    uint256 public limit;

    // number of times user can perform swap in a day
    uint256 public maxAllowedSwap;

    // current swap counter
    uint256 public swapCounter;

    // tracks timestamp of the last swap happened
    uint256 public lastSwapTimestamp;

    constructor(
        address _factory,
        address _operator,
        address _feeTo,
        uint256 _managementFee,
        uint256 _performanceFee,
        uint256 _limit,
        uint256 _allowedDeviation
    ) {
        factory = IStrategyFactory(_factory);
        operator = _operator;
        feeTo = _feeTo;

        managementFee = _managementFee;
        performanceFee = _performanceFee;
        limit = _limit;

        allowedDeviation = _allowedDeviation;
        allowedSwapDeviation = _allowedDeviation.div(2);
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

    modifier onlyStrategy() {
        require(msg.sender == strategy(), "N");
        _;
    }

    function strategy() public view returns (address) {
        return factory.strategyByManager(address(this));
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
        require(_performanceFee <= 20 * 1e6);
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
     * @notice Changes allowed price deviation for shares and pool
     * @param _allowedDeviation New allowed price deviation, 1e18 is 100%
     */
    function changeAllowedDeviation(uint256 _allowedDeviation)
        external
        onlyGovernance
    {
        allowedDeviation = _allowedDeviation;
        emit ChangeAllowedDeviation(_allowedDeviation);
    }

    /**
     * @notice Changes allowed price deviation for shares and pool
     * @param _allowedSwapDeviation New allowed price deviation, 1e18 is 100%
     */
    function changeSwapDeviation(uint256 _allowedSwapDeviation)
        external
        onlyGovernance
    {
        require(_allowedSwapDeviation < allowedDeviation, "ID");
        allowedSwapDeviation = _allowedSwapDeviation;
    }

    /**
     * @notice Track total swap performed in a day and revert if maximum swap limit reached. 
     *         Can only be called by strategy contract
     */
    function increamentSwapCounter() external onlyStrategy() returns(bool){

        (, uint256 currentMonth, uint256 currentDay) = DateTimeLibrary.timestampToDate(block.timestamp);
        (, uint256 swapMonth,uint256 swapDay) = DateTimeLibrary.timestampToDate(lastSwapTimestamp);

        if(currentMonth == swapMonth && currentDay == swapDay){
            // last swap happened on same day

            require(maxAllowedSwap > swapCounter, "LR");

            lastSwapTimestamp = block.timestamp;
            swapCounter = swapCounter.add(1);
            return true;

        } else {
            // last swap happened on other day

            swapCounter = 1;
            lastSwapTimestamp = block.timestamp; 
            return true;

        }

    }

    /**
     * @notice Change strategy maximum swap limit for a day
     * @param _limit Number of shares the strategy can mint, 0 means unlimited
     */
    function changeMaxSwapLimit(uint256 _limit) external onlyOperator {
        maxAllowedSwap = _limit;
    }
}
