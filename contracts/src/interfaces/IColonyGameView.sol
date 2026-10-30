// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The read-only part of ColonyGame that SeasonPot relies on for scores and seasons.
interface IColonyGameView {
    function currentSeason() external view returns (uint32);
    function seasonEnd(uint32 season) external view returns (uint64);
    function fedTwiceCount(uint32 season) external view returns (uint32);
    function colonyOf(uint32 season, address wallet) external view returns (uint64);
    function colonyResult(uint64 colonyId)
        external
        view
        returns (uint32 season, uint256 score, bool fedTwice, bool qualifies);
}
