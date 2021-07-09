# Random Decisions

1. When user removes liquidity, he can only remove liquidity from unused if his calculated unused amounts are greater than 1000 GWEI, to save gas by not performing transfer for minor amounts

2. At the time of rebalance, 100% of the liquidity is burned and redeployed to new ranges, to burn 100% of the liquidity Uniswap V3 requires `liquidity` value which needs to be burned. The `liquidity` value is calculated from `amount0` and `amount1` sometimes the calculated `liquidity` value for burning 100% liquidity is more than the total liquidity pool is holding (more by just 10-20 GWEI). So everytime 100% of the liquidity is getting burned, we remove 100 GWEI from `amount0` and `amount` then calculate the liquidity value from new amounts and burn the liquidity.

3. While issuance of the shares, first the maximum amount of out of `amount0` and `amount` is considered as initial shares