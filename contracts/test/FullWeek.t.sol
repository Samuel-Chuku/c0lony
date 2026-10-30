// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {ColonyGame} from "../src/ColonyGame.sol";
import {DrandVerifier} from "../src/DrandVerifier.sol";

/// @notice A full simulated season: found, tend, feed, build, raid, guard, reveal, settle with real
///         drand evmnet rounds (checking the keeper's refund), end the season, rank and claim.
contract FullWeekTest is Base {
    uint64 internal a;
    uint64 internal b;
    uint64 internal c;
    uint256 internal constant ROUNDS_PER_DAY = 28_800;

    function _tendAll(uint256 at) internal {
        vm.warp(at);
        vm.prank(alice);
        game.tend();
        vm.prank(bob);
        game.tend();
        if (game.getColony(c).status == ColonyGame.Status.Alive) {
            vm.prank(carol);
            game.tend();
        }
    }

    function _day(uint256 d) internal view returns (uint256) {
        return T0 + d * 1 days;
    }

    function _raidAndSettle(
        address raider,
        uint64 raiderId,
        address defender,
        uint64 defenderId,
        ColonyGame.Resource target,
        ColonyGame.Resource guardWith,
        uint64 round
    ) internal returns (ColonyGame.Outcome outcome) {
        vm.warp(DrandVerifier.roundTime(round) - 30 - 4 hours - 5 minutes);
        uint256 raidId = _launch(raider, raiderId, defenderId, 3, target);
        if (guardWith != ColonyGame.Resource.None) {
            vm.prank(defender);
            game.guard(raidId, guardWith);
        }
        _revealAtRound(raider, raidId, target, round);
        (,,,,,,,, uint64 assigned,) = game.raids(raidId);
        assertEq(assigned, round, "assigned the expected drand round");

        // The keeper settles a minute after the round; the treasury refunds its gas.
        vm.txGasPrice(0.02 gwei);
        _setL1Fee(1_500_000_000);
        uint256 kBefore = keeper.balance;
        uint256 tBefore = address(treasury).balance;
        _settle(keeper, raidId, round);
        uint256 refund = keeper.balance - kBefore;
        assertGt(refund, 0, "keeper refunded");
        assertLe(refund, 0.00005 ether, "refund capped");
        assertEq(tBefore - address(treasury).balance, refund);
        (,,,,,, outcome,,,) = game.raids(raidId);
    }

    function test_fullWeek() public {
        // Season 1 seed: ~10 USD of WIF through sponsor()
        vm.prank(carol);
        pot.sponsor(1, 8_600 ether, "Season 1 seed");

        // Day 0: three colonies founded; each wallet gets the founder drip
        a = _found(alice);
        b = _found(bob);
        c = _found(carol);
        assertEq(alice.balance, 0.00005 ether);

        for (uint256 d; d < 7; ++d) {
            // Four check-ins a day: hand forages every 6 h (leaves) and 3 h (sugar)
            _tendAll(_day(d));
            vm.prank(alice);
            game.feedQueen();
            vm.prank(bob);
            game.feedQueen();
            if (d < 2) {
                vm.prank(carol); // carol stops feeding after day 1
                game.feedQueen();
            }
            // Raids happen mid-morning; each day's fixture round is published at day start + 6 h.
            if (d == 1) {
                vm.prank(alice);
                game.digChamber();
                // Alice raids bob's sugar; bob guards leaves (wrong guess). Real round from day 1.
                _raidAndSettle(
                    alice,
                    a,
                    bob,
                    b,
                    ColonyGame.Resource.Sugar,
                    ColonyGame.Resource.Leaves,
                    ROUND_DAY0 + uint64(ROUNDS_PER_DAY)
                );
            }
            if (d == 2) {
                vm.prank(bob);
                game.digChamber();
                // Bob raids alice's leaves; alice guards leaves (correct): bob always loses.
                ColonyGame.Outcome o = _raidAndSettle(
                    bob,
                    b,
                    alice,
                    a,
                    ColonyGame.Resource.Leaves,
                    ColonyGame.Resource.Leaves,
                    ROUND_DAY0 + uint64(2 * ROUNDS_PER_DAY)
                );
                assertEq(uint8(o), uint8(ColonyGame.Outcome.Guarded));
            }
            if (d == 4) {
                // Unguarded raid, settled with the day-4 round
                _raidAndSettle(
                    alice,
                    a,
                    bob,
                    b,
                    ColonyGame.Resource.Leaves,
                    ColonyGame.Resource.None,
                    ROUND_DAY0 + uint64(4 * ROUNDS_PER_DAY)
                );
            }
            _tendAll(_day(d) + 6 hours + 10 minutes);
            _tendAll(_day(d) + 12 hours);
            _tendAll(_day(d) + 18 hours);
        }

        // Season ends
        vm.warp(game.seasonEnd(1));
        pot.endSeason(1);
        (,, bool fa, bool qa) = game.colonyResult(a);
        (,, bool fb, bool qb) = game.colonyResult(b);
        (,, bool fc, bool qc) = game.colonyResult(c);
        assertTrue(fa && qa && fb && qb, "alice and bob qualify");
        assertTrue(fc && !qc, "carol's queen starved");

        // Keeper submits the ranking: qualifying by score desc (tie: lower id), then the rest by id
        (, uint256 sa,,) = game.colonyResult(a);
        (, uint256 sb,,) = game.colonyResult(b);
        uint64[] memory order = new uint64[](3);
        if (sa > sb || (sa == sb && a < b)) {
            order[0] = a;
            order[1] = b;
        } else {
            order[0] = b;
            order[1] = a;
        }
        order[2] = c;
        vm.prank(keeper);
        pot.submitRanking(1, order);

        // Claims: top colony gets half by score plus the whole top-25% half
        (uint256 total,,,,,,,,,,,,) = pot.seasons(1);
        uint256 potBalBefore = wif.balanceOf(address(pot));
        vm.prank(alice);
        uint256 ca = pot.claim(1);
        vm.prank(bob);
        uint256 cb = pot.claim(1);
        assertEq(potBalBefore - wif.balanceOf(address(pot)), ca + cb);
        assertLe(ca + cb, total);
        assertLt(total - ca - cb, 10, "only rounding dust left");
        uint256 top = order[0] == a ? ca : cb;
        uint256 second = order[0] == a ? cb : ca;
        assertGt(top, second, "top 25% earns more");

        vm.prank(carol);
        vm.expectRevert();
        pot.claim(1);

        // Next season: everyone founds fresh
        assertEq(game.currentSeason(), 2);
        uint64 a2 = _found(alice);
        assertEq(game.getColony(a2).data.workers, 10);
        assertEq(alice.balance, 0.00005 ether, "no second drip");
    }
}
