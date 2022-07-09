//SPDX-License-Identifier: BSL
pragma solidity ^0.7.6;
pragma abicoder v2;

// contracts
import "../ERC20.sol";

// libraries
import "../libraries/ShareHelper.sol";
import "../libraries/OracleLibrary.sol";

contract StrategyBase is ERC20, IStrategyBase {
    using SafeMath for uint256;

    uint256 public constant FEE_PRECISION = 1e8;
    bool public override onHold;

    // store ticks
    Tick[] public ticks;

    uint256 public override accManagementFee;
    uint256 public accPerformanceFee;

    IStrategyFactory public override factory; // instance of the strategy factory
    IUniswapV3Pool public override pool; // instance of the Uniswap V3 pool

    IERC20 internal token0;
    IERC20 internal token1;

    IOneInchRouter public override oneInchRouter; // instance of the Uniswap V3 Periphery Swap Router
    FeedRegistryInterface internal chainlinkRegistry;

    IStrategyManager public override manager; // instance of manager contract

    bool[2] public override usdAsBase; // for Chainlink oracle

    uint256 public constant MAX_TICK_LENGTH = 20;

    // Modifiers
    modifier onlyOperator() {
        require(manager.isAllowedToManage(msg.sender), "N");
        _;
    }

    /**
     * @dev Replaces old ticks with new ticks
     * @param _ticks New ticks
     */
    function isInvalidTicks(Tick[] memory _ticks)
        internal
        pure
        returns (bool invalid)
    {
        for (uint256 i = 0; i < _ticks.length; i++) {
            int24 tickLower = _ticks[i].tickLower;
            int24 tickUpper = _ticks[i].tickUpper;

            // check that two tick upper and tick lowers are not in array cannot be same
            for (uint256 j = 0; j < i; j++) {
                if (tickLower == _ticks[j].tickLower) {
                    if (tickUpper == _ticks[j].tickUpper) {
                        invalid = true;
                        return invalid;
                    }
                    // require(tickUpper != _ticks[j].tickUpper, "TS");
                }
            }
        }
    }

    /**
     * @dev Checks if it's valid strategy or not
     */
    modifier onlyValidStrategy() {
        // check if strategy is in denylist
        require(!factory.denied(address(this)), "DL");
        _;
    }

    /**
     * @dev checks if the pool is manipulated
     */
    modifier onlyHasDeviation() {
        require(
            !OracleLibrary.hasDeviation(
                pool,
                chainlinkRegistry,
                usdAsBase,
                address(manager)
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
        // calculate number of shares
        share = ShareHelper.calculateShares(
            chainlinkRegistry,
            pool,
            usdAsBase,
            _amount0,
            _amount1,
            _totalAmount0,
            _totalAmount1,
            totalSupply()
        );

        require(share > 0, "IS");

        uint256 managerShare;
        uint256 managementFee = manager.managementFee();
        // strategy owner fees
        if (managementFee > 0) {
            managerShare = share.mul(managementFee).div(FEE_PRECISION);
            accManagementFee = accManagementFee.add(managerShare);
        }

        // issue shares
        _mint(_user, share.sub(managerShare));
    }

    function totalSupply() public view override returns (uint256) {
        return _totalSupply.add(accManagementFee).add(accPerformanceFee);
    }

    /**
     * @notice Claims the fee for protocol and management
     * Protocol receives X percentage from manager fee
     */
    function claimFee() external override {
        (
            address managerFeeTo,
            address protocolFeeTo,
            uint256 managerShare,
            uint256 protocolShare
        ) = ShareHelper.calculateFeeShares(
                factory,
                manager,
                accManagementFee,
                accPerformanceFee
            );

        if (managerShare > 0) {
            _mint(managerFeeTo, managerShare);
        }

        if (protocolShare > 0) {
            _mint(protocolFeeTo, protocolShare);
        }

        // set the variables to 0
        accManagementFee = 0;
        accPerformanceFee = 0;

        emit ClaimFee(managerShare, protocolShare);
    }

    /**
     * @notice Returns the current ticks
     */
    function getTicks() public view returns (Tick[] memory) {
        return ticks;
    }
}
