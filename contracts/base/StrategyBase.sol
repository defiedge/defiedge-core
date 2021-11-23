//SPDX-License-Identifier: BSL
pragma solidity =0.7.6;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

// import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../ERC20.sol";

import "../interfaces/IStrategyFactory.sol";
import "../interfaces/IStrategyManager.sol";

import "../libraries/ShareHelper.sol";
import "../libraries/OracleLibrary.sol";

// contract StrategyBase is ERC20("DEShare", "DefiEdge") {

contract StrategyBase is ERC20 {
    using SafeMath for uint256;

    event ChangeFee(uint256 tier);
    event ChangeOperator(address indexed operator);
    event ChangeLimit(uint256 limit);
    event ChangeAllowedDeviation(uint256 deviation);
    event ClaimFee(uint256 managerFee, uint256 protocolFee);
    event ChangePerformanceFee(uint256 performanceFee);

    struct Tick {
        uint256 amount0;
        uint256 amount1;
        int24 tickLower;
        int24 tickUpper;
    }

    // store ticks
    Tick[] public ticks;

    uint256 public accProtocolFee;
    uint256 public accManagementFee;

    IStrategyFactory public factory;
    IUniswapV3Pool public pool;
    bool[] public usdAsBase;

    IStrategyManager public manager;

    // Modifiers
    modifier onlyOperator() {
        require(msg.sender == manager.operator(), "N");
        _;
    }

    // Modifiers
    modifier onlyGovernance() {
        require(msg.sender == factory.governance(), "N");
        _;
    }

    /**
     * @dev Replaces old ticks with new ticks
     * @param _ticks New ticks
     */
    modifier validTicks(Tick[] memory _ticks) {
        // checks for valid ticks length
        require(_ticks.length <= 5, "ITL");
        for (uint256 i = 0; i < _ticks.length; i++) {
            int24 tickLower = _ticks[i].tickLower;
            int24 tickUpper = _ticks[i].tickUpper;

            // check that two tick upper and tick lowers are not in array cannot be same
            for (uint256 j = 0; j < i; j++) {
                if (i != j) {
                    if (tickLower == _ticks[j].tickLower) {
                        require(tickUpper != _ticks[j].tickUpper, "TS");
                    }
                }
            }
            _;
        }
    }

    /**
     * @dev Checks if it's valid strategy or not
     */
    modifier isValidStrategy() {
        // check if strategy is in denylist
        require(!factory.denied(address(this)), "DL");
        _;
    }

    /**
     * @dev checks if the pool is manipulated
     */
    modifier hasDeviation() {
        require(
            !OracleLibrary.hasDeviation(
                address(pool),
                factory.chainlinkRegistry(),
                usdAsBase,
                manager.allowedDeviation()
            ),
            "D"
        );
        _;
    }

    /**
     * @notice Updates the shares of the user
     * @param _amount0 Amount of token0
     * @param _amount1 Amount of token1
     * @param _totalAmount0 Total amount0 in the specific strategy
     * @param _totalAmount1 Total amount1 in the specific strategy
     * @param _user address where shares should be issued
     */
    function issueShare(
        uint256 _amount0,
        uint256 _amount1,
        uint256 _totalAmount0,
        uint256 _totalAmount1,
        address _user
    ) internal returns (uint256 share) {
        uint256 price = OracleLibrary.getPriceInUSD(
            factory.chainlinkRegistry(),
            pool.token0(),
            usdAsBase[0]
        );

        // calculate number of shares
        share = ShareHelper.calculateShares(
            _amount0,
            _amount1,
            _totalAmount0,
            _totalAmount1,
            totalSupply(),
            price
        );

        require(share > 0, "IS");

        uint256 managerShare;
        // strategy owner fees
        if (manager.feeTo() != address(0) && manager.managementFee() > 0) {
            managerShare = share.mul(manager.managementFee()).div(1e8);
            accManagementFee = accManagementFee.add(managerShare);
        }

        uint256 protocolShare;
        // take protocol fee
        if (factory.feeTo() != address(0)) {
            protocolShare = share.mul(factory.PROTOCOL_FEE()).div(1e8);
            accProtocolFee = accProtocolFee.add(protocolShare);
        }

        // issue shares
        _mint(_user, share.sub(managerShare).sub((protocolShare)));
    }

    /**
     * @notice Claims the fee for protocol and management
     */
    function claimFee() external {
        uint256 protocolFee = accProtocolFee;
        uint256 managerFee = accManagementFee;

        if (accProtocolFee > 0) {
            _mint(factory.feeTo(), accProtocolFee);
            accProtocolFee = 0;
        }

        if (accManagementFee > 0) {
            _mint(manager.feeTo(), accManagementFee);
            accManagementFee = 0;
        }

        emit ClaimFee(managerFee, protocolFee);
    }
}
