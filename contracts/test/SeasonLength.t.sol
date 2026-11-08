// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ColonyGame} from "../src/ColonyGame.sol";
import {SeasonPot} from "../src/SeasonPot.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockWIF} from "../src/mocks/MockWIF.sol";
import {IWIF} from "../src/interfaces/IWIF.sol";
import {ISeasonPot} from "../src/interfaces/ISeasonPot.sol";
import {ITreasury} from "../src/interfaces/ITreasury.sol";

/// Launch season lengths: 10 days by default, no season longer than 35; the deploy can set Season 1's exact end.
contract SeasonLengthTest is Test {
    ColonyGame game;
    address owner = makeAddr("owner");

    function setUp() public {
        vm.warp(1_800_000_000);
        MockWIF wif = new MockWIF();
        Treasury t = new Treasury(IERC20(address(wif)), owner, 0);
        SeasonPot pot = new SeasonPot(IERC20(address(wif)));
        game = new ColonyGame(IWIF(address(wif)), ISeasonPot(address(pot)), ITreasury(address(t)), owner);
    }

    function test_defaultSeasonsAreTenDays() public view {
        uint64 start = game.seasonStart(1);
        assertEq(game.seasonEnd(1), start + 10 days);
        assertEq(game.seasonEnd(2), start + 20 days);
        assertEq(game.getConfig().seasonLength, 10 days);
    }

    function test_season1EndSetExactly_thenTenDaySeasons() public {
        uint64 start = game.seasonStart(1);
        uint64 end = start + 8 days + 12 hours; // e.g. 24 h before a final closes
        vm.prank(owner);
        game.setCurrentSeasonEnd(end);
        assertEq(game.seasonEnd(1), end);
        assertEq(game.seasonEnd(2), end + 10 days);
    }

    function test_seasonLengthCappedAt35Days() public {
        ColonyGame.Config memory c = game.getConfig();
        c.seasonLength = 35 days + 1;
        vm.prank(owner);
        vm.expectRevert(ColonyGame.BadConfig.selector);
        game.setConfig(c);
        c.seasonLength = 35 days;
        vm.prank(owner);
        game.setConfig(c);
    }
}
