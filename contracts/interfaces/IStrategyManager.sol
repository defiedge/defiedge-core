//SPDX-License-Identifier: Unlicense
pragma solidity ^0.7.6;

import "./IStrategyFactory.sol";

interface IStrategyManager {
    function isAllowedToManage(address) external view returns (bool);

    function isAllowedToBurn(address) external view returns (bool);

    function managementFee() external view returns (uint256); // 1e8 decimals

    function performanceFee() external view returns (uint256); // 1e8 decimals

    function operator() external view returns (address);

    function limit() external view returns (uint256);

    function freezeEmergency() external view returns (bool);

    function allowedDeviation() external view returns (uint256); // 1e18 decimals

    function allowedSwapDeviation() external view returns (uint256); // 1e18 decimals

    function feeTo() external view returns (address);

    function factory() external view returns (IStrategyFactory);

    function increamentSwapCounter() external ;
}
