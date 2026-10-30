// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface ISeasonPot {
    function addFromGame(uint32 season, uint256 amount) external;
    function sponsor(uint32 season, uint256 amount, string calldata name) external;
}
