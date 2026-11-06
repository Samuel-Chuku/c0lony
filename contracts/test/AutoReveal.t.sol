// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {Base} from "./Base.t.sol";
import {ColonyGame} from "../src/ColonyGame.sol";

/// Set-and-forget raids: the raider posts the target and salt timelocked to a drand quicknet round, and anyone
/// (the keeper, in practice) reveals once that round opens it. The commitment still decides what counts.
contract AutoRevealTest is Base {
    uint64 internal a;
    uint64 internal b;
    bytes internal constant SEALED = hex"6167652d656e6372797074696f6e2e6f72672f7631"; // stand-in ciphertext

    function setUp() public override {
        super.setUp();
        a = _found(alice);
        b = _found(bob);
        game.setStock(a, uint128(100 * RES), uint128(100 * RES));
        game.setStock(b, uint128(100 * RES), uint128(100 * RES));
    }

    function _launchSealed(bytes memory sealedTarget) internal returns (uint256 raidId) {
        raidId = game.nextRaidId(a);
        bytes32 c = game.commitmentFor(ColonyGame.Resource.Sugar, _salt(alice, raidId), raidId);
        vm.prank(alice);
        game.launchRaid(b, c, sealedTarget);
    }

    function test_launch_withSealedTarget_emitsIt() public {
        uint256 raidId = game.nextRaidId(a);
        vm.expectEmit(address(game));
        emit ColonyGame.RaidSealed(raidId, SEALED);
        _launchSealed(SEALED);
    }

    function test_launch_withoutSealedTarget_emitsNothingExtra() public {
        vm.recordLogs();
        _launchSealed("");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) {
            assertTrue(logs[i].topics[0] != ColonyGame.RaidSealed.selector, "no RaidSealed for a manual raid");
        }
    }

    function test_launch_sealedTargetTooLong_reverts() public {
        bytes memory big = new bytes(game.MAX_SEALED_BYTES() + 1);
        uint256 raidId = game.nextRaidId(a);
        bytes32 c = game.commitmentFor(ColonyGame.Resource.Sugar, _salt(alice, raidId), raidId);
        vm.prank(alice);
        vm.expectRevert(ColonyGame.SealedTooLong.selector);
        game.launchRaid(b, c, big);
    }

    function test_anyoneCanReveal_withTheRightTargetAndSalt() public {
        uint256 raidId = _launchSealed(SEALED);
        vm.warp(vm.getBlockTimestamp() + 4 hours);
        vm.prank(keeper);
        game.reveal(raidId, ColonyGame.Resource.Sugar, _salt(alice, raidId));
        (,,, ColonyGame.RaidStatus status,, ColonyGame.Resource target,,,,) = game.raids(raidId);
        assertEq(uint8(status), uint8(ColonyGame.RaidStatus.Revealed));
        assertEq(uint8(target), uint8(ColonyGame.Resource.Sugar));
    }

    function test_strangerCannotRevealAWrongTarget() public {
        uint256 raidId = _launchSealed(SEALED);
        vm.warp(vm.getBlockTimestamp() + 4 hours);
        vm.startPrank(keeper);
        vm.expectRevert(ColonyGame.BadCommitment.selector);
        game.reveal(raidId, ColonyGame.Resource.Leaves, _salt(alice, raidId));
        vm.expectRevert(ColonyGame.BadCommitment.selector);
        game.reveal(raidId, ColonyGame.Resource.Sugar, bytes32(uint256(7)));
        vm.stopPrank();
    }

    function test_noOneCanRevealDuringTheGuardWindow() public {
        uint256 raidId = _launchSealed(SEALED);
        vm.warp(vm.getBlockTimestamp() + 4 hours - 1);
        vm.prank(keeper);
        vm.expectRevert(ColonyGame.GuardWindowOpen.selector);
        game.reveal(raidId, ColonyGame.Resource.Sugar, _salt(alice, raidId));
    }

    function test_raiderCanStillRevealByHand() public {
        uint256 raidId = _launchSealed(SEALED);
        vm.warp(vm.getBlockTimestamp() + 4 hours);
        vm.prank(alice);
        game.reveal(raidId, ColonyGame.Resource.Sugar, _salt(alice, raidId));
    }

    function test_revealTwiceReverts_soKeeperAndRaiderCannotDoubleUp() public {
        uint256 raidId = _launchSealed(SEALED);
        vm.warp(vm.getBlockTimestamp() + 4 hours);
        vm.prank(alice);
        game.reveal(raidId, ColonyGame.Resource.Sugar, _salt(alice, raidId));
        vm.prank(keeper);
        vm.expectRevert(ColonyGame.WrongStatus.selector);
        game.reveal(raidId, ColonyGame.Resource.Sugar, _salt(alice, raidId));
    }

    function test_avenge_withSealedTarget_emitsIt() public {
        // Alice wins a raid on Bob, which grants Bob an avenge.
        uint256 first = _launchSealed("");
        vm.warp(vm.getBlockTimestamp() + 4 hours);
        vm.prank(alice);
        game.reveal(first, ColonyGame.Resource.Sugar, _salt(alice, first));
        game.resolveWith(first, 0);

        uint256 raidId = game.nextRaidId(b);
        bytes32 c = game.commitmentFor(ColonyGame.Resource.Leaves, _salt(bob, raidId), raidId);
        vm.expectEmit(address(game));
        emit ColonyGame.RaidSealed(raidId, SEALED);
        vm.prank(bob);
        game.avenge(alice, c, SEALED);
    }
}
