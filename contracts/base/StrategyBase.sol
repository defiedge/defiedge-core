//SPDX-License-Identifier: Unlicense
pragma solidity =0.7.6;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "../libraries/UniswapV3Oracle.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IFactory {
    function feeTo() external view returns (address);

    function PROTOCOL_FEE() external view returns (uint256);
}

contract StrategyBase is ERC20("DefiEdge Share Token", "DefiEdgeShare") {
    using SafeMath for uint256;

    uint256 public managementFee;
    address public feeTo;

    bool public initialized;

    bool public onHold;

    address public operator;
    address pendingOperator;

    IFactory public factory;

    struct Tick {
        uint256 amount0;
        uint256 amount1;
        int24 tickLower;
        int24 tickUpper;
    }

    // store ticks
    Tick[] public ticks;

    // Uniswap pool for the strategy
    IUniswapV3Pool public pool;

    // Modifiers
    modifier onlyOperator() {
        require(msg.sender == operator, "Ownable: caller is not the operator");
        _;
    }

    // Modifiers
    modifier whenInitialized() {
        require(initialized, "Ownable: strategy not initialized");
        _;
    }

    /**
     * @dev Replaces old ticks with new ticks
     * @param _ticks New ticks
     */
    modifier validTicks(Tick[] memory _ticks) {
        for (uint256 i = 0; i < _ticks.length; i++) {
            int24 tickLower = _ticks[i].tickLower;
            int24 tickUpper = _ticks[i].tickUpper;

            // check that two tick upper and tick lowers are not in array cannot be same
            for (uint256 j = 0; j < _ticks.length; j++) {
                if (i != j) {
                    if (tickLower == _ticks[j].tickLower) {
                        require(
                            tickUpper != _ticks[j].tickUpper,
                            "ticks cannot be same"
                        );
                    }
                }
            }
            _;
        }
    }

    /**
     * @dev Calculates the shares to be given for specific position
     * @param _pool Address of the pool
     * @param _amount0 Amount of token0
     * @param _amount1 Amount of token1
     * @param _totalAmount0 Total amount of token0
     * @param _totalAmount1 Total amount of token1
     */
    function calculateShares(
        address _pool,
        uint256 _amount0,
        uint256 _amount1,
        uint256 _totalAmount0,
        uint256 _totalAmount1
    ) internal view returns (uint256 share) {
        uint256 totalShares = totalSupply();
        uint256 price = UniswapV3Oracle.consult(_pool, 60);

        if (_totalAmount0 == 0) {
            share = (_amount1.mul(price).add(_amount0)).div(1000);
        } else if (_totalAmount1 == 0) {
            share = (_amount0.mul(price).add(_amount1)).div(1000);
        } else {
            share = totalShares.mul(((_amount0).mul(price).add(_amount1))).div(
                _totalAmount0.mul(price).add(_totalAmount1)
            );
        }
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
        share = calculateShares(
            address(pool),
            _amount0,
            _amount1,
            _totalAmount0,
            _totalAmount1
        );

        require(share > 0, "invalid shares");

        // strategy owner fees
        if (feeTo != address(0) && managementFee > 0) {
            uint256 managerShare = share.mul(managementFee).div(1e8);
            share = share.sub(managerShare);
            _mint(feeTo, managerShare);
        }

        if (factory.feeTo() != address(0)) {
            uint256 fee = share.mul(factory.PROTOCOL_FEE()).div(1e8);
            share = share.sub(factory.PROTOCOL_FEE());
            _mint(feeTo, fee);
        }

        // issue shares
        _mint(_user, share);
    }

    /**
     * @notice Changes the fee
     * @param _tier Fee tier from indexes 0 to 2
     */
    function changeFee(uint256 _tier) public onlyOperator {
        if (_tier == 2) {
            managementFee = 5000000; // 5%
        } else if (_tier == 1) {
            managementFee = 2000000; // 2%
        } else {
            managementFee = 1000000; // 1%
        }
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
        require(_operator != address(0), "invalid operator");
        pendingOperator = _operator;
    }

    /**
     * @notice Change the operator
     */
    function acceptOperator() external {
        require(msg.sender == pendingOperator, "invalid match");
        operator = pendingOperator;
    }

    /**
     * @notice Returns lengths of the ticks
     */
    function tickLength() public view returns (uint256 length) {
        length = ticks.length;
    }
}
