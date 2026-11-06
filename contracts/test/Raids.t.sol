// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {ColonyGame} from "../src/ColonyGame.sol";
import {DrandVerifier} from "../src/DrandVerifier.sol";

contract RaidsTest is Base {
    uint64 internal a;
    uint64 internal b;
    uint64 internal constant ROUND = ROUND_DAY0; // published at T0 + 6 h

    function setUp() public override {
        super.setUp();
        a = _found(alice);
        b = _found(bob);
        game.setStock(a, uint128(100 * RES), uint128(100 * RES));
        game.setStock(b, uint128(100 * RES), uint128(100 * RES));
    }

    // ------------------------------------------------------------------ launch rules

    function test_launch_allFreeAntsMarch_andEmits() public {
        uint256 raidId = game.nextRaidId(a);
        bytes32 c = game.commitmentFor(ColonyGame.Resource.Sugar, _salt(alice, raidId), raidId);
        vm.expectEmit(address(game));
        emit ColonyGame.RaidLaunched(raidId, a, b, alice, bob, 10, uint64(vm.getBlockTimestamp() + 4 hours), false);
        vm.prank(alice);
        game.launchRaid(b, c, "");
        assertEq(_colony(a).data.soldiersOut, 10);
        assertEq(_colony(a).idle, 0);
    }

    function test_launch_assignedAntsStayHome_noFreeAntsReverts() public {
        game.setAssigned(a, 7, 0);
        _launch(alice, a, b, ColonyGame.Resource.Sugar);
        assertEq(_colony(a).data.soldiersOut, 3, "only the 3 free ants march");

        uint64 c = _found(carol);
        game.setAssigned(c, 6, 4);
        vm.prank(carol);
        vm.expectRevert(ColonyGame.NoFreeAnts.selector);
        game.launchRaid(a, bytes32(0), "");
    }

    function test_launch_rangeAndMinimumWorkers() public {
        game.setWorkers(b, 21, 10); // more than double alice's 10
        vm.prank(alice);
        vm.expectRevert(ColonyGame.OutOfRange.selector);
        game.launchRaid(b, bytes32(0), "");

        game.setWorkers(b, 20, 10); // exactly double is fine
        vm.prank(alice);
        game.launchRaid(b, bytes32(0), "");

        game.setWorkers(a, 9, 2);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.TooFewWorkers.selector);
        game.launchRaid(b, bytes32(0), "");
    }

    function test_launch_cooldown12h_andSelf() public {
        uint64 c = _found(carol);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.CannotRaidSelf.selector);
        game.launchRaid(a, bytes32(0), "");
        vm.prank(alice);
        game.launchRaid(b, bytes32(0), "");
        vm.warp(vm.getBlockTimestamp() + 12 hours - 1);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.NotReady.selector);
        game.launchRaid(c, bytes32(0), "");
        vm.warp(vm.getBlockTimestamp() + 1);
        game.setWorkers(a, 20, 10); // ants at home again, so only the cooldown could have blocked her
        vm.prank(alice);
        game.launchRaid(c, bytes32(0), "");
    }

    function test_launch_oneRaidAtATimePerTarget() public {
        _found(carol);
        vm.prank(alice);
        game.launchRaid(b, bytes32(0), "");
        vm.prank(carol);
        vm.expectRevert(ColonyGame.TargetBusy.selector);
        game.launchRaid(b, bytes32(0), "");
    }

    function test_launch_targetProtected12hAfterARaid() public {
        uint64 c = _found(carol);
        uint256 raidId = _launch(alice, a, b, ColonyGame.Resource.Sugar);
        uint256 launchedAt = vm.getBlockTimestamp();
        assertEq(game.raidableAt(b), launchedAt + 12 hours);
        assertEq(game.getProfile(bob).raidableAt, launchedAt + 12 hours);
        vm.warp(launchedAt + 4 hours);
        vm.prank(alice);
        game.reveal(raidId, ColonyGame.Resource.Sugar, _salt(alice, raidId));
        game.resolveWith(raidId, 0);

        vm.prank(carol);
        vm.expectRevert(ColonyGame.TargetProtected.selector);
        game.launchRaid(b, bytes32(0), "");
        vm.warp(launchedAt + 12 hours);
        _launch(carol, c, b, ColonyGame.Resource.Leaves);
    }

    function test_launch_shieldShowsInRaidableAt() public {
        vm.prank(bob);
        game.shield();
        assertEq(game.raidableAt(b), vm.getBlockTimestamp() + 8 hours);
    }

    function test_launch_cannotRaidWhileUnderAttack() public {
        uint64 c = _found(carol);
        _launch(alice, a, b, ColonyGame.Resource.Sugar);
        vm.prank(bob);
        vm.expectRevert(ColonyGame.UnderAttack.selector);
        game.launchRaid(c, bytes32(0), "");
    }

    // ------------------------------------------------------------------ the defender's stock is locked while a raid marches

    function test_lock_holds60pct_untilResolved() public {
        uint256 raidId = _launch(alice, a, b, ColonyGame.Resource.Sugar);
        ColonyGame.Profile memory p = game.getProfile(bob);
        assertEq(p.lockedLeaves, 60 * RES);
        assertEq(p.lockedSugar, 60 * RES);

        // 40 leaves are spendable: a 10-leaf chamber is fine, a 50-leaf trail is not
        vm.startPrank(bob);
        game.digChamber();
        vm.expectRevert(ColonyGame.StockLocked.selector);
        game.buildTrail();
        vm.stopPrank();

        // Feeding still works: the queen's leaves and the ants' meal ignore the lock, new ants only use free sugar
        _feed(bob);
        assertEq(_workers(b), 15, "free sugar 30 bought 5 ants, up to the 15 the chambers hold");

        vm.warp(vm.getBlockTimestamp() + 4 hours);
        vm.prank(alice);
        game.reveal(raidId, ColonyGame.Resource.Sugar, _salt(alice, raidId));
        game.resolveWith(raidId, 0);
        p = game.getProfile(bob);
        assertEq(p.lockedLeaves, 0, "released when the raid resolves");
        assertEq(p.lockedSugar, 0);
    }

    function test_lock_releasedOnCollect() public {
        uint256 raidId = _launch(alice, a, b, ColonyGame.Resource.Sugar);
        vm.warp(vm.getBlockTimestamp() + 28 hours);
        game.collect(raidId);
        assertEq(game.getProfile(bob).lockedSugar, 0);
    }

    // ------------------------------------------------------------------ guard, reveal, commitment, round

    function test_guard_onlyDefender_onlyOnce_onlyInWindow() public {
        uint256 raidId = _launch(alice, a, b, ColonyGame.Resource.Sugar);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.NotDefender.selector);
        game.guard(raidId, ColonyGame.Resource.Sugar);
        vm.prank(bob);
        game.guard(raidId, ColonyGame.Resource.Leaves);
        vm.prank(bob);
        vm.expectRevert(ColonyGame.AlreadyGuarded.selector);
        game.guard(raidId, ColonyGame.Resource.Sugar);

        uint64 k = _found(keeper);
        uint256 r2 = _launch(carol, _found(carol), k, ColonyGame.Resource.Sugar);
        vm.warp(vm.getBlockTimestamp() + 4 hours);
        vm.prank(keeper);
        vm.expectRevert(ColonyGame.GuardWindowClosed.selector);
        game.guard(r2, ColonyGame.Resource.Sugar);
    }

    function test_reveal_commitmentMismatch_reverts() public {
        uint256 raidId = _launch(alice, a, b, ColonyGame.Resource.Sugar);
        vm.warp(vm.getBlockTimestamp() + 4 hours);
        vm.startPrank(alice);
        vm.expectRevert(ColonyGame.BadCommitment.selector);
        game.reveal(raidId, ColonyGame.Resource.Leaves, _salt(alice, raidId)); // wrong target
        vm.expectRevert(ColonyGame.BadCommitment.selector);
        game.reveal(raidId, ColonyGame.Resource.Sugar, bytes32(uint256(123))); // wrong salt
        vm.stopPrank();
    }

    function test_reveal_notDuringGuardWindow_notAfterRevealWindow() public {
        uint256 raidId = _launch(alice, a, b, ColonyGame.Resource.Sugar);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.GuardWindowOpen.selector);
        game.reveal(raidId, ColonyGame.Resource.Sugar, _salt(alice, raidId));
        vm.warp(vm.getBlockTimestamp() + 28 hours);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.RevealWindowClosed.selector);
        game.reveal(raidId, ColonyGame.Resource.Sugar, _salt(alice, raidId));
    }

    function test_reveal_assignsFirstRoundAtLeast30sLater() public {
        uint256 raidId = _launch(alice, a, b, ColonyGame.Resource.Sugar);
        vm.warp(vm.getBlockTimestamp() + 4 hours + 17);
        uint256 t = vm.getBlockTimestamp();
        vm.prank(alice);
        game.reveal(raidId, ColonyGame.Resource.Sugar, _salt(alice, raidId));
        (,,,,,,,, uint64 round,) = game.raids(raidId);
        assertGe(DrandVerifier.roundTime(round), t + 30, "at least 30 s later");
        assertLt(DrandVerifier.roundTime(round - 1), t + 30, "first such round");
    }

    function testFuzz_roundAssignment(uint32 offset) public {
        uint256 raidId = _launch(alice, a, b, ColonyGame.Resource.Leaves);
        vm.warp(vm.getBlockTimestamp() + 4 hours + bound(offset, 0, 24 hours - 1));
        uint256 t = vm.getBlockTimestamp();
        vm.prank(alice);
        game.reveal(raidId, ColonyGame.Resource.Leaves, _salt(alice, raidId));
        (,,,,,,,, uint64 round,) = game.raids(raidId);
        assertGe(DrandVerifier.roundTime(round), t + 30);
        assertLt(DrandVerifier.roundTime(round), t + 33);
    }

    // ------------------------------------------------------------------ settle with real drand rounds

    function _sealAndReveal(ColonyGame.Resource target, ColonyGame.Resource guardWith)
        internal
        returns (uint256 raidId)
    {
        vm.warp(DrandVerifier.roundTime(ROUND) - 30 - 4 hours - 10 minutes);
        raidId = _launch(alice, a, b, target);
        if (guardWith != ColonyGame.Resource.None) {
            vm.prank(bob);
            game.guard(raidId, guardWith);
        }
        _revealAtRound(alice, raidId, target, ROUND);
    }

    function test_settle_realRound_resolves_andRefundsSettler() public {
        uint256 raidId = _sealAndReveal(ColonyGame.Resource.Sugar, ColonyGame.Resource.None);
        vm.txGasPrice(0.02 gwei);
        _setL1Fee(1_000_000_000); // 1 gwei-worth of L1 data fee
        uint256 trBefore = address(treasury).balance;
        uint256 kBefore = keeper.balance;

        _settle(keeper, raidId, ROUND);

        (,,, ColonyGame.RaidStatus st,,, ColonyGame.Outcome outcome,,,) = game.raids(raidId);
        assertEq(uint8(st), uint8(ColonyGame.RaidStatus.Settled));
        assertEq(uint8(outcome), uint8(ColonyGame.Outcome.RaiderWon), "an unguarded raid always wins");
        uint256 refund = keeper.balance - kBefore;
        assertGt(refund, 1_000_000_000, "refund includes execution gas and L1 fee");
        assertLe(refund, 0.00005 ether, "capped");
        assertEq(trBefore - address(treasury).balance, refund);
        assertEq(_colony(a).data.soldiersOut, 0, "soldiers released");

        // The share taken comes from keccak256(signature, raidId): 30-60% of bob's 100 sugar (well under 80 cap)
        uint256 rand = uint256(keccak256(abi.encodePacked(sigOf[ROUND], raidId)));
        uint256 pct = 30 + (rand % 1000) % 31;
        assertEq(_sugar(b), 100 * RES - 100 * RES * pct / 100, "loot from the drand roll");
    }

    function test_settle_refundCapped() public {
        uint256 raidId = _sealAndReveal(ColonyGame.Resource.Sugar, ColonyGame.Resource.None);
        vm.txGasPrice(100 gwei); // absurd gas price
        uint256 kBefore = keeper.balance;
        _settle(keeper, raidId, ROUND);
        assertEq(keeper.balance - kBefore, 0.00005 ether);
    }

    function test_settle_wrongOrWrongRoundSignature_reverts() public {
        uint256 raidId = _sealAndReveal(ColonyGame.Resource.Sugar, ColonyGame.Resource.None);
        vm.warp(DrandVerifier.roundTime(ROUND) + 60);
        vm.prank(keeper);
        vm.expectRevert(ColonyGame.BadSignature.selector);
        game.settle(raidId, sigOf[ROUND + 1200]); // a real signature, but for a different round

        bytes memory bad = sigOf[ROUND];
        bad[5] = bytes1(uint8(bad[5]) ^ 0x01);
        vm.prank(keeper);
        vm.expectRevert(ColonyGame.BadSignature.selector);
        game.settle(raidId, bad);
    }

    function test_settle_onlyOnce_andNotBeforeRound() public {
        uint256 raidId = _sealAndReveal(ColonyGame.Resource.Sugar, ColonyGame.Resource.None);
        vm.prank(keeper);
        vm.expectRevert(ColonyGame.RoundNotPublished.selector);
        game.settle(raidId, sigOf[ROUND]);
        _settle(keeper, raidId, ROUND);
        vm.prank(keeper);
        vm.expectRevert(ColonyGame.WrongStatus.selector);
        game.settle(raidId, sigOf[ROUND]);
    }

    function test_settle_guardedTarget_raiderAlwaysLoses() public {
        uint256 raidId = _sealAndReveal(ColonyGame.Resource.Sugar, ColonyGame.Resource.Sugar);
        uint256 aLeaves = _leaves(a);
        uint256 aSugar = _sugar(a);
        _settle(keeper, raidId, ROUND);
        (,,,,,, ColonyGame.Outcome outcome,,,) = game.raids(raidId);
        assertEq(uint8(outcome), uint8(ColonyGame.Outcome.Guarded));
        assertEq(_workers(a), 8, "a quarter of the 10 marching ants (2) die");
        assertEq(_colony(b).data.guardWinsPending, 1, "+10 score at next feed");
        assertTrue(_leaves(a) < aLeaves || _sugar(a) < aSugar, "defender took raider stock");
    }

    // ------------------------------------------------------------------ collect: no reveal, 48 h refund, collect-first

    function test_collect_noReveal_soldiersLost() public {
        uint256 raidId = _launch(alice, a, b, ColonyGame.Resource.Sugar);
        vm.expectRevert(ColonyGame.NothingToCollect.selector);
        game.collect(raidId);
        vm.warp(vm.getBlockTimestamp() + 28 hours);
        game.collect(raidId);
        assertEq(_workers(a), 0, "every marching ant is lost");
        assertEq(_colony(a).data.soldiersOut, 0);
        assertEq(_colony(b).data.openIncoming, 0);
    }

    function test_collect_48hRefund_soldiersReturn() public {
        uint256 raidId = _sealAndReveal(ColonyGame.Resource.Sugar, ColonyGame.Resource.None);
        uint256 rt = DrandVerifier.roundTime(ROUND);
        vm.warp(rt + 48 hours - 1);
        vm.expectRevert(ColonyGame.NothingToCollect.selector);
        game.collect(raidId);
        vm.warp(rt + 48 hours);
        vm.prank(keeper);
        vm.expectRevert(ColonyGame.SettleExpired.selector);
        game.settle(raidId, sigOf[ROUND]);
        game.collect(raidId);
        (,,, ColonyGame.RaidStatus st,,,,,,) = game.raids(raidId);
        assertEq(uint8(st), uint8(ColonyGame.RaidStatus.Refunded));
        assertEq(_workers(a), 10, "no soldiers lost");
        assertEq(_colony(a).data.soldiersOut, 0);
    }

    function test_collectFirst_blocksLaunchUntilSettled() public {
        uint256 raidId = _sealAndReveal(ColonyGame.Resource.Sugar, ColonyGame.Resource.None);
        // Past the round and past alice's 12 h raid cooldown, so only the collect-first rule can block her
        vm.warp(DrandVerifier.roundTime(ROUND) + 8 hours);
        uint64 c = _found(carol);

        vm.prank(alice);
        vm.expectRevert(ColonyGame.CollectFirst.selector);
        game.launchRaid(c, bytes32(0), "");

        // Defender is blocked too
        vm.prank(bob);
        vm.expectRevert(ColonyGame.CollectFirst.selector);
        game.launchRaid(c, bytes32(0), "");

        vm.prank(keeper);
        game.settle(raidId, sigOf[ROUND]);
        vm.prank(alice);
        game.launchRaid(c, bytes32(0), "");
    }

    function test_collectFirst_blocksAfterMissedReveal() public {
        uint256 raidId = _launch(alice, a, b, ColonyGame.Resource.Sugar);
        vm.warp(vm.getBlockTimestamp() + 28 hours);
        _feed(alice);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.CollectFirst.selector);
        game.launchRaid(b, bytes32(0), "");
        game.collect(raidId);
        game.setWorkers(a, 10, 2); // the lost soldier took alice below the 10-worker minimum
        vm.prank(alice);
        game.launchRaid(b, bytes32(0), "");
    }

    // ------------------------------------------------------------------ fuzzed odds and loot maths

    function testFuzz_raidMaths(uint256 rand, uint8 guardSel, uint8 targetSel, uint32 soldiers, uint96 dl, uint96 ds)
        public
    {
        ColonyGame.Resource target = targetSel % 2 == 0 ? ColonyGame.Resource.Leaves : ColonyGame.Resource.Sugar;
        ColonyGame.Resource g = ColonyGame.Resource(guardSel % 3);
        soldiers = uint32(bound(soldiers, 1, 10));
        game.setAssigned(a, 10 - soldiers, 0);
        game.setStock(a, uint128(bound(dl, 0, 1e6 * RES)), uint128(bound(ds, 0, 1e6 * RES)));
        game.setStock(b, uint128(bound(ds, 0, 1e6 * RES)), uint128(bound(dl, 0, 1e6 * RES)));

        uint256 raidId = _launch(alice, a, b, target);
        if (g != ColonyGame.Resource.None) {
            vm.prank(bob);
            game.guard(raidId, g);
        }
        vm.warp(vm.getBlockTimestamp() + 4 hours);
        vm.prank(alice);
        game.reveal(raidId, target, _salt(alice, raidId));
        game.setAssigned(a, 0, 0); // stop trail output so the totals below are exact

        uint256 totalL = _leaves(a) + _leaves(b);
        uint256 totalS = _sugar(a) + _sugar(b);
        uint256 dTarget = target == ColonyGame.Resource.Leaves ? _leaves(b) : _sugar(b);
        uint256 wifBefore =
            wif.balanceOf(address(pot)) + wif.balanceOf(address(treasury)) + wif.balanceOf(alice) + wif.balanceOf(bob);

        ColonyGame.Result memory res = game.resolveWith(raidId, rand);

        assertEq(_leaves(a) + _leaves(b), totalL, "leaves conserved");
        assertEq(_sugar(a) + _sugar(b), totalS, "sugar conserved");
        assertEq(
            wif.balanceOf(address(pot)) + wif.balanceOf(address(treasury)) + wif.balanceOf(alice) + wif.balanceOf(bob),
            wifBefore,
            "rolls never move WIF"
        );
        assertEq(_colony(a).data.soldiersOut, 0);
        assertEq(game.getProfile(bob).lockedSugar, 0, "lock released");

        if (g == target) {
            assertEq(uint8(res.outcome), uint8(ColonyGame.Outcome.Guarded), "a right guard always stops the raid");
            assertEq(res.lost, soldiers * 25 / 100, "a quarter of the marching ants");
            assertEq(_workers(a), 10 - soldiers * 25 / 100);
            assertGe(res.roll, 10);
            assertLe(res.roll, 15);
        } else {
            assertEq(uint8(res.outcome), uint8(ColonyGame.Outcome.RaiderWon), "no guard or a wrong guard always wins");
            assertEq(res.lost, 0);
            assertEq(_workers(a), 10);
            uint256 lo = g == ColonyGame.Resource.None ? 30 : 45;
            assertGe(res.roll, lo, "share floor");
            assertLe(res.roll, 60, "share ceiling");
            uint256 cap = uint256(soldiers) * 8 * RES;
            uint256 want = dTarget * res.roll / 100;
            assertEq(res.loot, want < cap ? want : cap, "share of the target, at most 8 per marching ant");
        }
    }

    // ------------------------------------------------------------------ gas

    function test_gas_settle() public {
        uint256 raidId = _sealAndReveal(ColonyGame.Resource.Sugar, ColonyGame.Resource.None);
        vm.warp(DrandVerifier.roundTime(ROUND) + 60);
        bytes memory sig = sigOf[ROUND];
        vm.prank(keeper);
        uint256 g = gasleft();
        game.settle(raidId, sig);
        uint256 used = g - gasleft();
        emit log_named_uint("settle gas", used);
        assertLt(used, 500_000);
    }

    function test_treasuryFloor_pausesRefund() public {
        uint256 raidId = _sealAndReveal(ColonyGame.Resource.Sugar, ColonyGame.Resource.None);
        vm.prank(owner);
        treasury.withdrawEth(payable(owner), address(treasury).balance - 0.0003 ether);
        vm.txGasPrice(0.02 gwei);
        uint256 kBefore = keeper.balance;
        _settle(keeper, raidId, ROUND);
        assertEq(keeper.balance, kBefore, "no refund below floor");
        (,,, ColonyGame.RaidStatus st,,,,,,) = game.raids(raidId);
        assertEq(uint8(st), uint8(ColonyGame.RaidStatus.Settled), "settle still works");
    }
}
