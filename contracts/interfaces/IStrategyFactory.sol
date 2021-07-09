//SPDX-License-Identifier: Unlicense
pragma solidity =0.7.6;

interface IStrategyFactory {
    function isValid(address) external view returns (bool);
}
