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

// TODO: Add blacklist

contract DefiEdgeStrategy is UniswapPoolActions {
    using SafeMath for uint256;

    bool public onHold;

    // events
    event Mint(uint256 amount0, uint256 amount1);
    event Burn(uint256 amount0, uint256 amount1);

    /**
     * @param _factory Strategy factory address
     * @param _pool Address of the pool
     * @param _operator Address of the strategy operator
     */
    constructor(
        address _factory,
        address _pool,
        address _operator
    ) {
        factory = IFactory(_factory);
        pool = IUniswapV3Pool(_pool);
        managementFee = 0;
        operator = _operator;
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
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 share
        )
    {
        console.log("strategy address", address(this));

        // check if strategy has been initialised
        require(initialized, "uninitialised strategy");

        // check of pool is whitelisted or not
        require(
            factory.whitelistedPools(address(pool)),
            "pool is not whitelisted"
        );

        // check if strategy is in denylist
        require(!factory.denied(address(this)), "strategy is in denylist");

        // get total amounts with fees
        (uint256 totalAmount0, uint256 totalAmount1) = getAUMWithFees();

        // index 0 will always be an primary tick
        (amount0, amount1) = mintLiquidity(
            ticks[0].tickLower,
            ticks[0].tickUpper,
            _amount0,
            _amount1,
            msg.sender
        );

        console.log("mint amount0", amount0);
        console.log("mint amount1", amount1);

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
        require(share >= _minShare, "min_share_check_failed");

        // price slippage check
        require(
            amount0 >= _amount0Min && amount1 >= _amount1Min,
            "Aggregator: Slippage"
        );

        // emit event
        emit Mint(amount0, amount1);
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
    ) external returns (uint256 amount0, uint256 amount1) {
        // check if the user has sufficient shares
        require(balanceOf(msg.sender) >= _shares, "insufficient shares");

        uint256 collect0;
        uint256 collect1;

        // burn liquidity based on shares from existing ticks
        if (ticks.length != 0) {
            for (uint256 i = 0; i < ticks.length; i++) {
                Tick storage tick = ticks[i];

                // get amounts to be burned based on shares
                amount0 = tick.amount0.mul(balanceOf(msg.sender)).div(
                    totalSupply()
                );

                amount1 = tick.amount1.mul(balanceOf(msg.sender)).div(
                    totalSupply()
                );

                // burn liquidity and collect fees
                (amount0, amount1) = burnLiquidity(
                    tick.tickLower,
                    tick.tickUpper,
                    amount0,
                    amount1
                );

                // add to total amounts
                collect0 = collect0.add(amount0);
                collect1 = collect1.add(amount1);

                // get burned amounts
                amount0 = amount0 != 0 ? tick.amount0.sub(amount0) : 0;
                amount1 = amount1 != 0 ? tick.amount1.sub(amount1) : 0;

                tick.amount0 = amount0;
                tick.amount1 = amount1;
            }
        }

        // give from unused amounts
        amount0 = IERC20(pool.token0()).balanceOf(address(this));
        amount1 = IERC20(pool.token1()).balanceOf(address(this));

        if (amount0 > 0) {
            amount0 = amount0.mul(balanceOf(address(this))).div(totalSupply());
        }

        if (amount1 > 0) {
            amount1 = amount1.mul(balanceOf(address(this))).div(totalSupply());
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
        _burn(msg.sender, _shares);

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
     * @param _ticks Ticks in which amounts to be deploy
     */
    function rebalance(Tick[] memory _ticks)
        external
        onlyOperator
        whenInitialized
        validTicks(_ticks)
    {
        // check if pool is whitelisted
        require(
            factory.whitelistedPools(address(pool)),
            "pool is not whitelisted"
        );

        // check if strategy is not in denylist
        require(!factory.denied(address(this)), "strategy is in denylist");

        if (onHold) {
            // set onHold to false
            onHold = false;
            // deploy between ticks
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

    // swaps with exact input single functionality
    function swap(
        bool _zeroToOne,
        int256 _amount,
        uint160 _sqrtPriceLimitX96
    ) external onlyOperator whenInitialized returns (uint256 amountOut) {
        (int256 amount0, int256 amount1) = pool.swap(
            address(this),
            _zeroToOne,
            _amount,
            _sqrtPriceLimitX96,
            abi.encode(
                SwapCallbackData({pool: address(pool), zeroToOne: _zeroToOne})
            )
        );

        return uint256(-(_zeroToOne ? amount1 : amount0));
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
     * @notice Gets current ticks and it's amounts
     */
    function getTicks() public view returns (Tick[] memory) {
        return ticks;
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
