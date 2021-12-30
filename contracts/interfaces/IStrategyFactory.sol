//SPDX-License-Identifier: Unlicense
pragma solidity =0.7.6;

interface IStrategyFactory {
    function allowedSlippage() external view returns (uint256);

    function isValid(address) external view returns (bool);

    function strategyByManager(address) external view returns (address);

    function feeTo() external view returns (address);

    function denied(address) external view returns (bool);

    function PROTOCOL_FEE() external view returns (uint256);

    function governance() external view returns (address);

    function uniswapV3Factory() external view returns (address);

    function chainlinkRegistry() external view returns (address);

    function swapRouter() external view returns (address);
}
