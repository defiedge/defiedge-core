// SPDX-License-Identifier: BSL

pragma solidity ^0.7.6;
pragma abicoder v2;

// contracts
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "./base/UniswapV3LiquidityManager.sol";

// libraries
import "./libraries/LiquidityHelper.sol";

contract DefiEdgeStrategy is UniswapV3LiquidityManager {
    using SafeMath for uint256;

    // events
    event Mint(address indexed user, uint256 share, uint256 amount0, uint256 amount1);
    event Burn(address indexed user, uint256 share, uint256 amount0, uint256 amount1);
    event Hold();
    event Rebalance(Tick[] ticks);
    event PartialRebalance(PartialTick[] ticks);

    struct PartialTick {
        uint256 index;
        bool burn;
        uint256 amount0;
        uint256 amount1;
    }

    /**
     * @param _factory Address of the strategy factory
     * @param _pool Address of the pool
     * @param _oneInchRouter Address of the Uniswap V3 periphery swap router
     * @param _chainlinkRegistry Chainlink registry address
     * @param _manager Address of the manager
     * @param _usdAsBase If the Chainlink feed is pegged with USD
     * @param _ticks Array of the ticks
     */
    constructor(
        IStrategyFactory _factory,
        IUniswapV3Pool _pool,
        IOneInchRouter _oneInchRouter,
        FeedRegistryInterface _chainlinkRegistry,
        IStrategyManager _manager,
        bool[2] memory _usdAsBase,
        Tick[] memory _ticks
    ) {
        require(!isInvalidTicks(_ticks), "IT");
        // checks for valid ticks length
        require(_ticks.length <= MAX_TICK_LENGTH, "ITL");
        manager = _manager;
        factory = _factory;
        oneInchRouter = _oneInchRouter;
        chainlinkRegistry = _chainlinkRegistry;
        pool = _pool;
        token0 = IERC20(pool.token0());
        token1 = IERC20(pool.token1());
        usdAsBase = _usdAsBase;
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
        onlyValidStrategy
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 share
        )
    {
        require(manager.isUserWhiteListed(msg.sender), "UA");

        // get total amounts with fees
        (uint256 totalAmount0, uint256 totalAmount1, , ) = this
            .getAUMWithFees();

        if (_amount0 > 0 && _amount1 > 0 && ticks.length > 0) {

            Tick storage tick = ticks[0];
            // index 0 will always be an primary tick
            (amount0, amount1) = mintLiquidity(
                tick.tickLower,
                tick.tickUpper,
                _amount0,
                _amount1,
                msg.sender
            );

            // update data in the tick
            tick.amount0 = tick.amount0.add(amount0);
            tick.amount1 = tick.amount1.add(amount1);
            
        } else {

            amount0 = _amount0;
            amount1 = _amount1;

            if (amount0 > 0) {
                TransferHelper.safeTransferFrom(
                    address(token0),
                    msg.sender,
                    address(this),
                    amount0
                );
            }
            if (amount1 > 0) {
                TransferHelper.safeTransferFrom(
                    address(token1),
                    msg.sender,
                    address(this),
                    amount1
                );
            }
        }

        // issue share based on the liquidity added
        share = issueShare(
            amount0,
            amount1,
            totalAmount0,
            totalAmount1,
            msg.sender
        );

        // prevent front running of strategy fee
        require(share >= _minShare, "SC");

        // price slippage check
        require(amount0 >= _amount0Min && amount1 >= _amount1Min, "S");

        uint256 _shareLimit = manager.limit();
        // share limit
        if (_shareLimit != 0) {
            require(totalSupply() <= _shareLimit, "L");
        }
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
    ) external returns (uint256 collect0, uint256 collect1) {
        
        require(manager.isUserWhiteListed(msg.sender), "UA");

        // check if the user has sufficient shares
        require(balanceOf(msg.sender) >= _shares && _shares != 0, "INS");

        uint256 amount0;
        uint256 amount1;

        // give from unused amounts
        collect0 = IERC20(token0).balanceOf(address(this));
        collect1 = IERC20(token1).balanceOf(address(this));

        uint256 _totalSupply = totalSupply();

        if (collect0 > 0) {
            collect0 = FullMath.mulDiv(collect0, _shares, _totalSupply);
        }

        if (collect1 > 0) {
            collect1 = FullMath.mulDiv(collect1, _shares, _totalSupply);
        }

        // burn liquidity based on shares from existing ticks
        for (uint256 i = 0; i < ticks.length; i++) {
            Tick storage tick = ticks[i];

            uint256 fee0;
            uint256 fee1;
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

            tick.amount0 = tick.amount0 >= amount0
                ? tick.amount0.sub(amount0)
                : 0;
            tick.amount1 = tick.amount1 >= amount1
                ? tick.amount1.sub(amount1)
                : 0;
        }

        // check slippage
        require(_amount0Min <= amount0 && _amount1Min <= amount1, "S");

        // burn shares
        _burn(msg.sender, _shares);

        // transfer tokens
        if (collect0 > 0) {
            TransferHelper.safeTransfer(address(token0), msg.sender, collect0);
        }
        if (collect1 > 0) {
            TransferHelper.safeTransfer(address(token1), msg.sender, collect1);
        }

        emit Burn(msg.sender, _shares, collect0, collect1);
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
    ) external onlyOperator onlyValidStrategy {
        if (_burnAll) {
            require(_existingTicks.length == 0, "IA");
            onHold = true;
            burnAllLiquidity();
            delete ticks;
            emit Hold();
        }

        //swap from 1inch if needed
        if (_swapData.length > 0) {
            swap(_swapData);
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

                    if(_existingTicks[i].burn){
                        // push to ticks array
                        ticks.push(Tick(amount0, amount1, _tick.tickLower, _tick.tickUpper));
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

        require(!isInvalidTicks(ticks), "IT");
        // checks for valid ticks length
        require(ticks.length <= MAX_TICK_LENGTH + 10, "ITL");
    }

    /**
     * @notice Redeploys between ticks
     * @param _ticks Array of the ticks with amounts
     */
    function redeploy(Tick[] memory _ticks) internal onlyHasDeviation {
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

}
