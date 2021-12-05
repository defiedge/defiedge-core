// SPDX-License-Identifier: BSL

pragma solidity =0.7.6;
pragma abicoder v2;

import "./DefiEdgeStrategy.sol";
import "./base/StrategyManager.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

interface IDefiEdgeStrategyDeployer {
    function createStrategy(
        address _factory,
        address _pool,
        address _swapRouter,
        address _chainlinkRegistry,
        address _manager,
        bool[] memory _usdAsBase,
        DefiEdgeStrategy.Tick[] memory _ticks
    ) external returns (address);
}

contract DefiEdgeStrategyFactory {
    using SafeMath for uint256;

    event NewStrategy(address indexed strategy, address indexed creater);

    mapping(uint256 => address) public strategyByIndex; // map strategies by index
    mapping(address => bool) public isValid; // make strategy valid when deployed

    mapping(address => address) public strategyByManager; // strategy manager contracts linked with strategies

    // total number of strategies
    uint256 public totalIndex;

    uint256 public PROTOCOL_FEE; // 1e8 means 100%
    uint256 public allowedDeviation; // 1e18 means 1%
    uint256 public allowedSlippage; // 1e18 means 1%

    // governance address
    address public governance;

    // pending governance
    address public pendingGovernance;

    // protocol fee
    address public feeTo; // receive protocol fees here

    address public deployerProxy;
    address public uniswapV3Factory; // Uniswap V3 pool factory
    address public chainlinkRegistry; // Chainlink registry
    address public swapRouter; // Uniswap V3 Swap Router

    // mapping of blacklisted strategies
    mapping(address => bool) public denied;

    struct CreateStrategyParams {
        address operator;
        address feeTo;
        uint256 managementFee;
        uint256 performanceFee;
        uint256 limit;
        address pool;
        bool[] usdAsBase;
        DefiEdgeStrategy.Tick[] ticks;
    }

    // Modifiers
    modifier onlyGovernance() {
        require(msg.sender == governance, "NO");
        _;
    }

    constructor(
        address _governance,
        address _deployerProxy,
        address _chainlinkRegistry,
        address _uniswapV3factory,
        address _swapRouter,
        uint256 _allowedSlippage,
        uint256 _allowedDeviation
    ) {
        governance = _governance;
        deployerProxy = _deployerProxy;
        uniswapV3Factory = _uniswapV3factory;
        chainlinkRegistry = _chainlinkRegistry;
        swapRouter = _swapRouter;
        allowedSlippage = _allowedSlippage;
        allowedDeviation = _allowedDeviation;
    }

    // /**
    //  * @notice Launches strategy contract
    //  * @param _pool Address of the pool
    //  * @param _operator Address of the operator
    //  * @param _ticks Array of the ticks
    //  */
    function createStrategy(CreateStrategyParams calldata params) external {
        IUniswapV3Pool pool = IUniswapV3Pool(params.pool);

        require(
            IUniswapV3Factory(uniswapV3Factory).getPool(
                pool.token0(),
                pool.token1(),
                pool.fee()
            ) == address(pool),
            "IP"
        );

        address manager = address(
            new StrategyManager(
                address(this),
                params.operator,
                params.feeTo,
                params.managementFee,
                params.performanceFee,
                params.limit,
                allowedDeviation
            )
        );

        address strategy = IDefiEdgeStrategyDeployer(deployerProxy)
            .createStrategy(
                address(this),
                params.pool,
                swapRouter,
                chainlinkRegistry,
                manager,
                params.usdAsBase,
                params.ticks
            );

        strategyByManager[manager] = strategy;

        strategyByIndex[totalIndex.add(1)] = strategy;

        totalIndex = totalIndex.add(1);
        isValid[strategy] = true;
        emit NewStrategy(strategy, msg.sender);
    }

    function changeDefaultAllowedDeviation(uint256 _allowedDeviation)
        external
        onlyGovernance
    {
        allowedDeviation = _allowedDeviation;
    }

    function changeAllowedSlippage(uint256 _allowedSlippage)
        external
        onlyGovernance
    {
        allowedSlippage = _allowedSlippage;
    }

    /**
     * @notice Changes protocol fees
     * @param _fee New fee in 1e8 format
     */
    function changeFee(uint256 _fee) external onlyGovernance {
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
        require(_governance != address(0));
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
    function deny(address _strategy) external onlyGovernance {
        if (denied[_strategy]) {
            denied[_strategy] = false;
        } else {
            denied[_strategy] = true;
        }
    }
}
