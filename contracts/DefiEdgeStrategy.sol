// SPDX-License-Identifier: MIT

pragma solidity =0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "./base/UniswapPoolActions.sol";
import "./base/StrategyBase.sol";

import "hardhat/console.sol";

contract DefiEdgeStrategy is UniswapPoolActions {
    using SafeMath for uint256;

    // events
    event Mint(uint256 amount0, uint256 amount1);

    event Burn(uint256 amount0, uint256 amount1);

    constructor(
        address _aggregator,
        address _pool,
        address _operator
    ) {
        aggregator = _aggregator;
        pool = IUniswapV3Pool(_pool);
        operator = _operator;
        managementFee = 0;
    }

    function mint(
        uint256 _amount0,
        uint256 _amount1,
        uint256 _amount0Min,
        uint256 _amount1Min,
        uint256 _minShare
    )
        external
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 share
        )
    {
        // check if strategy has been initialised
        require(initialized, "uninitialised strategy");

        // index 0 will always be an primary tick
        (amount0, amount1) = mintLiquidity(
            ticks[0].tickLower,
            ticks[0].tickUpper,
            _amount0,
            _amount1,
            msg.sender
        );

        // get total amounts with fees
        (uint256 totalAmount0, uint256 totalAmount1) = getAUMWithFees();

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
        require(share >= _minShare, "minimum share check failed");

        // price slippage check
        require(
            amount0 >= _amount0Min && amount1 >= _amount1Min,
            "Aggregator: Slippage"
        );

        emit Mint(amount0, amount1);
    }

    function burn(
        uint256 _shares,
        uint256 _amount0Min,
        uint256 _amount1Min
    ) external returns (uint256 amount0, uint256 amount1) {
        // check if the user has sufficient shares
        require(
            balanceOf(msg.sender) >= _shares,
            "insufficient shares"
        );

        uint256 collect0;
        uint256 collect1;

        // burn liquidity based on shares from existing ticks
        if (ticks.length != 0) {
            for (uint256 i = 0; i < ticks.length; i++) {
                Tick memory tick = ticks[i];

                // get amounts to be burned based on shares
                amount0 = tick
                .amount0
                .mul(balanceOf(msg.sender))
                .div(totalSupply());

                amount1 = tick
                .amount1
                .mul(balanceOf(msg.sender))
                .div(totalSupply());

                // burn liquidity and collect fees
                (amount0, amount1, ) = burnLiquidity(
                    tick.tickLower,
                    tick.tickUpper,
                    amount0,
                    amount1
                );

                // get deployed amounts
                amount0 = tick.amount0 > amount0
                    ? tick.amount0.sub(amount0)
                    : amount0;

                amount1 = tick.amount1 > amount1
                    ? tick.amount1.sub(amount1)
                    : amount1;

                // update data in the tick
                tick.amount0 = amount0;
                tick.amount1 = amount1;

                // add to total amounts
                collect0 = collect0.add(amount0);
                collect1 = collect1.add(amount1);
            }
        }

        // give from unused amounts
        amount0 = IERC20(pool.token0()).balanceOf(msg.sender);
        amount1 = IERC20(pool.token1()).balanceOf(msg.sender);

        if (amount0 > 0) {
            amount0 = amount0.mul(balanceOf(msg.sender)).div(totalSupply());
        }

        if (amount1 > 0) {
            amount1 = amount1.mul(balanceOf(msg.sender)).div(totalSupply());
        }

        // add to total amounts
        amount0 = collect0.add(amount0);
        amount1 = collect1.add(amount1);

        // check slippage
        require(
            _amount0Min <= amount0 && _amount1Min <= amount1,
            "Aggregator: Slippage"
        );

        // burn shares
        burnShare(msg.sender, _shares);

        // transfer tokens
        if (amount0 > 0) {
            TransferHelper.safeTransfer(pool.token0(), msg.sender, amount0);
        }
        if (amount1 > 0) {
            TransferHelper.safeTransfer(pool.token1(), msg.sender, amount1);
        }

        emit Burn(amount0, amount1);
    }

    /**
     * @notice Swaps and updates ticks for rebalancing
     * @param _swapAmount Amount to be swapped
     * @param _sqrtPriceLimitX96 The allowed slippage in terms of percentage
     * @param _allowedPriceSlippage The allowed price movement after the swap
     */
    function rebalance(
        uint256 _swapAmount,
        uint160 _sqrtPriceLimitX96,
        uint256 _allowedPriceSlippage,
        bool _zeroToOne,
        Tick[] memory _ticks
    ) external onlyOperator whenInitialized validTicks(_ticks) {
        if (onHold) {
            // set onHold to false
            onHold = false;
            // deploy between ticks
            redeploy(_ticks);
        } else if (_swapAmount > 0) {
            // set unhold to false
            onHold = false;

            // burn all liquidity
            burnAllLiquidity(ticks);

            uint256 amountOut;

            // swap tokens
            (amountOut) = swap(
                _zeroToOne,
                int256(_swapAmount),
                _allowedPriceSlippage,
                _sqrtPriceLimitX96
            );

            // redeploy using ticks
            redeploy(_ticks);
        } else {
            // set hold true
            onHold = false;

            // burn all liquidity
            burnAllLiquidity(ticks);

            // redeploy to the amounts specified
            redeploy(_ticks);
        }
    }

    function redeploy(Tick[] memory _ticks) internal {
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
    function hold() external onlyOperator whenInitialized {
        onHold = true;
        burnAllLiquidity(ticks);
        delete ticks;
    }

    /**
     * @notice Initialised the strategy, can be done only once
     * @param _ticks new ticks in the form of Tick struct
     */
    function initialize(Tick[] memory _ticks)
        external
        onlyOperator
        validTicks(_ticks)
    {
        require(!initialized, "strategy already initialised");
        initialized = true;
        for (uint256 i = 0; i < _ticks.length; i++) {
            ticks.push(Tick(0, 0, _ticks[i].tickLower, _ticks[i].tickUpper));
        }
    }
}
