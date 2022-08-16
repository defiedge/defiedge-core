//SPDX-License-Identifier: BSL
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol";

// contracts

// interfaces
import "../libraries/LiquidityHelper.sol";
import "../libraries/OneInchHelper.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "../interfaces/IOneInch.sol";
import "../interfaces/IOneInchRouter.sol";

// libraries
import "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";
import "@uniswap/v3-periphery/contracts/libraries/PositionKey.sol";

interface IFactory {
    function PROTOCOL_FEE() external returns (uint256);

    function feeTo() external returns (address);
}

contract PrivateManagerBase is AccessControl {
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE"); // can only rebalance and swap
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE"); // can control everything
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE"); /// only can burn the liquidity

    // Modifiers
    modifier onlyOperator() {
        require(hasRole(ADMIN_ROLE, msg.sender), "N");
        _;
    }

    function isAllowedToManage(address _account) public view returns (bool) {
        return hasRole(ADMIN_ROLE, _account) || hasRole(MANAGER_ROLE, _account);
    }

    function isAllowedToBurn(address _account) public view returns (bool) {
        return
            hasRole(ADMIN_ROLE, _account) ||
            hasRole(MANAGER_ROLE, _account) ||
            hasRole(BURNER_ROLE, _account);
    }
}

contract UniswapV3PersonalLiquidityManager is
    IUniswapV3MintCallback,
    PrivateManagerBase
{
    using SafeMath for uint256;
    using SafeCast for uint256;

    uint256 public constant FEE_PRECISION = 1e8;

    IUniswapV3Pool public pool;
    IOneInchRouter public oneInchRouter; // instance of the Uniswap V3 Periphery Swap Router

    IERC20 public token0;
    IERC20 public token1;

    IFactory public factory;

    bool public onHold;

    struct Tick {
        uint256 amount0;
        uint256 amount1;
        int24 tickLower;
        int24 tickUpper;
    }

    // store ticks
    Tick[] public ticks;

    event Swap(uint256 amountIn, uint256 amountOut, bool _zeroForOne);

    event FeesClaim(address indexed strategy, uint256 amount0, uint256 amount1);

    struct MintCallbackData {
        address payer;
        IUniswapV3Pool pool;
    }

    function mintLiquidity(
        int24 _tickLower,
        int24 _tickUpper,
        uint256 _amount0,
        uint256 _amount1,
        address _payer
    ) internal returns (uint256 amount0, uint256 amount1) {
        uint128 liquidity = LiquidityHelper.getLiquidityForAmounts(
            pool,
            _tickLower,
            _tickUpper,
            _amount0,
            _amount1
        );

        // add liquidity to Uniswap pool
        (amount0, amount1) = pool.mint(
            address(this),
            _tickLower,
            _tickUpper,
            liquidity,
            abi.encode(MintCallbackData({payer: _payer, pool: pool}))
        );
    }

    /**
     * @dev Callback for Uniswap V3 pool.
     */
    function uniswapV3MintCallback(
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external override {
        require(msg.sender == address(pool));
        MintCallbackData memory decoded = abi.decode(data, (MintCallbackData));
        // check if the callback is received from Uniswap V3 Pool
        if (decoded.payer == address(this)) {
            // transfer tokens already in the contract
            if (amount0 > 0) {
                TransferHelper.safeTransfer(
                    address(token0),
                    msg.sender,
                    amount0
                );
            }
            if (amount1 > 0) {
                TransferHelper.safeTransfer(
                    address(token1),
                    msg.sender,
                    amount1
                );
            }
        } else {
            // take and transfer tokens to Uniswap V3 pool from the user
            if (amount0 > 0) {
                TransferHelper.safeTransferFrom(
                    address(token0),
                    decoded.payer,
                    msg.sender,
                    amount0
                );
            }
            if (amount1 > 0) {
                TransferHelper.safeTransferFrom(
                    address(token1),
                    decoded.payer,
                    msg.sender,
                    amount1
                );
            }
        }
    }

    /**
     * @notice Burns liquidity in the given range
     * @param _tickLower Lower Tick
     * @param _tickUpper Upper Tick
     */
    function burnLiquidity(
        int24 _tickLower,
        int24 _tickUpper,
        uint128 _currentLiquidity
    )
        internal
        returns (
            uint256 collect0,
            uint256 collect1,
            uint256 fee0,
            uint256 fee1
        )
    {
        uint256 tokensBurned0;
        uint256 tokensBurned1;

        (tokensBurned0, tokensBurned1) = pool.burn(
            _tickLower,
            _tickUpper,
            _currentLiquidity
        );
        // collect fees
        (collect0, collect1) = pool.collect(
            address(this),
            _tickLower,
            _tickUpper,
            type(uint128).max,
            type(uint128).max
        );

        fee0 = collect0 > tokensBurned0
            ? uint256(collect0).sub(tokensBurned0)
            : 0;
        fee1 = collect1 > tokensBurned1
            ? uint256(collect1).sub(tokensBurned1)
            : 0;

        collect0 = tokensBurned0;
        collect1 = tokensBurned1;

        // mint performance fees
        addPerformanceFees(fee0, fee1);
    }

    function addPerformanceFees(uint256 _fee0, uint256 _fee1) internal {
        uint256 performanceFee = factory.PROTOCOL_FEE();

        if (performanceFee > 0) {
            if (_fee0 > 0) {
                TransferHelper.safeTransfer(
                    address(token0),
                    factory.feeTo(),
                    FullMath.mulDiv(_fee0, performanceFee, FEE_PRECISION)
                );
            }

            if (_fee1 > 0) {
                TransferHelper.safeTransfer(
                    address(token1),
                    factory.feeTo(),
                    FullMath.mulDiv(_fee1, performanceFee, FEE_PRECISION)
                );
            }
        }
    }

    /**
     * @notice Burn liquidity from specific tick
     * @param _tickIndex Index of tick which needs to be burned
     */
    function burnLiquiditySingle(uint256 _tickIndex)
        public
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 fee0,
            uint256 fee1
        )
    {
        require(isAllowedToBurn(msg.sender), "N");

        Tick storage tick = ticks[_tickIndex];

        (uint128 currentLiquidity, , , , ) = pool.positions(
            PositionKey.compute(address(this), tick.tickLower, tick.tickUpper)
        );

        if (currentLiquidity > 0) {
            (amount0, amount1, fee0, fee1) = burnLiquidity(
                tick.tickLower,
                tick.tickUpper,
                currentLiquidity
            );

            // update data in ticks
            tick.amount0 = tick.amount0 >= amount0
                ? tick.amount0.sub(amount0)
                : 0;
            tick.amount1 = tick.amount1 >= amount1
                ? tick.amount1.sub(amount1)
                : 0;
        }

        // shift the index element at last of array
        ticks[_tickIndex] = ticks[ticks.length - 1];
        // remove last element
        ticks.pop();
    }

    /**
     * @notice Burns all the liquidity and collects fees
     */
    function burnAllLiquidity() internal {
        for (uint256 _tickIndex = 0; _tickIndex < ticks.length; _tickIndex++) {
            Tick storage tick = ticks[_tickIndex];

            (uint128 currentLiquidity, , , , ) = pool.positions(
                PositionKey.compute(
                    address(this),
                    tick.tickLower,
                    tick.tickUpper
                )
            );

            if (currentLiquidity > 0) {
                (uint256 amount0, uint256 amount1, , ) = burnLiquidity(
                    tick.tickLower,
                    tick.tickUpper,
                    currentLiquidity
                );

                // update data in ticks
                tick.amount0 = tick.amount0 >= amount0
                    ? tick.amount0.sub(amount0)
                    : 0;
                tick.amount1 = tick.amount1 >= amount1
                    ? tick.amount1.sub(amount1)
                    : 0;
            }
        }
    }

    /**
     * @notice Swap the fudns to 1Inch
     * @param data Swap data to perform exchange from 1inch
     */
    function swap(bytes calldata data) external onlyOperator {
        (IERC20 srcToken, IERC20 dstToken, uint256 amount) = OneInchHelper
            .decodeData(IERC20(token0), IERC20(token1), data);

        require(
            (srcToken == token0 && dstToken == token1) ||
                (srcToken == token1 && dstToken == token0),
            "IA"
        );

        srcToken.approve(address(oneInchRouter), amount);

        // Interact with 1inch through contract call with data
        (bool success, bytes memory returnData) = address(oneInchRouter).call{
            value: 0
        }(data);

        // Verify return status and data
        if (!success) {
            uint256 length = returnData.length;
            if (length < 68) {
                // If the returnData length is less than 68, then the transaction failed silently.
                revert("swap");
            } else {
                // Look for revert reason and bubble it up if present
                uint256 t;
                assembly {
                    returnData := add(returnData, 4)
                    t := mload(returnData) // Save the content of the length slot
                    mstore(returnData, sub(length, 4)) // Set proper length
                }
                string memory reason = abi.decode(returnData, (string));
                assembly {
                    mstore(returnData, t) // Restore the content of the length slot
                }
                revert(reason);
            }
        }
    }
}
