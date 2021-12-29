//SPDX-License-Identifier: BSL
pragma solidity =0.7.6;
pragma abicoder v2;

// contracts
import "../ERC20.sol";

// libraries
import "../libraries/ShareHelper.sol";
import "../libraries/OracleLibrary.sol";

// interfaces
import "../interfaces/IStrategyManager.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StrategyBase is ERC20 {
    using SafeMath for uint256;

    event ClaimFee(uint256 managerFee, uint256 protocolFee);

    struct Tick {
        uint256 amount0;
        uint256 amount1;
        int24 tickLower;
        int24 tickUpper;
    }

    bool public onHold;

    // store ticks
    Tick[] public ticks;

    uint256 public accManagementFee;

    IStrategyFactory public factory; // instance of the strategy factory
    IUniswapV3Pool public pool; // instance of the Uniswap V3 pool

    address internal token0;
    address internal token1;

    ISwapRouter public swapRouter; // instance of the Uniswap V3 Periphery Swap Router
    address internal chainlinkRegistry;

    IStrategyManager public manager; // instance of manager contract

    bool[] public usdAsBase; // for Chainlink oracle

    // Modifiers
    modifier onlyOperator() {
        require(msg.sender == manager.operator(), "N");
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
            address(pool),
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
        if (manager.feeTo() != address(0) && managementFee > 0) {
            managerShare = share.mul(managementFee).div(1e8);
            accManagementFee = accManagementFee.add(managerShare);
        }

        // issue shares
        _mint(_user, share.sub(managerShare));
    }

    function totalSupply() public view override returns (uint256) {
        return _totalSupply.add(accManagementFee);
    }

    /**
     * @notice Claims the fee for protocol and management
     * Protocol receives X percentage from manager fee
     */
    function claimFee() external {
        if (accManagementFee > 0) {

            address _factoryFeeTo = factory.feeTo();
            address _managerFeeTo = manager.feeTo();

            uint256 protocolShare = accManagementFee
                .mul(factory.PROTOCOL_FEE())
                .div(1e8);

            require(
                _managerFeeTo != address(0) && _factoryFeeTo != address(0)
            );

            _mint(_factoryFeeTo, protocolShare);
            _mint(_managerFeeTo, accManagementFee.sub(protocolShare));
            emit ClaimFee(accManagementFee, protocolShare);
            accManagementFee = 0;
        }
    }

    /**
     * @notice Returns the current ticks
     */
    function getTicks() public view returns (Tick[] memory) {
        return ticks;
    }
}
