// SPDX-License-Identifier: BSL

pragma solidity ^0.7.6;
pragma abicoder v2;

import "./DefiEdgeStrategy.sol";
import "./base/StrategyManager.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./interfaces/IDefiEdgeStrategyDeployer.sol";
import "./interfaces/IStrategyBase.sol";

/**
 * @title DefiEdge Strategy Factory
 * @author DefiEdge Team
 * @notice A factory contract used to launch strategie's to manage assets on Uniswap V3
 */

contract DefiEdgeStrategyFactory is IStrategyFactory {
    using SafeMath for uint256;

    mapping(uint256 => address) public override strategyByIndex; // map strategies by index
    mapping(address => bool) public override isValidStrategy; // make strategy valid when deployed

    mapping(address => address) public override strategyByManager; // strategy manager contracts linked with strategies

    mapping(address => mapping(address => uint256)) internal _heartBeat; // map heartBeat for base and quote token

    // total number of strategies
    uint256 public override totalIndex;

    uint256 public constant MAX_PROTOCOL_PERFORMANCE_FEES_RATE = 20e6; // maximum 20%
    uint256 public override protocolPerformanceFeeRate; // 1e8 means 100%

    uint256 public override protocolFeeRate; // 1e8 means 100%
    uint256 public override allowedDeviation; // 1e18 means 100%
    uint256 public override allowedSlippage; // 1e18 means 100%

    uint256 public constant MAX_DECIMAL = 18; // pool token decimal should be less then 18

    // governance address
    address public override governance;

    // pending governance
    address public override pendingGovernance;

    // protocol fee
    address public override feeTo; // receive protocol fees here

    uint256 public override strategyCreationFee; // fee for strategy creation in native blockchain token

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

    /**
     * @inheritdoc IStrategyFactory
     */
    function createStrategy(CreateStrategyParams calldata params) external payable override {
        require(msg.value == strategyCreationFee, "INSUFFICIENT_FEES");

        IUniswapV3Pool pool = IUniswapV3Pool(params.pool);

        require(IERC20Minimal(pool.token0()).decimals() <= MAX_DECIMAL && IERC20Minimal(pool.token1()).decimals() <= MAX_DECIMAL, "ID");

        address poolAddress = uniswapV3Factory.getPool(pool.token0(), pool.token1(), pool.fee());

        require(poolAddress != address(0) && poolAddress == address(pool), "IP");

        address manager = address(
            new StrategyManager(
                IStrategyFactory(address(this)),
                params.operator,
                params.feeTo,
                params.managementFeeRate,
                params.performanceFeeRate,
                params.limit,
                allowedDeviation
            )
        );

        address strategy = deployerProxy.createStrategy(
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

    /**
     * @notice Change default allowed deviation for the Chainlink, Transaction will fail if the deviation is more than allowed deviation
     * @dev It'll be copied to the all the new strategies and can be updated for the pool individually.
     * @param _allowedDeviation The deviation which is allowed
     */
    function changeDefaultAllowedDeviation(uint256 _allowedDeviation) external onlyGovernance {
        require(_allowedDeviation <= 1e17, "IA"); // should be less than 10%
        allowedDeviation = _allowedDeviation;
        emit ChangeDeviation(allowedDeviation);
    }

    /**
     * @notice Change's allowed slippage for the swap()
     * @param _allowedSlippage Allowed slippage
     */
    function changeAllowedSlippage(uint256 _allowedSlippage) external onlyGovernance {
        require(_allowedSlippage <= 1e17, "IA"); // should be less than 10%
        allowedSlippage = _allowedSlippage;
        emit ChangeSlippage(allowedSlippage);
    }

    /**
     * @notice Changes protocol fees
     * @param _fee New fee in 1e8 format
     */
    function changeProtocolFeeRate(uint256 _fee) external onlyGovernance {
        require(_fee <= 1e7, "IA"); // should be less than 10%
        protocolFeeRate = _fee;
        emit ChangeProtocolFee(protocolFeeRate);
    }

    /**
     * @notice Changes protocol performance fees
     * @param _feeRate New fee in 1e8 format
     */
    function changeProtocolPerformanceFeeRate(uint256 _feeRate) external onlyGovernance {
        require(_feeRate <= MAX_PROTOCOL_PERFORMANCE_FEES_RATE, "IA"); // should be less than 20%
        protocolPerformanceFeeRate = _feeRate;
        emit ChangeProtocolPerformanceFee(protocolPerformanceFeeRate);
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
     * @notice Change the governance
     */
    function acceptGovernance() external {
        require(msg.sender == pendingGovernance);
        governance = pendingGovernance;
    }

    /**
     * @notice Adds strategy to Denylist, rebalance and add liquidity will be stopped
     * @param _strategy Address of the strategy
     * @param _status If true, it'll be blacklisted.
     */
    function deny(address _strategy, bool _status) external onlyGovernance {
        denied[_strategy] = _status;
        emit StrategyStatusChanged(_status);
    }

    /**
     * @notice Changes strategy creation fees
     * @param _fee New fee in 1e18 format
     */
    function changeFeeForStrategyCreation(uint256 _fee) external onlyGovernance {
        strategyCreationFee = _fee;
        emit ChangeStrategyCreationFee(strategyCreationFee);
    }

    /**
     * @notice Governance claims fees received from strategy creation
     * @param _to Address where the fees should be sent
     */
    function claimFees(address _to) external onlyGovernance {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            payable(_to).transfer(balance);
            emit ClaimFees(_to, balance);
        }
    }

    /**
     * @notice Update heartBeat for specific feeds
     * @param _base base token address
     * @param _quote quote token address
     * @param _period heartbeat in seconds
     */
    function setMinHeartbeat(
        address _base,
        address _quote,
        uint256 _period
    ) external onlyGovernance {
        _heartBeat[_base][_quote] = _period;
        _heartBeat[_quote][_base] = _period;
    }

    /**
     * @notice Fetch heartBeat for specific feeds, if hearbeat is 0 then it will return 3600 seconds by default
     * @param _base base token address
     * @param _quote quote token address
     */
    function getHeartBeat(address _base, address _quote) external view override returns (uint256) {
        if (_heartBeat[_base][_quote] == 0) {
            return 3600;
        } else {
            return _heartBeat[_base][_quote];
        }
    }
}
