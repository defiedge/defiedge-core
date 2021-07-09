//SPDX-License-Identifier: Unlicense
pragma solidity =0.7.6;
pragma abicoder v2;

interface IStrategy {
    struct Tick {
        uint256 amount0;
        uint256 amount1;
        int24 tickLower;
        int24 tickUpper;
    }

    /// get ticks
    function ticks(uint256 index) external view returns (Tick memory);

    /// address of the pool
    function pool() external view returns (address);

    function initialized() external view returns (bool);

    function tickLength() external view returns (uint256);
    /// if this variable is present, rebalance will swap the amount and redeploy
    /// into newly provided ranges
    function swapAmount() external view returns (uint256);

    /// the direction of the swap, if enabled
    function zeroToOne() external view returns (bool);

    /// allowed slippage for the swap
    function sqrtPriceLimitX96() external view returns (uint160);

    /// if enabled, the aggregator will hold the liquidity
    function onHold() external view returns (bool);

    /// 1e8 means 100%
    /// strategy fee the owner wants to charge
    function managementFee() external view returns (uint256);

    /// address where the strategy owner's fees should be sent
    function feeTo() external view returns (address);

    /// slippage 1e6 means 100%
    /// allowed price slippage on the value of root p
    function allowedPriceSlippage() external view returns (uint256);
}
