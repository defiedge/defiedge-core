//SPDX-License-Identifier: BSL
pragma solidity =0.7.6;
pragma abicoder v2;

import "../interfaces/IOneInch.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

library OneInchHelper {

    /**
     * @dev Calculate year/month/day from the number of days since 1970/01/01 using
     *      the date conversion algorithm from http://aa.usno.navy.mil/faq/docs/JD_Formula.php
     *      and adding the offset 2440588 so that 1970/01/01 is day 0
     * @param token0 token0 address of strategy
     * @param token1 token1 address of strategy
     * @param data bytes data to decode
     */
    function decodeData(address token0, address token1, bytes calldata data)
        public
        view
        returns (
            address srcToken,
            address dstToken,
            uint256 amount
        )
    {
        IOneInch.SwapDescription memory description;
        if(data[0] == 0x7c) {
            // call swap() method
            (, description, ) = abi.decode(data[4:], (address, IOneInch.SwapDescription, bytes));

            srcToken = description.srcToken;
            dstToken = description.dstToken;
            amount = description.amount;

        } else if(data[0] == 0x2e){
            // call unoswap() method
            (srcToken, amount, ,) = abi.decode(
                data[4:],
                (address, uint256, uint256, bytes32[])
            );

            dstToken = srcToken == token0 ? token1 : token0;

        } else if(data[0] == 0xe4){
            // call uniswapV3Swap() method
            (uint256 _amount, ,uint256[] memory pools) = abi.decode(
                data[4:],
                (uint256, uint256, uint256[])
            );

            bool zeroForOne = pools[0] & 1 << 255 == 0;

            srcToken = zeroForOne ? IUniswapV3Pool(pools[0]).token0() : IUniswapV3Pool(pools[0]).token1();
            dstToken = srcToken == token0 ? token1 : token0;
            amount = _amount;

        }

    }
}
