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

    function test_launch_locksSoldiers_andEmits() public {
        uint256 raidId = game.nextRaidId(a);
        bytes32 c = game.commitmentFor(ColonyGame.Resource.Sugar, _salt(alice, raidId), raidId);
        vm.expectEmit(address(game));
        emit ColonyGame.RaidLaunched(raidId, a, b, alice, bob, 3, uint64(vm.getBlockTimestamp() + 4 hours), false);
        vm.prank(alice);
        game.launchRaid(b, 3, c);
        assertEq(_colony(a).data.soldiersOut, 3);
        assertEq(_colony(a).idle, 7);
    }

    function test_launch_soldierLimit30pctOfIdle() public {
        bytes32 c = bytes32(uint256(1));
        vm.prank(alice);
        vm.expectRevert(ColonyGame.BadSoldiers.selector);
        game.launchRaid(b, 4, c); // 30% of 10 idle = 3
        vm.prank(alice);
        vm.expectRevert(ColonyGame.BadSoldiers.selector);
        game.launchRaid(b, 0, c);
    }

    function test_launch_rangeAndMinimumWorkers() public {
        game.setWorkers(b, 21, 10); // more than double alice's 10
        vm.prank(alice);
        vm.expectRevert(ColonyGame.OutOfRange.selector);
        game.launchRaid(b, 1, bytes32(0));

        game.setWorkers(b, 20, 10); // exactly double is fine
        vm.prank(alice);
        game.launchRaid(b, 1, bytes32(0));

        game.setWorkers(a, 9, 2);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.TooFewWorkers.selector);
        game.launchRaid(b, 1, bytes32(0));
    }

    function test_launch_cooldownAndSelf() public {
        vm.prank(alice);
        vm.expectRevert(ColonyGame.CannotRaidSelf.selector);
        game.launchRaid(a, 1, bytes32(0));
        vm.prank(alice);
        game.launchRaid(b, 1, bytes32(0));
        vm.warp(vm.getBlockTimestamp() + 6 hours - 1);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.NotReady.selector);
        game.launchRaid(b, 1, bytes32(0));
    }

    function test_launch_targetMaxTwoOpenRaids() public {
        _found(carol);
        _found(keeper);
        vm.prank(alice);
        game.launchRaid(b, 1, bytes32(0));
        vm.prank(carol);
        game.launchRaid(b, 1, bytes32(0));
        vm.prank(keeper);
        vm.expectRevert(ColonyGame.TargetBusy.selector);
        game.launchRaid(b, 1, bytes32(0));
    }

    // ------------------------------------------------------------------ guard, reveal, commitment, round

    function test_guard_onlyDefender_onlyOnce_onlyInWindow() public {
        uint256 raidId = _launch(alice, a, b, 3, ColonyGame.Resource.Sugar);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.NotDefender.selector);
        game.guard(raidId, ColonyGame.Resource.Sugar);
        vm.prank(bob);
        game.guard(raidId, ColonyGame.Resource.Leaves);
        vm.prank(bob);
        vm.expectRevert(ColonyGame.AlreadyGuarded.selector);
        game.guard(raidId, ColonyGame.Resource.Sugar);

        uint256 r2 = _launch(carol, _found(carol), b, 1, ColonyGame.Resource.Sugar);
        vm.warp(vm.getBlockTimestamp() + 4 hours);
        vm.prank(bob);
        vm.expectRevert(ColonyGame.GuardWindowClosed.selector);
        game.guard(r2, ColonyGame.Resource.Sugar);
    }

    function test_reveal_commitmentMismatch_reverts() public {
        uint256 raidId = _launch(alice, a, b, 3, ColonyGame.Resource.Sugar);
        vm.warp(vm.getBlockTimestamp() + 4 hours);
        vm.startPrank(alice);
        vm.expectRevert(ColonyGame.BadCommitment.selector);
        game.reveal(raidId, ColonyGame.Resource.Leaves, _salt(alice, raidId)); // wrong target
        vm.expectRevert(ColonyGame.BadCommitment.selector);
        game.reveal(raidId, ColonyGame.Resource.Sugar, bytes32(uint256(123))); // wrong salt
        vm.stopPrank();
    }

    function test_reveal_notDuringGuardWindow_notAfterRevealWindow() public {
        uint256 raidId = _launch(alice, a, b, 3, ColonyGame.Resource.Sugar);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.GuardWindowOpen.selector);
        game.reveal(raidId, ColonyGame.Resource.Sugar, _salt(alice, raidId));
        vm.warp(vm.getBlockTimestamp() + 28 hours);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.RevealWindowClosed.selector);
        game.reveal(raidId, ColonyGame.Resource.Sugar, _salt(alice, raidId));
    }

    function test_reveal_assignsFirstRoundAtLeast30sLater() public {
        uint256 raidId = _launch(alice, a, b, 3, ColonyGame.Resource.Sugar);
        vm.warp(vm.getBlockTimestamp() + 4 hours + 17);
        uint256 t = vm.getBlockTimestamp();
        vm.prank(alice);
        game.reveal(raidId, ColonyGame.Resource.Sugar, _salt(alice, raidId));
        (,,,,,,,, uint64 round,) = game.raids(raidId);
        assertGe(DrandVerifier.roundTime(round), t + 30, "at least 30 s later");
        assertLt(DrandVerifier.roundTime(round - 1), t + 30, "first such round");
    }

    function testFuzz_roundAssignment(uint32 offset) public {
        uint256 raidId = _launch(alice, a, b, 3, ColonyGame.Resource.Leaves);
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
        raidId = _launch(alice, a, b, 3, target);
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
        assertTrue(outcome == ColonyGame.Outcome.RaiderWon || outcome == ColonyGame.Outcome.RaiderLost);
        uint256 refund = keeper.balance - kBefore;
        assertGt(refund, 1_000_000_000, "refund includes execution gas and L1 fee");
        assertLe(refund, 0.00005 ether, "capped");
        assertEq(trBefore - address(treasury).balance, refund);
        assertEq(_colony(a).data.soldiersOut, 0, "soldiers released");

        // Roll is keccak256(signature, raidId)
        uint256 rand = uint256(keccak256(abi.encodePacked(sigOf[ROUND], raidId)));
        uint256 roll = rand % 100 + 1;
        assertEq(outcome == ColonyGame.Outcome.RaiderWon, roll <= 65, "unguarded odds 65");
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
        assertEq(_workers(a), 9, "half of 3 soldiers (1) die");
        assertEq(_colony(b).data.guardWinsPending, 1, "+10 score at next feed");
        assertTrue(_leaves(a) < aLeaves || _sugar(a) < aSugar, "defender took raider stock");
    }

    // ------------------------------------------------------------------ collect: no reveal, 48 h refund, collect-first

    function test_collect_noReveal_soldiersLost() public {
        uint256 raidId = _launch(alice, a, b, 3, ColonyGame.Resource.Sugar);
        vm.expectRevert(ColonyGame.NothingToCollect.selector);
        game.collect(raidId);
        vm.warp(vm.getBlockTimestamp() + 28 hours);
        game.collect(raidId);
        assertEq(_workers(a), 7);
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
        // Past the round and past alice's 6 h raid cooldown, so only the collect-first rule can block her
        vm.warp(DrandVerifier.roundTime(ROUND) + 3 hours);
        uint64 c = _found(carol);

        vm.prank(alice);
        vm.expectRevert(ColonyGame.CollectFirst.selector);
        game.launchRaid(c, 1, bytes32(0));

        // Defender is blocked too
        vm.prank(bob);
        vm.expectRevert(ColonyGame.CollectFirst.selector);
        game.launchRaid(c, 1, bytes32(0));

        vm.prank(keeper);
        game.settle(raidId, sigOf[ROUND]);
        vm.prank(alice);
        game.launchRaid(c, 1, bytes32(0));
    }

    function test_collectFirst_blocksAfterMissedReveal() public {
        uint256 raidId = _launch(alice, a, b, 1, ColonyGame.Resource.Sugar);
        vm.warp(vm.getBlockTimestamp() + 28 hours);
        _feed(alice);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.CollectFirst.selector);
        game.launchRaid(b, 1, bytes32(0));
        game.collect(raidId);
        game.setWorkers(a, 10, 2); // the lost soldier took alice below the 10-worker minimum
        vm.prank(alice);
        game.launchRaid(b, 1, bytes32(0));
    }

    // ------------------------------------------------------------------ fuzzed odds and loot maths

    function testFuzz_raidMaths(uint256 rand, uint8 guardSel, uint8 targetSel, uint32 soldiers, uint96 dl, uint96 ds)
        public
    {
        ColonyGame.Resource target = targetSel % 2 == 0 ? ColonyGame.Resource.Leaves : ColonyGame.Resource.Sugar;
        ColonyGame.Resource g = ColonyGame.Resource(guardSel % 3);
        soldiers = uint32(bound(soldiers, 1, 3));
        game.setStock(a, uint128(bound(dl, 0, 1e6 * RES)), uint128(bound(ds, 0, 1e6 * RES)));
        game.setStock(b, uint128(bound(ds, 0, 1e6 * RES)), uint128(bound(dl, 0, 1e6 * RES)));

        uint256 raidId = _launch(alice, a, b, soldiers, target);
        if (g != ColonyGame.Resource.None) {
            vm.prank(bob);
            game.guard(raidId, g);
        }
        vm.warp(vm.getBlockTimestamp() + 4 hours);
        vm.prank(alice);
        game.reveal(raidId, target, _salt(alice, raidId));

        uint256 totalL = _leaves(a) + _leaves(b);
        uint256 totalS = _sugar(a) + _sugar(b);
        uint256 dTarget = target == ColonyGame.Resource.Leaves ? _leaves(b) : _sugar(b);
        uint256 wifBefore =
            wif.balanceOf(address(pot)) + wif.balanceOf(address(treasury)) + wif.balanceOf(alice) + wif.balanceOf(bob);

        ColonyGame.Result memory res = game.resolveWith(raidId, rand);

        assertGe(res.roll, 1);
        assertLe(res.roll, 100);
        assertEq(_leaves(a) + _leaves(b), totalL, "leaves conserved");
        assertEq(_sugar(a) + _sugar(b), totalS, "sugar conserved");
        assertEq(
            wif.balanceOf(address(pot)) + wif.balanceOf(address(treasury)) + wif.balanceOf(alice) + wif.balanceOf(bob),
            wifBefore,
            "rolls never move WIF"
        );
        assertEq(_colony(a).data.soldiersOut, 0);

        if (g == target) {
            assertEq(uint8(res.outcome), uint8(ColonyGame.Outcome.Guarded), "guarded target always loses");
            assertEq(res.lost, soldiers / 2);
            assertEq(_workers(a), 10 - soldiers / 2);
        } else {
            uint256 odds = g == ColonyGame.Resource.None ? 65 : 75;
            assertEq(res.outcome == ColonyGame.Outcome.RaiderWon, res.roll <= odds);
            assertEq(res.lost, 0);
            assertEq(_workers(a), 10);
            if (res.outcome == ColonyGame.Outcome.RaiderWon) {
                assertLe(res.loot, dTarget * 30 / 100, "at most 30%");
                assertLe(res.loot, uint256(soldiers) * 5 * RES, "at most 5 per soldier");
                uint256 floor20 = dTarget * 20 / 100;
                uint256 cap = uint256(soldiers) * 5 * RES;
                assertGe(res.loot, floor20 < cap ? floor20 : cap, "at least 20% unless capped");
            } else {
                assertEq(res.loot, 0);
            }
        }
    }

    function testFuzz_winRateMatchesOdds(uint256 seed) public pure {
        // Over 1,000 consecutive rolls the observed win rate stays near 65%.
        uint256 wins;
        for (uint256 i; i < 1000; ++i) {
            uint256 rand = uint256(keccak256(abi.encode(seed, i)));
            if (rand % 100 + 1 <= 65) ++wins;
        }
        assertGt(wins, 580);
        assertLt(wins, 720);
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
