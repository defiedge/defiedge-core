//SPDX-License-Identifier: Unlicense
pragma solidity =0.7.6;

interface IStrategyManager {
    function managementFee() external view returns (uint256);

    function performanceFee() external view returns (uint256);

    function operator() external view returns (address);

    function limit() external view returns (uint256);

    function freezeEmergency() external view returns (bool);

    function allowedDeviation() external view returns (uint256);

    function allowedSwapDeviation() external view returns (uint256);

    function feeTo() external view returns (address);

    function factory() external view returns (address);

    function increamentSwapCounter() external returns(bool);
}
