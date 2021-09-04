//SPDX-License-Identifier: Unlicense
pragma solidity =0.7.6;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "../libraries/ShareHelper.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "hardhat/console.sol";

interface IFactory {
    function feeTo() external view returns (address);

    function denied(address) external view returns (bool);

    function PROTOCOL_FEE() external view returns (uint256);
}

contract StrategyBase is ERC20("DefiEdge Share Token", "DEshare") {
    using SafeMath for uint256;

    event ChangeFee(uint256 tier);
    event ChangeOperator(address indexed operator);

    uint256 public managementFee;
    address public feeTo;

    uint256 public accProtocolFee;
    uint256 public accManagementFee;

    address public operator;
    address public pendingOperator;

    IFactory public factory;

    // Uniswap pool for the strategy
    IUniswapV3Pool public pool;

    struct Tick {
        uint256 amount0;
        uint256 amount1;
        int24 tickLower;
        int24 tickUpper;
    }

    // store ticks
    Tick[] public ticks;

    // Modifiers
    modifier onlyOperator() {
        require(msg.sender == operator, "NO");
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
            address(pool),
            _amount0,
            _amount1,
            _totalAmount0,
            _totalAmount1,
            totalSupply()
        );

        require(share > 0, "IS");

        uint256 managerShare;
        // strategy owner fees
        if (feeTo != address(0) && managementFee > 0) {
            managerShare = share.mul(managementFee).div(1e8);
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
     * @notice Returns lengths of the ticks
     */
    function tickLength() public view returns (uint256 length) {
        length = ticks.length;
    }

    /**
     * @notice Claims the fee for protocol and management
     */
    function claimFee() external {
        if (accProtocolFee > 0) {
            _mint(factory.feeTo(), accProtocolFee);
            accProtocolFee = 0;
        }

        if (accManagementFee > 0) {
            _mint(feeTo, accManagementFee);
            accManagementFee = 0;
        }
    }
}
