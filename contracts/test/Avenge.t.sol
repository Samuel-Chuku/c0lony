// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {ColonyGame} from "../src/ColonyGame.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @notice Avenge (a free raid back at the winner), the raid record counters, getProfile, the richer events
///         and the locked colony NFT.
contract AvengeTest is Base {
    uint64 internal a; // alice raids
    uint64 internal b; // bob is raided and avenges
    uint64 internal c; // carol, a bystander

    uint256 internal constant WIN = 0; // roll 1: the raider wins an unguarded raid
    uint256 internal constant LOSS = 99; // roll 100: the raider loses

    function setUp() public override {
        super.setUp();
        a = _found(alice);
        b = _found(bob);
        c = _found(carol);
        game.setStock(a, uint128(100 * RES), uint128(100 * RES));
        game.setStock(b, uint128(100 * RES), uint128(100 * RES));
        game.setStock(c, uint128(100 * RES), uint128(100 * RES));
    }

    /// @dev Alice raids bob for sugar; the outcome is forced through the harness with a chosen random number.
    function _aliceRaidsBob(uint256 rand) internal returns (uint256 raidId) {
        raidId = _launch(alice, a, b, 3, ColonyGame.Resource.Sugar);
        vm.warp(vm.getBlockTimestamp() + 4 hours);
        vm.prank(alice);
        game.reveal(raidId, ColonyGame.Resource.Sugar, _salt(alice, raidId));
        game.resolveWith(raidId, rand);
    }

    function _avenge(address who, uint64 whoId, address target, uint32 soldiers) internal returns (uint256 raidId) {
        raidId = game.nextRaidId(whoId);
        bytes32 commitment = game.commitmentFor(ColonyGame.Resource.Leaves, _salt(who, raidId), raidId);
        vm.prank(who);
        game.avenge(target, soldiers, commitment);
    }

    // ------------------------------------------------------------------ granting

    function test_grantedOnRaiderWin_withEvent() public {
        uint256 raidId = _launch(alice, a, b, 3, ColonyGame.Resource.Sugar);
        vm.warp(vm.getBlockTimestamp() + 4 hours);
        vm.prank(alice);
        game.reveal(raidId, ColonyGame.Resource.Sugar, _salt(alice, raidId));
        uint64 expires = uint64(vm.getBlockTimestamp() + 24 hours);
        vm.expectEmit(address(game));
        emit ColonyGame.AvengeGranted(bob, alice, raidId, expires);
        game.resolveWith(raidId, WIN);

        (bool ok, uint64 at) = game.avengeAvailable(bob, alice);
        assertTrue(ok);
        assertEq(at, expires);
        (ok,) = game.avengeAvailable(alice, bob);
        assertFalse(ok, "only the defender gets it");
    }

    function test_notGrantedWhenRaiderLoses() public {
        _aliceRaidsBob(LOSS);
        (bool ok, uint64 at) = game.avengeAvailable(bob, alice);
        assertFalse(ok);
        assertEq(at, 0);
    }

    function test_notGrantedWhenGuarded() public {
        uint256 raidId = _launch(alice, a, b, 3, ColonyGame.Resource.Sugar);
        vm.prank(bob);
        game.guard(raidId, ColonyGame.Resource.Sugar);
        vm.warp(vm.getBlockTimestamp() + 4 hours);
        vm.prank(alice);
        game.reveal(raidId, ColonyGame.Resource.Sugar, _salt(alice, raidId));
        game.resolveWith(raidId, WIN);
        (bool ok,) = game.avengeAvailable(bob, alice);
        assertFalse(ok);
    }

    function test_newWinRefreshesExpiry() public {
        _aliceRaidsBob(WIN);
        (, uint64 first) = game.avengeAvailable(bob, alice);
        vm.warp(vm.getBlockTimestamp() + 6 hours); // alice's cooldown
        _aliceRaidsBob(WIN);
        (bool ok, uint64 second) = game.avengeAvailable(bob, alice);
        assertTrue(ok);
        assertEq(second, first + 10 hours);
    }

    // ------------------------------------------------------------------ using it

    function test_avenge_launchesLabelledRaidAgainstTheRaider() public {
        _aliceRaidsBob(WIN);
        uint256 raidId = game.nextRaidId(b);
        bytes32 commitment = game.commitmentFor(ColonyGame.Resource.Leaves, _salt(bob, raidId), raidId);
        vm.expectEmit(address(game));
        emit ColonyGame.RaidLaunched(
            raidId, b, a, bob, alice, 3, uint64(vm.getBlockTimestamp() + 4 hours), true
        );
        vm.prank(bob);
        game.avenge(alice, 3, commitment);
        (uint64 raider, uint64 defender, uint32 soldiers,,,,,,,) = game.raids(raidId);
        assertEq(raider, b);
        assertEq(defender, a);
        assertEq(soldiers, 3);
    }

    function test_avenge_usableOnce() public {
        _aliceRaidsBob(WIN);
        _avenge(bob, b, alice, 1);
        (bool ok,) = game.avengeAvailable(bob, alice);
        assertFalse(ok, "cleared when used");
        vm.prank(bob);
        vm.expectRevert(ColonyGame.NoAvenge.selector);
        game.avenge(alice, 1, bytes32(0));
    }

    function test_avenge_expiresAfter24h() public {
        _aliceRaidsBob(WIN);
        vm.warp(vm.getBlockTimestamp() + 24 hours + 1);
        (bool ok,) = game.avengeAvailable(bob, alice);
        assertFalse(ok);
        vm.prank(bob);
        vm.expectRevert(ColonyGame.NoAvenge.selector);
        game.avenge(alice, 1, bytes32(0));
    }

    function test_avenge_usableAtExactly24h() public {
        _aliceRaidsBob(WIN);
        vm.warp(vm.getBlockTimestamp() + 24 hours);
        _avenge(bob, b, alice, 1);
    }

    function test_avenge_skipsCallersCooldown_andDoesNotRestartIt() public {
        _aliceRaidsBob(WIN);
        // Bob raids carol, which starts his 6 h cooldown
        vm.prank(bob);
        game.launchRaid(c, 1, bytes32(0));
        vm.prank(bob);
        vm.expectRevert(ColonyGame.NotReady.selector);
        game.launchRaid(a, 1, bytes32(0));
        // ...but the avenge still goes through
        _avenge(bob, b, alice, 1);
        // and once the normal cooldown is over he can raid again: the avenge did not restart it
        vm.warp(vm.getBlockTimestamp() + 6 hours);
        game.setWorkers(b, 20, 10);
        vm.prank(bob);
        game.launchRaid(c, 1, bytes32(0));
    }

    function test_avenge_cooldownFreeButOtherRulesStillApply() public {
        _aliceRaidsBob(WIN);
        vm.prank(bob);
        vm.expectRevert(ColonyGame.BadSoldiers.selector);
        game.avenge(alice, 4, bytes32(0)); // 30% of 10 idle = 3
        game.setWorkers(a, 21, 10);
        vm.prank(bob);
        vm.expectRevert(ColonyGame.OutOfRange.selector);
        game.avenge(alice, 1, bytes32(0));
        (bool ok,) = game.avengeAvailable(bob, alice);
        assertTrue(ok, "a reverted attempt keeps the grant");
    }

    function test_avenge_blockedByRaidersShield() public {
        _aliceRaidsBob(WIN);
        vm.prank(alice);
        game.shield();
        vm.prank(bob);
        vm.expectRevert(ColonyGame.TargetShielded.selector);
        game.avenge(alice, 1, bytes32(0));
    }

    function test_avenge_cannotTargetAnyoneElse() public {
        _aliceRaidsBob(WIN);
        vm.prank(bob);
        vm.expectRevert(ColonyGame.NoAvenge.selector);
        game.avenge(carol, 1, bytes32(0));
        vm.prank(carol);
        vm.expectRevert(ColonyGame.NoAvenge.selector);
        game.avenge(alice, 1, bytes32(0));
        vm.prank(alice);
        vm.expectRevert(ColonyGame.NoAvenge.selector);
        game.avenge(bob, 1, bytes32(0));
    }

    // ------------------------------------------------------------------ raid record and profile

    function test_raidRecord_counters() public {
        _aliceRaidsBob(WIN);
        vm.warp(vm.getBlockTimestamp() + 6 hours);
        _aliceRaidsBob(LOSS);
        ColonyGame.Profile memory pa = game.getProfile(alice);
        ColonyGame.Profile memory pb = game.getProfile(bob);
        assertEq(pa.raidsWon, 1);
        assertEq(pa.raidsLost, 1);
        assertEq(pa.raidsFaced, 0);
        assertEq(pb.raidsFaced, 2);
        assertEq(pb.raidsDefended, 1);
        assertEq(pb.raidsWon + pb.raidsLost, 0);
    }

    function test_profile_fields() public {
        ColonyGame.Profile memory p = game.getProfile(alice);
        assertEq(p.colonyId, a);
        assertEq(uint8(p.status), uint8(ColonyGame.Status.Alive));
        assertEq(p.season, 1);
        assertEq(p.ants, 10);
        assertEq(p.capacity, 10);
        assertEq(p.chambers, 2);
        assertEq(p.freeAnts, 10);
        assertEq(p.leaves, 100 * RES);
        assertEq(p.sugar, 100 * RES);
        assertEq(p.foundedAt, T0);
        assertEq(p.foundedDay, 1);
        assertEq(p.fedUntil, T0 + 72 hours);
        assertFalse(p.hasVoterPass);
    }

    function test_profile_includesUncollectedOutputAndAssignments() public {
        vm.startPrank(alice);
        game.buildTrail();
        game.assignWorkers(4, 0);
        vm.stopPrank();
        uint256 leavesNow = game.getProfile(alice).leaves;
        vm.warp(vm.getBlockTimestamp() + 1 hours);
        ColonyGame.Profile memory p = game.getProfile(alice);
        assertEq(p.trails, 1);
        assertEq(p.trailWorkers, 4);
        assertEq(p.freeAnts, 6);
        assertEq(p.leaves - leavesNow, 4 * 3600 * 11_500, "trail output counted before tending");
    }

    function test_profile_foundedDay_laterInSeason() public {
        vm.warp(T0 + 2 days + 5 hours);
        _found(keeper);
        assertEq(game.getProfile(keeper).foundedDay, 3);
        assertEq(game.seasonDay(1, uint64(T0)), 1);
    }

    function test_profile_noColony() public {
        ColonyGame.Profile memory p = game.getProfile(makeAddr("nobody"));
        assertEq(p.colonyId, 0);
        assertEq(p.season, 1);
        assertEq(p.ants, 0);
        assertEq(uint8(p.status), uint8(ColonyGame.Status.None));
    }

    // ------------------------------------------------------------------ events carry the owner and the numbers

    function test_events_founded() public {
        vm.warp(T0 + 1 days);
        vm.expectEmit(address(game));
        emit ColonyGame.ColonyFounded(4, keeper, 1, uint64(T0 + 1 days), 2);
        _found(keeper);
    }

    function test_events_tend_build_assign_feed() public {
        vm.warp(T0 + 6 hours);
        vm.expectEmit(address(game));
        emit ColonyGame.Tended(a, alice, 6 * RES, 3 * RES); // both hand forages ready; 10 workers add 0.8 -> 0 sugar
        vm.prank(alice);
        game.tend();

        vm.expectEmit(address(game));
        emit ColonyGame.Built(a, alice, "chamber", 10, 0, 3);
        vm.prank(alice);
        game.digChamber();

        vm.expectEmit(address(game));
        emit ColonyGame.Built(a, alice, "trail", 50, 0, 1);
        vm.prank(alice);
        game.buildTrail();

        vm.expectEmit(address(game));
        emit ColonyGame.WorkersAssigned(a, alice, 2, 0, 8);
        vm.prank(alice);
        game.assignWorkers(2, 0);

        vm.expectEmit(true, true, false, false, address(game));
        emit ColonyGame.QueenFed(a, alice, 0, 0, 0, 0, 0, 0);
        _feed(alice);
        assertEq(game.getProfile(alice).fedUntil, uint64(vm.getBlockTimestamp() + 72 hours));
    }

    function test_events_paidNamesThePlayer() public {
        vm.expectEmit(address(game));
        emit ColonyGame.Paid(4, keeper, "found", 1_500 ether, 1_050 ether, 300 ether, 150 ether);
        _found(keeper);
    }

    function test_events_guardedNamesTheOwner() public {
        uint256 raidId = _launch(alice, a, b, 3, ColonyGame.Resource.Sugar);
        vm.expectEmit(address(game));
        emit ColonyGame.Guarded(raidId, b, bob, ColonyGame.Resource.Leaves);
        vm.prank(bob);
        game.guard(raidId, ColonyGame.Resource.Leaves);
    }

    // ------------------------------------------------------------------ locked colony NFT

    function test_nft_lockedForEveryTransferPath() public {
        vm.startPrank(alice);
        vm.expectRevert(ColonyGame.Soulbound.selector);
        IERC721(address(game)).safeTransferFrom(alice, bob, a);
        IERC721(address(game)).approve(carol, a);
        vm.stopPrank();
        vm.prank(carol);
        vm.expectRevert(ColonyGame.Soulbound.selector);
        IERC721(address(game)).transferFrom(alice, carol, a);
        assertEq(IERC721(address(game)).ownerOf(a), alice);
    }

    function test_nft_unlockPlaceholder_ownerOnly_andInert() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        game.unlockSeasonNfts(1);
        vm.prank(owner);
        vm.expectRevert(ColonyGame.NotYetAvailable.selector);
        game.unlockSeasonNfts(1);
    }
}
