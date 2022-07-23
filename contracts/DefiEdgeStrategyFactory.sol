// SPDX-License-Identifier: BSL

pragma solidity ^0.7.6;
pragma abicoder v2;

import "./DefiEdgeStrategy.sol";
import "./base/StrategyManager.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./interfaces/IDefiEdgeStrategyDeployer.sol";
import "./interfaces/IStrategyBase.sol";

contract DefiEdgeStrategyFactory is IStrategyFactory{
    using SafeMath for uint256;

    mapping(uint256 => address) public override strategyByIndex; // map strategies by index
    mapping(address => bool) public override isValidStrategy; // make strategy valid when deployed

    mapping(address => address) public override strategyByManager; // strategy manager contracts linked with strategies

    // total number of strategies
    uint256 public override totalIndex;

    uint256 public constant MAX_PROTOCOL_PERFORMANCE_FEES = 20e6; // maximum 20%
    uint256 public override protocolPerformanceFee; // 1e8 means 100%

    uint256 public override protocolFee; // 1e8 means 100%
    uint256 public override allowedDeviation; // 1e18 means 100%
    uint256 public override allowedSlippage; // 1e18 means 100%

    uint256 public constant MAX_DECIMAL = 18; // pool token decimal should be less then 18

    // governance address
    address public override governance;

    // pending governance
    address public override pendingGovernance;

    // protocol fee
    address public override feeTo; // receive protocol fees here

    IDefiEdgeStrategyDeployer public override deployerProxy;
    IUniswapV3Factory public override uniswapV3Factory; // Uniswap V3 pool factory
    FeedRegistryInterface public override chainlinkRegistry; // Chainlink registry
    // Interface public swapRouter; // Uniswap V3 Swap Router
    IOneInchRouter public override oneInchRouter;

    // mapping of blacklisted strategies
    mapping(address => bool) public override denied;

    // Modifiers
    modifier onlyGovernance() {
        require(msg.sender == governance, "NO");
        _;
    }

    constructor(
        address _governance,
        IDefiEdgeStrategyDeployer _deployerProxy,
        FeedRegistryInterface _chainlinkRegistry,
        IUniswapV3Factory _uniswapV3factory,
        IOneInchRouter _oneInchRouter,
        uint256 _allowedSlippage,
        uint256 _allowedDeviation
    ) {
        require(_allowedSlippage <= 1e17); // should be <= 10%
        require(_allowedDeviation <= 1e17); // should be <= 10%
        governance = _governance;
        deployerProxy = _deployerProxy;
        uniswapV3Factory = _uniswapV3factory;
        chainlinkRegistry = _chainlinkRegistry;
        allowedSlippage = _allowedSlippage;
        allowedDeviation = _allowedDeviation;
        oneInchRouter = _oneInchRouter;
    }

    // /**
    //  * @notice Launches strategy contract
    //  * @param _pool Address of the pool
    //  * @param _operator Address of the operator
    //  * @param _ticks Array of the ticks
    //  */
    function createStrategy(CreateStrategyParams calldata params) external override{
        IUniswapV3Pool pool = IUniswapV3Pool(params.pool);

        require(
            IERC20Minimal(pool.token0()).decimals() <= MAX_DECIMAL &&
                IERC20Minimal(pool.token1()).decimals() <= MAX_DECIMAL,
            "ID"
        );

        address poolAddress = uniswapV3Factory.getPool(
            pool.token0(),
            pool.token1(),
            pool.fee()
        );

        require(
            poolAddress != address(0) && poolAddress == address(pool),
            "IP"
        );

        address manager = address(
            new StrategyManager(
                IStrategyFactory(address(this)),
                params.operator,
                params.feeTo,
                params.managementFee,
                protocolPerformanceFee.add(params.performanceFee),
                params.limit,
                allowedDeviation
            )
        );

        address strategy = deployerProxy.createStrategy
            (
                IStrategyFactory(address(this)),
                params.pool,
                oneInchRouter,
                chainlinkRegistry,
                IStrategyManager(manager),
                params.usdAsBase,
                params.ticks
            );

        strategyByManager[manager] = strategy;

        totalIndex = totalIndex.add(1);

        strategyByIndex[totalIndex] = strategy;

        isValidStrategy[strategy] = true;
        emit NewStrategy(strategy, msg.sender);
    }

    function changeDefaultAllowedDeviation(uint256 _allowedDeviation)
        external
        onlyGovernance
    {
        require(_allowedDeviation <= 1e17, "IA"); // should be less than 10%
        allowedDeviation = _allowedDeviation;
        emit ChangeDeviation(allowedDeviation);
    }

    function changeAllowedSlippage(uint256 _allowedSlippage)
        external
        onlyGovernance
    {
        require(_allowedSlippage <= 1e17, "IA"); // should be less than 10%
        allowedSlippage = _allowedSlippage;
        emit ChangeSlippage(allowedSlippage);
    }

    /**
     * @notice Changes protocol fees
     * @param _fee New fee in 1e8 format
     */
    function changeFee(uint256 _fee) external onlyGovernance {
        require(_fee <= 1e7, "IA"); // should be less than 10%
        protocolFee = _fee;
        emit ChangeProtocolFee(protocolFee);
    }

    /**
     * @notice Changes protocol performance fees
     * @param _fee New fee in 1e8 format
     */
    function changeProtocolPerformanceFee(uint256 _fee) external onlyGovernance {
        require(_fee <= MAX_PROTOCOL_PERFORMANCE_FEES, "IA"); // should be less than 20%
        protocolPerformanceFee = _fee;
        emit ChangeProtocolPerformanceFee(protocolPerformanceFee);
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
        pendingGovernance = _governance;
    }

    /**
     * @notice Change the operator
     */
    function acceptGovernance() external {
        require(msg.sender == pendingGovernance);
        governance = pendingGovernance;
    }

    /**
     * @notice Adds strategy to Denylist, rebalance and add liquidity will be stopped
     * @param _strategy Address of the strategy
     */
    function deny(address _strategy, bool _status) external onlyGovernance {
        denied[_strategy] = _status;
        emit StrategyStatusChanged(_status);
    }
}
