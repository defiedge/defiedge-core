// SPDX-License-Identifier: BSL

pragma solidity =0.7.6;
pragma abicoder v2;

// contracts
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "./base/UniswapV3LiquidityManager.sol";

// libraries
import "./libraries/LiquidityHelper.sol";

contract DefiEdgeStrategy is UniswapV3LiquidityManager {
    using SafeMath for uint256;

    bool public onHold;

    // events
    event Mint(address user, uint256 share, uint256 amount0, uint256 amount1);
    event Burn(address user, uint256 share, uint256 amount0, uint256 amount1);
    event Hold();
    event Rebalance(Tick[] ticks);

    /**
     * @param _manager Address of the strategy manager contract
     * @param _factory Strategy factory address
     * @param _pool Address of the pool
     * @param _operator Address of the strategy operator
     * @param _swapRouter Address of the Uniswap V3 swap router
     * @param _ticks Array of the ticks
     * @param _usdAsBase If the Chainlink feed is pegged with USD
     */
    constructor(
        address _manager,
        address _factory,
        address _pool,
        address _operator,
        address _swapRouter,
        Tick[] memory _ticks,
        bool[] memory _usdAsBase
    ) validTicks(_ticks) {
        factory = IStrategyFactory(_factory);
        pool = IUniswapV3Pool(_pool);
        usdAsBase = _usdAsBase;
        manager = IStrategyManager(_manager);
        require(
            IUniswapV3Factory(factory.uniswapV3Factory()).getPool(
                pool.token0(),
                pool.token1(),
                pool.fee()
            ) == address(pool),
            "IP"
        );
        swapRouter = ISwapRouter(_swapRouter);
        for (uint256 i = 0; i < _ticks.length; i++) {
            ticks.push(Tick(0, 0, _ticks[i].tickLower, _ticks[i].tickUpper));
        }
    }

    /**
     * @notice Adds liquidity to the primary range
     * @param _amount0 Amount of token0
     * @param _amount1 Amount of token1
     * @param _amount0Min Minimum amount of token0 to be minted
     * @param _amount1Min Minimum amount of token1 to be minted
     * @param _minShare Minimum amount of shares to be received to the user
     */
    function mint(
        uint256 _amount0,
        uint256 _amount1,
        uint256 _amount0Min,
        uint256 _amount1Min,
        uint256 _minShare
    )
        external
        isValidStrategy
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 share
        )
    {
        require(!onHold, "H");

        // get total amounts with fees
        (uint256 totalAmount0, uint256 totalAmount1, , ) = this
            .getAUMWithFees();

        // index 0 will always be an primary tick
        (amount0, amount1) = mintLiquidity(
            ticks[0].tickLower,
            ticks[0].tickUpper,
            _amount0,
            _amount1,
            msg.sender
        );

        // issue share based on the liquidity added
        share = issueShare(
            amount0,
            amount1,
            totalAmount0,
            totalAmount1,
            msg.sender
        );

        // update data in the tick
        ticks[0].amount0 = ticks[0].amount0.add(amount0);
        ticks[0].amount1 = ticks[0].amount1.add(amount1);

        // prevent front running of strategy fee
        require(share >= _minShare, "SC");

        // price slippage check
        require(amount0 >= _amount0Min && amount1 >= _amount1Min, "S");

        // share limit
        if (manager.limit() != 0) {
            require(totalSupply() <= manager.limit(), "L");
        }

        // emit event
        emit Mint(msg.sender, share, amount0, amount1);
    }

    /**
     * @notice Burn liquidity and transfer tokens back to the user
     * @param _shares Shares to be burned
     * @param _amount0Min Mimimum amount of token0 to be received
     * @param _amount1Min Minimum amount of token1 to be received
     */
    function burn(
        uint256 _shares,
        uint256 _amount0Min,
        uint256 _amount1Min
    )
        external
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 fee0,
            uint256 fee1
        )
    {
        // check if the user has sufficient shares
        require(balanceOf(msg.sender) >= _shares && _shares != 0, "INS");

        uint256 collect0;
        uint256 collect1;

        // give from unused amounts
        collect0 = IERC20(pool.token0()).balanceOf(address(this));
        collect1 = IERC20(pool.token1()).balanceOf(address(this));

        // burn liquidity based on shares from existing ticks
        if (ticks.length != 0) {
            for (uint256 i = 0; i < ticks.length; i++) {
                Tick storage tick = ticks[i];

                // burn liquidity and collect fees
                (amount0, amount1, fee0, fee1) = burnLiquidity(
                    tick.tickLower,
                    tick.tickUpper,
                    _shares,
                    0
                );

                // add to total amounts
                collect0 = collect0.add(amount0);
                collect1 = collect1.add(amount1);

                tick.amount0 = amount0 != 0
                    ? tick.amount0.sub(amount0)
                    : tick.amount0;
                tick.amount1 = amount1 != 0
                    ? tick.amount1.sub(amount1)
                    : tick.amount1;

                emit FeesClaimed(msg.sender, fee0, fee1);
            }
        }

        if (collect0 > 0) {
            collect0 = collect0.mul(_shares).div(totalSupply());
        }

        if (collect1 > 0) {
            collect1 = collect1.mul(_shares).div(totalSupply());
        }

        // check slippage
        require(_amount0Min <= amount0 && _amount1Min <= amount1, "S");

        // burn shares
        _burn(msg.sender, _shares);

        // transfer tokens
        if (amount0 > 0) {
            TransferHelper.safeTransfer(pool.token0(), msg.sender, amount0);
        }
        if (amount1 > 0) {
            TransferHelper.safeTransfer(pool.token1(), msg.sender, amount1);
        }

        emit Burn(msg.sender, _shares, amount0, amount1);
    }

    /**
     * @notice Rebalances between the ticks
     * @param _ticks Ticks in which amounts to be deploy
     */
    function rebalance(Tick[] memory _ticks)
        external
        onlyOperator
        isValidStrategy
        validTicks(_ticks)
    {
        if (onHold) {
            // deploy between ticks
            redeploy(_ticks);
        } else {
            // burn all liquidity
            burnAllLiquidity(ticks);
            // redeploy to the amounts specified
            redeploy(_ticks);
        }

        emit Rebalance(ticks);
    }

    function redeploy(Tick[] memory _ticks) internal hasDeviation {
        // set hold false
        onHold = false;
        // delete ticks
        delete ticks;
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
     * @notice Holds the funds
     */
    function hold() external onlyOperator hasDeviation {
        onHold = true;
        burnAllLiquidity(ticks);
        delete ticks;
        emit Hold();
    }

    // TODO: Make this function work correctly
    function emergencyWithdraw(
        address _token,
        address _to,
        uint256 _amount
    ) external {
        require(
            msg.sender == factory.governance() && !manager.freezeEmergency()
        );
        TransferHelper.safeTransfer(_token, _to, _amount);
    }

    // // TODO: Make this function work correctly
    // function emergencyBurn(
    //     int24 _tickLower,
    //     int24 _tickUpper,
    //     uint128 _liquidity,
    //     address _to
    // ) external onlyGovernance {
    //     pool.burn(_tickLower, _tickUpper, _liquidity);
    //     (, , , uint128 tokensOwed0, uint128 tokensOwed1) = pool.positions(
    //         PositionKey.compute(address(this), _tickLower, _tickUpper)
    //     );
    //     pool.collect(
    //         _to,
    //         _tickLower,
    //         _tickUpper,
    //         uint128(tokensOwed0),
    //         uint128(tokensOwed1)
    //     );
    // }
}
