// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {ColonyGame} from "../src/ColonyGame.sol";

/// @notice Voter's Pass: 20% off founding and feeding for World is Fair voters, proven once with a Merkle proof.
contract VoterPassTest is Base {
    // Four voters; carol is NOT on the list.
    address internal dave = makeAddr("dave");
    address internal erin = makeAddr("erin");
    bytes32 internal root;
    bytes32[4] internal leaves;
    bytes32 internal n01;
    bytes32 internal n23;

    function _leaf(address a) internal pure returns (bytes32) {
        // OpenZeppelin StandardMerkleTree leaf for a single `address` value
        return keccak256(bytes.concat(keccak256(abi.encode(a))));
    }

    function _hashPair(bytes32 x, bytes32 y) internal pure returns (bytes32) {
        return x < y ? keccak256(abi.encode(x, y)) : keccak256(abi.encode(y, x));
    }

    function setUp() public override {
        super.setUp();
        leaves = [_leaf(alice), _leaf(bob), _leaf(dave), _leaf(erin)];
        n01 = _hashPair(leaves[0], leaves[1]);
        n23 = _hashPair(leaves[2], leaves[3]);
        root = _hashPair(n01, n23);
        vm.prank(owner);
        game.setVoterRoot(root, "ipfs://voters-v1");
    }

    function _proof(uint256 i) internal view returns (bytes32[] memory p) {
        p = new bytes32[](2);
        p[0] = leaves[i ^ 1];
        p[1] = i < 2 ? n23 : n01;
    }

    function _paidBy(address who, function() internal action) internal returns (uint256) {
        uint256 before = wif.balanceOf(who);
        action();
        return before - wif.balanceOf(who);
    }

    // ------------------------------------------------------------------ discount and pass

    function test_validProof_discountsFounding_andSetsPass() public {
        assertFalse(game.hasVoterPass(alice));
        uint256 before = wif.balanceOf(alice);
        vm.expectEmit(address(game));
        emit ColonyGame.VoterPassGranted(alice);
        vm.prank(alice);
        game.foundColony(_proof(0));
        assertEq(before - wif.balanceOf(alice), 1_200 ether, "1,500 - 20%");
        assertTrue(game.hasVoterPass(alice));
    }

    function test_passPersists_noProofNeededLater() public {
        vm.prank(alice);
        game.foundColony(_proof(0));
        uint256 before = wif.balanceOf(alice);
        _feed(alice); // empty proof
        assertEq(before - wif.balanceOf(alice), 80 ether, "100 - 20%");

        // Still applies after the root changes to a list without alice
        vm.prank(owner);
        game.setVoterRoot(keccak256("other list"), "ipfs://voters-v2");
        vm.warp(vm.getBlockTimestamp() + 1 days);
        before = wif.balanceOf(alice);
        _feed(alice);
        assertEq(before - wif.balanceOf(alice), 80 ether);
    }

    function test_proofOnFeed_grantsPass() public {
        _found(bob); // full price, no proof
        assertFalse(game.hasVoterPass(bob));
        uint256 before = wif.balanceOf(bob);
        vm.prank(bob);
        game.feedQueen(_proof(1));
        assertEq(before - wif.balanceOf(bob), 80 ether);
        assertTrue(game.hasVoterPass(bob));
    }

    function test_emptyProof_fullPrice_noRevert() public {
        uint256 before = wif.balanceOf(alice);
        _found(alice);
        assertEq(before - wif.balanceOf(alice), 1_500 ether);
        assertFalse(game.hasVoterPass(alice));
    }

    function test_invalidProof_fullPrice_noRevert() public {
        bytes32[] memory junk = new bytes32[](3);
        junk[0] = keccak256("a");
        junk[1] = keccak256("b");
        junk[2] = keccak256("c");
        uint256 before = wif.balanceOf(alice);
        vm.prank(alice);
        game.foundColony(junk);
        assertEq(before - wif.balanceOf(alice), 1_500 ether);
        assertFalse(game.hasVoterPass(alice));
    }

    function test_someoneElsesProof_doesNotWork() public {
        // carol is not a voter; alice's proof is built for alice's address
        uint256 before = wif.balanceOf(carol);
        vm.prank(carol);
        game.foundColony(_proof(0));
        assertEq(before - wif.balanceOf(carol), 1_500 ether);
        assertFalse(game.hasVoterPass(carol));
    }

    function test_noRootSet_fullPrice() public {
        vm.prank(owner);
        game.setVoterRoot(bytes32(0), "");
        uint256 before = wif.balanceOf(alice);
        vm.prank(alice);
        game.foundColony(_proof(0));
        assertEq(before - wif.balanceOf(alice), 1_500 ether);
    }

    function test_otherActionsNotDiscounted() public {
        vm.prank(alice);
        game.foundColony(_proof(0));
        uint256 before = wif.balanceOf(alice);
        vm.prank(alice);
        game.shield();
        assertEq(before - wif.balanceOf(alice), 1_000 ether, "shield full price");
    }

    function test_pricesFor_view() public {
        (uint256 f, uint256 d) = game.pricesFor(alice);
        assertEq(f, 1_500 ether);
        assertEq(d, 100 ether);
        vm.prank(alice);
        game.foundColony(_proof(0));
        (f, d) = game.pricesFor(alice);
        assertEq(f, 1_200 ether);
        assertEq(d, 80 ether);
    }

    // ------------------------------------------------------------------ split on discounted amounts

    function test_split_onDiscountedAmount() public {
        uint256 potBefore = wif.balanceOf(address(pot));
        uint256 trBefore = wif.balanceOf(address(treasury));
        uint256 supplyBefore = wif.totalSupply();
        vm.prank(alice);
        game.foundColony(_proof(0));
        assertEq(wif.balanceOf(address(pot)) - potBefore, 840 ether, "70% of 1,200");
        assertEq(supplyBefore - wif.totalSupply(), 240 ether, "20% of 1,200 burned");
        assertEq(wif.balanceOf(address(treasury)) - trBefore, 120 ether, "10% of 1,200");
    }

    function testFuzz_split_discounted(uint8 pct) public {
        pct = uint8(bound(pct, 0, 30));
        ColonyGame.Config memory c = game.getConfig();
        c.voterDiscountPct = pct;
        vm.prank(owner);
        game.setConfig(c);
        uint256 supplyBefore = wif.totalSupply();
        uint256 sumBefore = wif.balanceOf(address(pot)) + wif.balanceOf(address(treasury));
        uint256 before = wif.balanceOf(alice);
        vm.prank(alice);
        game.foundColony(_proof(0));
        uint256 paid = before - wif.balanceOf(alice);
        assertEq(paid, 1_500 ether * (100 - uint256(pct)) / 100);
        uint256 burned = supplyBefore - wif.totalSupply();
        assertEq(burned, paid * 20 / 100);
        assertEq(wif.balanceOf(address(pot)) + wif.balanceOf(address(treasury)) - sumBefore + burned, paid);
    }

    // ------------------------------------------------------------------ access control and caps

    function test_onlySetterOrOwner_canSetRoot() public {
        vm.prank(alice);
        vm.expectRevert(ColonyGame.NotVoterRootSetter.selector);
        game.setVoterRoot(bytes32(uint256(1)), "");

        vm.prank(alice);
        vm.expectRevert();
        game.setVoterRootSetter(alice);

        vm.prank(owner);
        game.setVoterRootSetter(keeper);
        vm.expectEmit(address(game));
        emit ColonyGame.VoterRootUpdated(bytes32(uint256(7)), "https://example/voters.json");
        vm.prank(keeper);
        game.setVoterRoot(bytes32(uint256(7)), "https://example/voters.json");
        assertEq(game.voterRoot(), bytes32(uint256(7)));

        // Replacing the setter revokes the old one
        vm.prank(owner);
        game.setVoterRootSetter(carol);
        vm.prank(keeper);
        vm.expectRevert(ColonyGame.NotVoterRootSetter.selector);
        game.setVoterRoot(root, "");
    }

    function test_discountCap30() public {
        ColonyGame.Config memory c = game.getConfig();
        c.voterDiscountPct = 31;
        vm.prank(owner);
        vm.expectRevert(ColonyGame.BadConfig.selector);
        game.setConfig(c);
        c.voterDiscountPct = 30;
        vm.prank(owner);
        game.setConfig(c);
        assertEq(game.getConfig().voterDiscountPct, 30);
    }

    function test_passDoesNotAffectScore() public {
        vm.prank(alice);
        game.foundColony(_proof(0));
        _found(bob);
        _feed(alice);
        _feed(bob);
        (, uint256 sa,,) = game.colonyResult(1);
        (, uint256 sb,,) = game.colonyResult(2);
        assertEq(sa, sb, "same score with or without the pass");
    }
}
