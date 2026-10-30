// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface ITreasury {
    function drip(address player) external returns (bool sent);
    function refundSettle(address caller, uint256 gasUsed) external returns (uint256 refunded);
}
