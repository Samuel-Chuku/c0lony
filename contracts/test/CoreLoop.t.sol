// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {ColonyGame} from "../src/ColonyGame.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract CoreLoopTest is Base {
    // ------------------------------------------------------------------ founding and the 70/20/10 split

    function test_found_setsStartingColony_andSplitsPayment() public {
        uint256 supplyBefore = wif.totalSupply();
        uint64 id = _found(alice);

        ColonyGame.ColonyView memory v = _colony(id);
        assertEq(uint8(v.status), uint8(ColonyGame.Status.Alive));
        assertEq(v.data.workers, 10);
        assertEq(v.data.chambers, 2);
        assertEq(v.data.leaves, 20 * RES);
        assertEq(v.data.sugar, 20 * RES);
        assertEq(game.ownerOf(id), alice);

        // 1,500 WIF: 1,050 to pot, 300 burned, 150 to treasury
        assertEq(wif.balanceOf(address(pot)), 1_050 ether);
        assertEq(wif.balanceOf(address(treasury)), 150 ether);
        assertEq(supplyBefore - wif.totalSupply(), 300 ether);
        assertEq(wif.balanceOf(address(game)), 0);
        (uint256 seasonPot,,,,,,,,,,,,) = pot.seasons(1);
        assertEq(seasonPot, 1_050 ether);
    }

    function testFuzz_split_7020_10(uint256 price) public {
        ColonyGame.Config memory c = game.getConfig();
        price = bound(price, c.feedPrice / 4, c.feedPrice * 4);
        c.feedPrice = price;
        vm.prank(owner);
        game.setConfig(c);

        _found(alice);
        uint256 potBefore = wif.balanceOf(address(pot));
        uint256 trBefore = wif.balanceOf(address(treasury));
        uint256 supplyBefore = wif.totalSupply();
        uint256 aliceBefore = wif.balanceOf(alice);
        _feed(alice);

        uint256 burned = supplyBefore - wif.totalSupply();
        uint256 toTreasury = wif.balanceOf(address(treasury)) - trBefore;
        uint256 toPot = wif.balanceOf(address(pot)) - potBefore;
        assertEq(aliceBefore - wif.balanceOf(alice), price, "player pays exactly the price");
        assertEq(burned + toTreasury + toPot, price, "nothing lost or created");
        assertEq(burned, price * 20 / 100);
        assertEq(toTreasury, price * 10 / 100);
        assertGe(toPot * 100, price * 70, "pot gets at least 70% (keeps rounding dust)");
        assertEq(wif.balanceOf(address(game)), 0, "game never holds WIF");
    }

    function test_nft_nameAndSymbol() public view {
        assertEq(game.name(), "C0LONY");
        assertEq(game.symbol(), "C0L");
    }

    function test_found_onlyOneLivingColony() public {
        _found(alice);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.AlreadyHasColony.selector);
        game.foundColony(NO_PROOF);
    }

    function test_nft_isSoulbound() public {
        uint64 id = _found(alice);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.Soulbound.selector);
        IERC721(address(game)).transferFrom(alice, bob, id);
    }

    // ------------------------------------------------------------------ tending

    function test_tend_collectsHandForagesAndRestartsTimers() public {
        uint64 id = _found(alice);
        vm.prank(alice);
        game.tend();
        // +6 leaves, +3 sugar + floor(0.08 * 10) = 3
        assertEq(_leaves(id), 26 * RES);
        assertEq(_sugar(id), 23 * RES);

        // Not ready again for 3 h (sugar) / 6 h (leaves)
        vm.warp(vm.getBlockTimestamp() + 3 hours);
        vm.prank(alice);
        game.tend();
        assertEq(_leaves(id), 26 * RES);
        assertEq(_sugar(id), 26 * RES);

        vm.warp(vm.getBlockTimestamp() + 3 hours);
        vm.prank(alice);
        game.tend();
        assertEq(_leaves(id), 32 * RES);
        assertEq(_sugar(id), 29 * RES);
    }

    function test_trailAndFarm_produceNonstop() public {
        uint64 id = _found(alice);
        game.setStock(id, uint128(1_000 * RES), uint128(1_000 * RES));
        vm.startPrank(alice);
        game.buildTrail(); // 50 leaves
        game.buildFarm(); // 25 leaves + 25 sugar
        game.assignWorkers(5, 5);
        vm.stopPrank();
        uint256 l0 = _leaves(id);
        uint256 s0 = _sugar(id);

        vm.warp(vm.getBlockTimestamp() + 1 hours);
        ColonyGame.ColonyView memory v = _colony(id);
        assertEq(v.pendingLeaves, 3600 * 5 * 11_500);
        assertEq(v.pendingSugar, 3600 * 5 * 11_500);

        // Reassigning collects what has accrued first
        vm.prank(alice);
        game.assignWorkers(0, 0);
        assertEq(_leaves(id), l0 + 3600 * 5 * 11_500);
        assertEq(_sugar(id), s0 + 3600 * 5 * 11_500);
    }

    function test_assign_limits() public {
        uint64 id = _found(alice);
        game.setStock(id, uint128(1_000 * RES), uint128(1_000 * RES));
        vm.startPrank(alice);
        vm.expectRevert(ColonyGame.TooManyWorkers.selector);
        game.assignWorkers(1, 0); // no trail yet
        game.buildTrail();
        vm.expectRevert(ColonyGame.TooManyWorkers.selector);
        game.assignWorkers(11, 0); // only 10 workers
        game.assignWorkers(10, 0);
        vm.stopPrank();
    }

    function test_buildingCosts_followFormulas() public {
        uint64 id = _found(alice);
        assertEq(game.chamberCost(id), 10);
        assertEq(game.trailCost(id), 50);
        assertEq(game.farmCost(id), 25);
        game.setWorkers(id, 200, 40);
        assertEq(game.chamberCost(id), 40); // 0.2 x 200
        assertEq(game.trailCost(id), 100); // max(2 x 40, 0.5 x 200)
        assertEq(game.farmCost(id), 50); // 0.25 x 200
    }

    function test_digChamber_spendsLeaves() public {
        uint64 id = _found(alice);
        vm.prank(alice);
        game.digChamber();
        assertEq(_colony(id).data.chambers, 3);
        assertEq(_leaves(id), 10 * RES);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.NotEnoughLeaves.selector);
        game.buildTrail();
    }

    // ------------------------------------------------------------------ feeding and growth

    function test_feed_growthAndScore() public {
        uint64 id = _found(alice);
        vm.prank(alice);
        game.digChamber(); // capacity 15, leaves 10
        _feed(alice);
        // 10 workers eat 10 sugar -> 10 left -> 5 new workers (2 sugar each), capped by 5 free spaces
        ColonyGame.ColonyView memory v = _colony(id);
        assertEq(v.data.workers, 15);
        assertEq(v.data.sugar, 0);
        assertEq(v.data.leaves, 7 * RES);
        assertEq(v.data.score, 15);
        assertEq(v.data.feedCount, 1);
    }

    function test_feed_shortfallKillsWorkers() public {
        uint64 id = _found(alice);
        game.setStock(id, uint128(10 * RES), uint128(4 * RES));
        _feed(alice);
        assertEq(_workers(id), 4);
        assertEq(_sugar(id), 0);
        assertEq(_colony(id).data.score, 4);
    }

    function test_feed_atMostOncePer24h() public {
        _found(alice);
        _feed(alice);
        vm.warp(vm.getBlockTimestamp() + 24 hours - 1);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.NotReady.selector);
        game.feedQueen(NO_PROOF);
        vm.warp(vm.getBlockTimestamp() + 1);
        _feed(alice);
    }

    // ------------------------------------------------------------------ speed-up and shield

    function test_speedUp_collectsNow_oncePer24h() public {
        uint64 id = _found(alice);
        vm.prank(alice);
        game.tend();
        uint256 l = _leaves(id);
        vm.prank(alice);
        game.speedUp(ColonyGame.Resource.Leaves);
        assertEq(_leaves(id), l + 6 * RES);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.NotReady.selector);
        game.speedUp(ColonyGame.Resource.Leaves);
        vm.prank(alice);
        game.speedUp(ColonyGame.Resource.Sugar); // separate per action
    }

    function test_shield_blocksNewRaids_oncePer24h() public {
        uint64 a = _found(alice);
        uint64 b = _found(bob);
        vm.prank(bob);
        game.shield();
        bytes32 c = game.commitmentFor(ColonyGame.Resource.Leaves, bytes32(0), game.nextRaidId(a));
        vm.prank(alice);
        vm.expectRevert(ColonyGame.TargetShielded.selector);
        game.launchRaid(b, 1, c);

        vm.prank(bob);
        vm.expectRevert(ColonyGame.NotReady.selector);
        game.shield();

        vm.warp(vm.getBlockTimestamp() + 8 hours);
        vm.prank(alice);
        game.launchRaid(b, 1, c);
    }

    // ------------------------------------------------------------------ starvation, revive, collapse

    function test_collapseAndReviveTiming() public {
        uint64 id = _found(alice);
        uint256 founded = vm.getBlockTimestamp();

        vm.warp(founded + 72 hours);
        assertEq(uint8(_colony(id).status), uint8(ColonyGame.Status.Alive), "alive at exactly 72 h");
        vm.prank(alice);
        vm.expectRevert(ColonyGame.NotStarving.selector);
        game.revive();

        vm.warp(founded + 72 hours + 1);
        assertEq(uint8(_colony(id).status), uint8(ColonyGame.Status.Starving));
        vm.prank(alice);
        vm.expectRevert(ColonyGame.NotAlive.selector);
        game.feedQueen(NO_PROOF);

        vm.warp(founded + 96 hours);
        uint256 before = wif.balanceOf(alice);
        vm.prank(alice);
        game.revive();
        assertEq(before - wif.balanceOf(alice), 2_000 ether + 10 * 20 ether, "2,000 + 20 per worker");
        ColonyGame.ColonyView memory v = _colony(id);
        assertEq(uint8(v.status), uint8(ColonyGame.Status.Alive));
        assertEq(v.data.workers, 10, "restored as it was");
    }

    function test_collapse_after96h_thenRefound() public {
        uint64 id = _found(alice);
        vm.warp(vm.getBlockTimestamp() + 96 hours + 1);
        assertEq(uint8(_colony(id).status), uint8(ColonyGame.Status.Collapsed));
        vm.prank(alice);
        vm.expectRevert(ColonyGame.NotStarving.selector);
        game.revive();

        vm.expectEmit(address(game));
        emit ColonyGame.ColonyCollapsed(id);
        uint64 id2 = _found(alice);
        assertGt(id2, id);
        assertEq(_workers(id), 0, "collapsed colony zeroed");
        assertEq(game.colonyOf(1, alice), id2);
    }

    function test_pokeCollapse_onlyWhenCollapsed() public {
        uint64 id = _found(alice);
        vm.expectRevert(ColonyGame.WrongStatus.selector);
        game.pokeCollapse(id);
        vm.warp(vm.getBlockTimestamp() + 97 hours);
        game.pokeCollapse(id);
        assertEq(_colony(id).data.score, 0);
    }

    // ------------------------------------------------------------------ owner config caps

    function test_config_capsEnforced() public {
        ColonyGame.Config memory c = game.getConfig();
        ColonyGame.Config memory bad = game.getConfig();
        bad.foundPrice = c.foundPrice * 4 + 1;
        vm.prank(owner);
        vm.expectRevert(ColonyGame.BadConfig.selector);
        game.setConfig(bad);

        bad = game.getConfig();
        bad.feedPrice = c.feedPrice / 4 - 1;
        vm.prank(owner);
        vm.expectRevert(ColonyGame.BadConfig.selector);
        game.setConfig(bad);

        bad = game.getConfig();
        bad.winOddsUnguarded = 86;
        vm.prank(owner);
        vm.expectRevert(ColonyGame.BadConfig.selector);
        game.setConfig(bad);

        bad = game.getConfig();
        bad.guardWindow = 9 hours;
        vm.prank(owner);
        vm.expectRevert(ColonyGame.BadConfig.selector);
        game.setConfig(bad);

        bad = game.getConfig();
        bad.raidCooldown = c.raidCooldown * 4 + 1;
        vm.prank(owner);
        vm.expectRevert(ColonyGame.BadConfig.selector);
        game.setConfig(bad);

        // Within caps works and emits
        ColonyGame.Config memory ok = game.getConfig();
        ok.foundPrice = c.foundPrice * 4;
        ok.winOddsUnguarded = 50;
        vm.expectEmit(address(game));
        emit ColonyGame.ConfigUpdated(c, ok);
        vm.prank(owner);
        game.setConfig(ok);

        vm.prank(alice);
        vm.expectRevert();
        game.setConfig(c);
    }

    function test_seasonEnd_ownerCanMoveWithinCap() public {
        uint64 start = game.seasonStart(1);
        vm.startPrank(owner);
        vm.expectRevert(ColonyGame.BadSeasonEnd.selector);
        game.setCurrentSeasonEnd(start + 21 days + 1);
        game.setCurrentSeasonEnd(start + 21 days);
        vm.stopPrank();
        assertEq(game.seasonEnd(1), start + 21 days);
        assertEq(game.seasonEnd(2), start + 28 days);
    }

    function test_seasonRollover_freezesOldColonies() public {
        uint64 id = _found(alice);
        vm.warp(game.seasonEnd(1));
        assertEq(game.currentSeason(), 2);
        assertEq(uint8(_colony(id).status), uint8(ColonyGame.Status.SeasonOver));
        vm.prank(alice);
        vm.expectRevert(ColonyGame.NoColony.selector);
        game.feedQueen(NO_PROOF);
        uint64 id2 = _found(alice); // fresh colony in season 2
        assertEq(game.colonyOf(2, alice), id2);
    }
}
