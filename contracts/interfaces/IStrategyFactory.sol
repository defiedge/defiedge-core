//SPDX-License-Identifier: Unlicense
pragma solidity =0.7.6;

interface IStrategyFactory {
    function isValid(address) external view returns (bool);

    function feeTo() external view returns (address);

    function denied(address) external view returns (bool);

    function PROTOCOL_FEE() external view returns (uint256);

    function governance() external view returns (address);

    function uniswapV3Factory() external view returns (address);
}
