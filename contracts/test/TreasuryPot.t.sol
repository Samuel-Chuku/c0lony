// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {ColonyGame} from "../src/ColonyGame.sol";
import {SeasonPot} from "../src/SeasonPot.sol";
import {Treasury} from "../src/Treasury.sol";

contract TreasuryTest is Base {
    // ------------------------------------------------------------------ founder drip

    function test_drip_oncePerWallet_evenAfterRefounding() public {
        uint256 before = alice.balance;
        uint64 id = _found(alice);
        assertEq(alice.balance - before, 0.00005 ether);
        assertTrue(treasury.dripped(alice));

        // Collapse and refound: no second drip
        vm.warp(vm.getBlockTimestamp() + 97 hours);
        _found(alice);
        assertEq(alice.balance - before, 0.00005 ether);
        assertGt(game.colonyOf(1, alice), id);
    }

    function test_drip_dailyCap25() public {
        for (uint256 i; i < 25; ++i) {
            address p = address(uint160(0x1000 + i));
            wif.mint(p, 1_000 ether);
            vm.prank(p);
            wif.approve(address(game), type(uint256).max);
            _found(p);
            assertEq(p.balance, 0.00005 ether);
        }
        address late = address(0x2000);
        wif.mint(late, 2_000 ether);
        vm.prank(late);
        wif.approve(address(game), type(uint256).max);
        _found(late); // founding still works
        assertEq(late.balance, 0, "26th drip of the day skipped");
        assertFalse(treasury.dripped(late), "can still get a drip another day");

        assertEq(treasury.dripsOnDay(vm.getBlockTimestamp() / 1 days), 25);
    }

    function test_drip_pausesAtFloor() public {
        vm.prank(owner);
        treasury.withdrawEth(payable(owner), 0.002 ether - 0.00034 ether); // leaves 0.00034
        _found(alice);
        assertEq(alice.balance, 0, "0.00034 - 0.00005 < 0.0003 floor");
        assertEq(address(treasury).balance, 0.00034 ether);
    }

    function test_drip_and_refund_onlyGame() public {
        vm.expectRevert(Treasury.NotGame.selector);
        treasury.drip(alice);
        vm.expectRevert(Treasury.NotGame.selector);
        treasury.refundSettle(alice, 100_000);
    }

    function test_refund_usesL1Fee_andCap() public {
        vm.txGasPrice(0.02 gwei);
        _setL1Fee(5_000_000_000);
        vm.prank(address(game));
        uint256 r = treasury.refundSettle(keeper, 100_000);
        assertEq(r, 100_000 * 0.02 gwei + 5_000_000_000);
        assertEq(keeper.balance, r);

        vm.txGasPrice(1 gwei);
        vm.prank(address(game));
        r = treasury.refundSettle(keeper, 1_000_000);
        assertEq(r, 0.00005 ether, "capped");
    }

    function test_refund_missingPrecompile_fallsBackToZeroL1Fee() public {
        vm.etch(ARB_GAS_INFO, "");
        vm.txGasPrice(0.02 gwei);
        vm.prank(address(game));
        uint256 r = treasury.refundSettle(keeper, 100_000);
        assertEq(r, 100_000 * 0.02 gwei);
    }

    // ------------------------------------------------------------------ owner and sweep

    function test_owner_withdrawals_emit_and_onlyOwner() public {
        _found(alice); // 100 WIF to treasury
        vm.expectEmit(address(treasury));
        emit Treasury.WifWithdrawn(owner, 40 ether);
        vm.prank(owner);
        treasury.withdrawWif(owner, 40 ether);

        vm.expectEmit(address(treasury));
        emit Treasury.EthWithdrawn(owner, 0.001 ether);
        vm.prank(owner);
        treasury.withdrawEth(payable(owner), 0.001 ether);

        vm.prank(alice);
        vm.expectRevert();
        treasury.withdrawWif(alice, 1);
        vm.prank(alice);
        vm.expectRevert();
        treasury.withdrawEth(payable(alice), 1);
    }

    function test_sweep_movesExcessAboveReserve_toNextSeason() public {
        _found(alice); // treasury: 100 WIF
        _found(bob); // treasury: 200 WIF
        vm.prank(owner);
        treasury.setWifReserve(50 ether);

        vm.prank(carol); // anyone
        uint256 swept = treasury.sweepToPot();
        assertEq(swept, 150 ether);
        assertEq(wif.balanceOf(address(treasury)), 50 ether);
        (uint256 s2,,,,,,,,,,,,) = pot.seasons(2);
        assertEq(s2, 150 ether, "goes to next season's pot");

        vm.expectRevert(Treasury.NothingToSweep.selector);
        treasury.sweepToPot();
    }

    function test_receive_acceptsSwapFeeEth() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(treasury).call{value: 0.01 ether}("");
        assertTrue(ok);
    }
}

contract SeasonPotTest is Base {
    // ------------------------------------------------------------------ sponsor deposits

    function test_sponsor_currentAndFutureSeasons() public {
        vm.expectEmit(address(pot));
        emit SeasonPot.Sponsored(1, carol, 20_000 ether, "World is Flat");
        vm.prank(carol);
        pot.sponsor(1, 20_000 ether, "World is Flat");
        vm.prank(carol);
        pot.sponsor(3, 5 ether, "");
        (uint256 s1,,,,,,,,,,,,) = pot.seasons(1);
        (uint256 s3,,,,,,,,,,,,) = pot.seasons(3);
        assertEq(s1, 20_000 ether);
        assertEq(s3, 5 ether);
        assertEq(wif.balanceOf(address(pot)), 20_005 ether);
    }

    function test_sponsor_rejectsPastEndedFarFutureAndLongNames() public {
        vm.warp(game.seasonEnd(1));
        pot.endSeason(1);
        vm.startPrank(carol);
        vm.expectRevert(SeasonPot.SeasonNotOpen.selector);
        pot.sponsor(1, 1 ether, "");
        vm.expectRevert(SeasonPot.SeasonNotOpen.selector);
        pot.sponsor(2 + 53, 1 ether, "");
        vm.expectRevert(SeasonPot.NameTooLong.selector);
        pot.sponsor(2, 1 ether, string(new bytes(65)));
        vm.expectRevert(SeasonPot.ZeroAmount.selector);
        pot.sponsor(2, 0, "");
        vm.stopPrank();
    }

    function test_addFromGame_onlyGame() public {
        vm.expectRevert(SeasonPot.NotGame.selector);
        pot.addFromGame(1, 1 ether);
    }

    function test_setGame_onlyOnce() public {
        vm.expectRevert(SeasonPot.GameAlreadySet.selector);
        pot.setGame(game);
    }

    // ------------------------------------------------------------------ qualification and ranking

    /// @dev alice: fed twice, alive at end (qualifies). bob: fed once. carol: fed twice, then starved.
    function _seasonWithThree() internal returns (uint64 a, uint64 b, uint64 c) {
        a = _found(alice);
        b = _found(bob);
        c = _found(carol);
        game.setStock(a, uint128(100 * RES), uint128(1_000 * RES));
        game.setStock(c, uint128(100 * RES), uint128(1_000 * RES));
        _feed(alice);
        _feed(bob);
        _feed(carol);
        vm.warp(T0 + 1 days);
        _feed(alice);
        _feed(carol);
        // Carol stops feeding; alice keeps her queen fed through to the end.
        vm.warp(T0 + 3 days);
        _feed(alice);
        vm.warp(T0 + 5 days);
        _feed(alice);
        vm.warp(game.seasonEnd(1));
    }

    function test_qualification_aliveAndFedTwice() public {
        (uint64 a, uint64 b, uint64 c) = _seasonWithThree();
        (,, bool fa, bool qa) = game.colonyResult(a);
        (,, bool fb, bool qb) = game.colonyResult(b);
        (,, bool fc, bool qc) = game.colonyResult(c);
        assertTrue(fa && qa, "alice qualifies");
        assertFalse(fb || qb, "bob fed only once");
        assertTrue(fc && !qc, "carol fed twice but queen not fed within 72 h of end");
        assertEq(game.fedTwiceCount(1), 2);
    }

    function test_endSeason_onlyAfterEnd_andRankingVerifiesOrder() public {
        (uint64 a,, uint64 c) = _seasonWithThree();
        vm.warp(vm.getBlockTimestamp() - 1);
        vm.expectRevert(SeasonPot.SeasonNotOver.selector);
        pot.endSeason(1);
        vm.warp(vm.getBlockTimestamp() + 1);
        pot.endSeason(1);

        // Non-qualifying first: wrong order
        uint64[] memory bad = new uint64[](2);
        bad[0] = c;
        bad[1] = a;
        vm.expectRevert(abi.encodeWithSelector(SeasonPot.BadOrder.selector, a));
        pot.submitRanking(1, bad);

        // Duplicate entry
        uint64[] memory dup = new uint64[](2);
        dup[0] = a;
        dup[1] = a;
        vm.expectRevert(abi.encodeWithSelector(SeasonPot.BadOrder.selector, a));
        pot.submitRanking(1, dup);

        // Bob (fed once) cannot be submitted
        uint64[] memory notFed = new uint64[](1);
        notFed[0] = 2;
        vm.expectRevert(abi.encodeWithSelector(SeasonPot.NotFedTwice.selector, uint64(2)));
        pot.submitRanking(1, notFed);

        // Correct order, in two batches
        uint64[] memory one = new uint64[](1);
        one[0] = a;
        pot.submitRanking(1, one);
        (,,,,,,,,,, bool ended, bool finalized,) = pot.seasons(1);
        assertTrue(ended && !finalized, "not final until every fed-twice colony is in");
        one[0] = c;
        pot.submitRanking(1, one);
        (,,,,,,,,,,, finalized,) = pot.seasons(1);
        assertTrue(finalized);
        assertEq(pot.rankOf(1, a), 1);
        assertEq(pot.rankOf(1, c), 0);
    }

    function test_claim_paysWholePotToSoleQualifier() public {
        vm.prank(carol);
        pot.sponsor(1, 10_000 ether, "seed");
        (uint64 a,, uint64 c) = _seasonWithThree();
        pot.endSeason(1);
        uint64[] memory ids = new uint64[](2);
        ids[0] = a;
        ids[1] = c;
        pot.submitRanking(1, ids);

        (uint256 total,,,,,,,,,,,,) = pot.seasons(1);
        uint256 before = wif.balanceOf(alice);
        vm.prank(alice);
        uint256 got = pot.claim(1);
        assertEq(got, total, "sole qualifier is also the whole top 25%");
        assertEq(wif.balanceOf(alice) - before, total);

        vm.prank(alice);
        vm.expectRevert(SeasonPot.AlreadyClaimed.selector);
        pot.claim(1);
        vm.prank(carol);
        vm.expectRevert(SeasonPot.NothingToClaim.selector);
        pot.claim(1);
    }

    function test_payout_splitHalfAll_halfTop25() public {
        // Five qualifying colonies with different scores
        address[5] memory ps = [alice, bob, carol, keeper, makeAddr("eve")];
        wif.mint(ps[4], 1_000_000 ether);
        vm.prank(ps[4]);
        wif.approve(address(game), type(uint256).max);
        uint64[5] memory ids;
        for (uint256 i; i < 5; ++i) {
            ids[i] = _found(ps[i]);
            game.setWorkers(ids[i], uint32(10 + 10 * i), uint32(2 + 2 * i));
            game.setStock(ids[i], uint128(100 * RES), uint128(1_000 * RES));
        }
        for (uint256 d; d <= 6; d += 2) {
            vm.warp(T0 + d * 1 days); // feeds on days 0, 2, 4, 6: never 72 h unfed
            for (uint256 i; i < 5; ++i) {
                _feed(ps[i]);
            }
        }
        vm.warp(game.seasonEnd(1));
        pot.endSeason(1);

        // Highest score first: eve (4) ... alice (0)
        uint64[] memory order = new uint64[](5);
        for (uint256 i; i < 5; ++i) {
            order[i] = ids[4 - i];
        }
        pot.submitRanking(1, order);

        (uint256 total,,,,,,,, uint32 topCount,,,,) = pot.seasons(1);
        assertEq(topCount, 2, "top 25% of 5, rounded up");

        uint256 paid;
        uint256 sumAll;
        uint256 sumTop;
        for (uint256 i; i < 5; ++i) {
            (, uint256 sc,,) = game.colonyResult(ids[i]);
            sumAll += sc;
            if (i >= 3) sumTop += sc;
        }
        for (uint256 i; i < 5; ++i) {
            (, uint256 sc,,) = game.colonyResult(ids[i]);
            uint256 expected = (total / 2) * sc / sumAll + (i >= 3 ? (total - total / 2) * sc / sumTop : 0);
            vm.prank(ps[i]);
            uint256 got = pot.claim(1);
            assertEq(got, expected);
            paid += got;
        }
        assertLe(paid, total, "never pays more than the pot");
        assertLt(total - paid, 10, "only rounding dust left");
    }

    function test_rollUnclaimed_after30Days_toCurrentSeason() public {
        vm.prank(carol);
        pot.sponsor(1, 1_000 ether, "");
        _seasonWithThree();
        pot.endSeason(1);
        uint64[] memory ids = new uint64[](2);
        ids[0] = 1;
        ids[1] = 3;
        pot.submitRanking(1, ids);
        (uint256 total,,,,,,,,,,,,) = pot.seasons(1);

        vm.expectRevert(SeasonPot.ClaimPeriodActive.selector);
        pot.rollUnclaimed(1);
        vm.warp(vm.getBlockTimestamp() + 30 days);
        uint32 cur = game.currentSeason();
        (uint256 before,,,,,,,,,,,,) = pot.seasons(cur);
        pot.rollUnclaimed(1);
        (uint256 afterRoll,,,,,,,,,,,,) = pot.seasons(cur);
        assertEq(afterRoll - before, total);

        vm.prank(alice);
        vm.expectRevert(SeasonPot.AlreadyRolled.selector);
        pot.claim(1);
    }

    function test_emptySeason_finalizesImmediately() public {
        vm.warp(game.seasonEnd(1));
        pot.endSeason(1);
        (,,,,,,,,,,, bool finalized,) = pot.seasons(1);
        assertTrue(finalized);
    }
}
