pragma solidity =0.7.6;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol";
import "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "hardhat/console.sol";

// import libraries
import "../libraries/LiquidityHelper.sol";

contract TestSwap is IUniswapV3SwapCallback, IUniswapV3MintCallback {
    address pool_;

    struct SwapCallbackData {
        address user;
        bool zeroToOne;
    }

    struct MintCallbackData {
        address payer;
        address pool;
    }

    /**
     * @notice Mints liquidity from V3 Pool
     * @param _pool Address of the pool
     * @param _tickLower Lower tick
     * @param _tickUpper Upper tick
     * @param _amount0 Amount of token0
     * @param _amount1 Amount of token1
     * @param _payer Address which is adding the liquidity
     */
    function mintLiquidity(
        address _pool,
        int24 _tickLower,
        int24 _tickUpper,
        uint256 _amount0,
        uint256 _amount1,
        address _payer
    ) external returns (uint256 amount0, uint256 amount1) {
        IUniswapV3Pool pool = IUniswapV3Pool(_pool);

        uint128 liquidity = LiquidityHelper.getLiquidityForAmounts(
            address(pool),
            _tickLower,
            _tickUpper,
            _amount0,
            _amount1
        );

        // set temparary variable for callback verification
        pool_ = _pool;
        // add liquidity to Uniswap pool
        (amount0, amount1) = pool.mint(
            address(this),
            _tickLower,
            _tickUpper,
            liquidity,
            abi.encode(MintCallbackData({payer: _payer, pool: address(pool)}))
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
        MintCallbackData memory decoded = abi.decode(data, (MintCallbackData));

        // check if the callback is received from Uniswap V3 Pool
        require(msg.sender == pool_);
        IUniswapV3Pool pool = IUniswapV3Pool(pool_);
        delete pool_;

        if (decoded.payer == address(this)) {
            // transfer tokens already in the contract
            if (amount0 > 0) {
                TransferHelper.safeTransfer(pool.token0(), msg.sender, amount0);
            }
            if (amount1 > 0) {
                TransferHelper.safeTransfer(pool.token1(), msg.sender, amount1);
            }
        } else {
            // take and transfer tokens to Uniswap V3 pool from the user
            if (amount0 > 0) {
                TransferHelper.safeTransferFrom(
                    pool.token0(),
                    decoded.payer,
                    msg.sender,
                    amount0
                );
            }
            if (amount1 > 0) {
                TransferHelper.safeTransferFrom(
                    pool.token1(),
                    decoded.payer,
                    msg.sender,
                    amount1
                );
            }
        }
    }

    // swaps with exact input single functionality
    function swap(
        address _pool,
        bool _zeroToOne,
        int256 _amount,
        uint160 _sqrtPriceLimitX96
    ) external returns (uint256 amountOut) {
        IUniswapV3Pool pool = IUniswapV3Pool(_pool);
        (uint160 sqrtRatioX96, , , , , , ) = pool.slot0();

        (amountOut) = swapExactInput(
            _pool,
            _zeroToOne,
            _amount,
            _sqrtPriceLimitX96
        );

        (uint160 newSqrtRatioX96, , , , , , ) = pool.slot0();

        uint160 difference = sqrtRatioX96 < newSqrtRatioX96
            ? sqrtRatioX96 / newSqrtRatioX96
            : newSqrtRatioX96 / sqrtRatioX96;
    }

    function swapExactInput(
        address _pool,
        bool _zeroToOne,
        int256 _amount,
        uint160 sqrtPriceLimitX96
    ) internal returns (uint256 amountOut) {
        IUniswapV3Pool pool = IUniswapV3Pool(_pool);

        // set temparary variable for callback verification
        pool_ = _pool;
        address _user = msg.sender;

        (int256 amount0, int256 amount1) = pool.swap(
            address(this),
            _zeroToOne,
            _amount,
            sqrtPriceLimitX96,
            abi.encode(SwapCallbackData({user: _user, zeroToOne: _zeroToOne}))
        );

        return uint256(-(_zeroToOne ? amount1 : amount0));
    }

    /**
     * @dev Callback for Uniswap V3 pool.
     */
    function uniswapV3SwapCallback(
        int256 amount0,
        int256 amount1,
        bytes calldata data
    ) external override {
        SwapCallbackData memory decoded = abi.decode(data, (SwapCallbackData));
        // check if the callback is received from Uniswap V3 Pool
        require(msg.sender == pool_);
        IUniswapV3Pool pool = IUniswapV3Pool(pool_);
        delete pool_;

        if (decoded.zeroToOne) {
            TransferHelper.safeTransferFrom(
                pool.token0(),
                decoded.user,
                msg.sender,
                uint256(amount0)
            );
        } else {
            TransferHelper.safeTransferFrom(
                pool.token1(),
                decoded.user,
                msg.sender,
                uint256(amount1)
            );
        }
    }
}
