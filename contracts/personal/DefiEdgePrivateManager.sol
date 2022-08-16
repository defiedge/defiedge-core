// SPDX-License-Identifier: BSL

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

import "./UniswapV3PrivateLiquidityManager.sol";

contract DefiEdgePrivateManager is UniswapV3PersonalLiquidityManager {
    using SafeMath for uint256;

    struct PartialTick {
        uint256 index;
        bool burn;
        uint256 amount0;
        uint256 amount1;
    }

    event Hold();
    event Rebalance(Tick[] ticks);
    event PartialRebalance(PartialTick[] ticks);
    event Deposit(uint256 amount0, uint256 amount1);
    event Withdraw(uint256 amount0, uint256 amount1);
    event Rescue(address token, address to, uint256 amount);

    constructor(
        address _pool,
        address _operator,
        address _factory,
        address _oneInchRouter
    ) {
        pool = IUniswapV3Pool(_pool);
        token0 = IERC20(pool.token0());
        token1 = IERC20(pool.token1());
        _setupRole(ADMIN_ROLE, _operator);
        _setRoleAdmin(MANAGER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(BURNER_ROLE, ADMIN_ROLE);
        factory = IFactory(_factory);
        oneInchRouter = IOneInchRouter(_oneInchRouter);
    }

    /// @notice Deposit funds to the Manager contract
    /// @param _amount0 Amount of token0 to be deposited
    /// @param _amount1 Amount of token1 to be deposited
    function deposit(uint256 _amount0, uint256 _amount1) external {
        if (_amount0 > 0) {
            TransferHelper.safeTransferFrom(
                pool.token0(),
                msg.sender,
                address(this),
                _amount0
            );
        }

        if (_amount1 > 0) {
            TransferHelper.safeTransferFrom(
                pool.token1(),
                msg.sender,
                address(this),
                _amount1
            );
        }

        emit Deposit(_amount0, _amount1);
    }

    /// @notice Withdraw funds
    /// @param _amount0 Amount of token0 to be withdrawn
    /// @param _amount1 Amount of token1 to be withdrawn
    function withdraw(uint256 _amount0, uint256 _amount1)
        external
        onlyOperator
    {
        if (_amount0 > 0) {
            TransferHelper.safeTransfer(address(token0), msg.sender, _amount0);
        }

        if (_amount1 > 0) {
            TransferHelper.safeTransfer(
                (address(token1)),
                msg.sender,
                _amount1
            );
        }

        emit Withdraw(_amount0, _amount1);
    }

    /**
     * @notice Rebalances the strategy
     * @param _swapData Swap data to perform exchange from 1inch
     * @param _existingTicks Array of existing ticks to rebalance
     * @param _newTicks New ticks in case there are any
     * @param _burnAll When burning into new ticks, should we burn all liquidity?
     */
    function rebalance(
        bytes calldata _swapData,
        PartialTick[] memory _existingTicks,
        Tick[] memory _newTicks,
        bool _burnAll
    ) external onlyOperator {
        if (_burnAll) {
            require(_existingTicks.length == 0, "IA");
            onHold = true;
            burnAllLiquidity();
            delete ticks;
            emit Hold();
        }
        //swap from 1inch if needed
        if (_swapData.length > 0) {
            this.swap(_swapData);
        }
        // redeploy the partial ticks
        if (_existingTicks.length > 0) {
            for (uint256 i = 0; i < _existingTicks.length; i++) {
                Tick memory _tick = ticks[_existingTicks[i].index];
                Tick storage tick;
                if (_existingTicks[i].burn) {
                    // burn liquidity from range
                    burnLiquiditySingle(_existingTicks[i].index);
                } else {
                    tick = ticks[_existingTicks[i].index];
                }
                if (
                    _existingTicks[i].amount0 > 0 ||
                    _existingTicks[i].amount1 > 0
                ) {
                    // mint liquidity
                    (uint256 amount0, uint256 amount1) = mintLiquidity(
                        _tick.tickLower,
                        _tick.tickUpper,
                        _existingTicks[i].amount0,
                        _existingTicks[i].amount1,
                        address(this)
                    );
                    if (_existingTicks[i].burn) {
                        // push to ticks array
                        ticks.push(
                            Tick(
                                amount0,
                                amount1,
                                _tick.tickLower,
                                _tick.tickUpper
                            )
                        );
                    } else {
                        // update data in the tick
                        tick.amount0 = tick.amount0.add(amount0);
                        tick.amount1 = tick.amount1.add(amount1);
                    }
                }
            }
            emit PartialRebalance(_existingTicks);
        }
        // deploy liquidity into new ticks
        if (_newTicks.length > 0) {
            redeploy(_newTicks);
            emit Rebalance(ticks);
        }
        // checks for valid ticks length
        require(ticks.length <= 20, "ITL");
    }

    /**
     * @notice Redeploys between ticks
     * @param _ticks Array of the ticks with amounts
     */
    function redeploy(Tick[] memory _ticks) internal {
        // set hold false
        onHold = false;
        // redeploy the liquidity
        for (uint256 i = 0; i < _ticks.length; i++) {
            Tick memory tick = _ticks[i];

            // mint liquidity
            (uint256 amount0, uint256 amount1) = mintLiquidity(
                tick.tickLower,
                tick.tickUpper,
                tick.amount0,
                tick.amount1,
                address(this)
            );

            // push to ticks array
            ticks.push(Tick(amount0, amount1, tick.tickLower, tick.tickUpper));
        }
    }

    /**
     * @notice Rescue any tokens
     * @param _token Address of the token
     * @param _to Address where the tokens should be sent
     * @param _amount Number of tokens to rescue
     */
    function rescue(
        address _token,
        address _to,
        uint256 _amount
    ) external onlyOperator {
        TransferHelper.safeTransfer(_token, _to, _amount);
        emit Rescue(_token, _to, _amount);
    }
}
