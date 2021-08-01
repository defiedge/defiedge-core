// SPDX-License-Identifier: MIT

pragma solidity =0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "./base/UniswapPoolActions.sol";
import "./base/StrategyBase.sol";

import "./libraries/LiquidityHelper.sol";

import "hardhat/console.sol";

contract DefiEdgeStrategy is UniswapPoolActions {
    using SafeMath for uint256;

    bool public onHold;

    // events
    event Mint(address user, uint256 share, uint256 amount0, uint256 amount1);
    event Burn(address user, uint256 share, uint256 amount0, uint256 amount1);
    event Swap(uint256 amountIn, uint256 amountOut, bool zeroToOne);
    event Hold();
    event Rebalance(Tick[] ticks);

    /**
     * @param _factory Strategy factory address
     * @param _pool Address of the pool
     * @param _operator Address of the strategy operator
     * @param _ticks Array of the ticks
     */
    constructor(
        address _factory,
        address _pool,
        address _operator,
        Tick[] memory _ticks
    ) validTicks(_ticks) {
        factory = IFactory(_factory);
        pool = IUniswapV3Pool(_pool);
        operator = _operator;
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
        (uint256 totalAmount0, uint256 totalAmount1) = getAUMWithFees();

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
    ) external returns (uint256 amount0, uint256 amount1) {
        // check if the user has sufficient shares
        require(balanceOf(msg.sender) >= _shares, "INS");

        uint256 collect0;
        uint256 collect1;

        uint256 unused0;
        uint256 unused1;

        // give from unused amounts
        unused0 = IERC20(pool.token0()).balanceOf(address(this));
        unused1 = IERC20(pool.token1()).balanceOf(address(this));

        // burn liquidity based on shares from existing ticks
        if (ticks.length != 0) {
            for (uint256 i = 0; i < ticks.length; i++) {
                Tick storage tick = ticks[i];

                // burn liquidity and collect fees
                (amount0, amount1) = burnLiquidity(
                    tick.tickLower,
                    tick.tickUpper,
                    _shares
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
            }
        }

        if (unused0 > 0) {
            unused0 = unused0.mul(_shares).div(totalSupply());
        }

        if (unused1 > 0) {
            unused1 = unused1.mul(_shares).div(totalSupply());
        }

        // add to total amounts
        amount0 = collect0.add(unused0);
        amount1 = collect1.add(unused1);

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

    function redeploy(Tick[] memory _ticks) internal {
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
     * @notice Rebalances between the ticks
     * @param _zeroForOne The direction of the swap
     * @param _amount Amount to Swap
     * @param _sqrtPriceLimitX96 Price Slippage
     */
    function swap(
        bool _zeroForOne,
        int256 _amount,
        uint160 _sqrtPriceLimitX96
    ) external onlyOperator isValidStrategy returns (uint256 amountOut) {
        if (ticks.length > 0) {
            // burn all liquidity
            burnAllLiquidity(ticks);
            // delete ticks
            delete ticks;
        }

        (int256 amount0, int256 amount1) = pool.swap(
            address(this),
            _zeroForOne,
            _amount,
            _sqrtPriceLimitX96,
            abi.encode(
                SwapCallbackData({pool: address(pool), zeroToOne: _zeroForOne})
            )
        );

        amountOut = uint256(-(_zeroForOne ? amount1 : amount0));

        emit Swap(uint256(_amount), amountOut, _zeroForOne);
    }

    /**
     * @notice Holds the funds
     */
    function hold() external onlyOperator {
        onHold = true;
        burnAllLiquidity(ticks);
        delete ticks;
        emit Hold();
    }

    /**
     * @notice Gets current ticks and it's amounts
     */
    function getTicks() public view returns (Tick[] memory) {
        return ticks;
    }

    // TODO: Make this function work correctly
    function emergencyBurn(
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity
    ) external onlyOperator {
        pool.burn(tickLower, tickUpper, liquidity);
        (, , , uint128 tokensOwed0, uint128 tokensOwed1) = pool.positions(
            PositionKey.compute(address(this), tickLower, tickUpper)
        );
        pool.collect(
            address(this),
            tickLower,
            tickUpper,
            uint128(tokensOwed0),
            uint128(tokensOwed1)
        );
    }

    // TODO: Remove this function after audit
    function emergencyWithdraw(
        address _pool,
        uint256 _amount0,
        uint256 _amount1
    ) external onlyOperator {
        IUniswapV3Pool pool = IUniswapV3Pool(_pool);
        // transfer the tokens back
        TransferHelper.safeTransfer(pool.token0(), msg.sender, _amount0);
        TransferHelper.safeTransfer(pool.token1(), msg.sender, _amount1);
    }
}
