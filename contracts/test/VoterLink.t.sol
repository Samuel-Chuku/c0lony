// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {ColonyGame} from "../src/ColonyGame.sol";

/// @notice Linking a Voter's Pass from the wallet that voted to a separate game wallet, with an EIP-712 signature.
contract VoterLinkTest is Base {
    address internal voterA;
    uint256 internal keyA;
    address internal voterB;
    uint256 internal keyB;
    address internal outsider; // not on the list
    uint256 internal keyOut;

    bytes32 internal root;
    bytes32[] internal proofA;
    bytes32[] internal proofB;

    bytes32 internal constant TYPEHASH = keccak256("LinkVoterPass(address gameWallet,uint256 nonce)");

    function _leaf(address a) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(a))));
    }

    function _hashPair(bytes32 x, bytes32 y) internal pure returns (bytes32) {
        return x < y ? keccak256(abi.encode(x, y)) : keccak256(abi.encode(y, x));
    }

    function setUp() public override {
        super.setUp();
        (voterA, keyA) = makeAddrAndKey("voterA");
        (voterB, keyB) = makeAddrAndKey("voterB");
        (outsider, keyOut) = makeAddrAndKey("outsider");
        // Two-leaf tree: each proof is the other leaf
        root = _hashPair(_leaf(voterA), _leaf(voterB));
        proofA.push(_leaf(voterB));
        proofB.push(_leaf(voterA));
        vm.prank(owner);
        game.setVoterRoot(root, "https://example/voters.json");
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("C0LONY"),
                keccak256("1"),
                block.chainid,
                address(game)
            )
        );
    }

    function _sign(uint256 key, address gameWallet, uint256 nonce) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(TYPEHASH, gameWallet, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_validLink_grantsPass() public {
        bytes memory sig = _sign(keyA, carol, 0);
        vm.expectEmit(address(game));
        emit ColonyGame.VoterPassLinked(voterA, carol);
        vm.prank(carol);
        game.claimVoterPass(voterA, proofA, sig);
        assertTrue(game.hasVoterPass(carol));
        assertFalse(game.hasVoterPass(voterA), "the voting wallet itself does not get a pass");
        assertEq(game.voterUsed(voterA), carol);
        assertEq(game.voterNonce(voterA), 1);
    }

    function test_discountAppliesAfterLinking() public {
        vm.prank(carol);
        game.claimVoterPass(voterA, proofA, _sign(keyA, carol, 0));
        uint256 before = wif.balanceOf(carol);
        _found(carol); // no proof needed
        assertEq(before - wif.balanceOf(carol), 1_200 ether, "1,500 - 20%");
        vm.warp(vm.getBlockTimestamp() + 1 days);
        before = wif.balanceOf(carol);
        _feed(carol);
        assertEq(before - wif.balanceOf(carol), 80 ether, "100 - 20%");
    }

    function test_sameVoter_secondClaimRefused() public {
        vm.prank(carol);
        game.claimVoterPass(voterA, proofA, _sign(keyA, carol, 0));
        // A fresh, correctly signed authorisation for another wallet still fails: one wallet per voter
        bytes memory sig2 = _sign(keyA, bob, 1);
        vm.prank(bob);
        vm.expectRevert(ColonyGame.VoterAlreadyUsed.selector);
        game.claimVoterPass(voterA, proofA, sig2);
    }

    function test_replayedSignature_refused() public {
        bytes memory sig = _sign(keyA, carol, 0);
        vm.prank(carol);
        game.claimVoterPass(voterA, proofA, sig);
        vm.prank(carol);
        vm.expectRevert(ColonyGame.VoterAlreadyUsed.selector);
        game.claimVoterPass(voterA, proofA, sig);
    }

    function test_staleNonce_refused() public {
        // A signature over the wrong nonce does not verify (nonce is 0, signed 1)
        vm.prank(carol);
        vm.expectRevert(ColonyGame.BadVoterSignature.selector);
        game.claimVoterPass(voterA, proofA, _sign(keyA, carol, 1));
    }

    function test_wrongSigner_refused() public {
        // voterB signs, but the claim names voterA
        vm.prank(carol);
        vm.expectRevert(ColonyGame.BadVoterSignature.selector);
        game.claimVoterPass(voterA, proofA, _sign(keyB, carol, 0));
    }

    function test_signatureForDifferentGameWallet_refused() public {
        // voterA authorised bob; carol tries to use it
        bytes memory sig = _sign(keyA, bob, 0);
        vm.prank(carol);
        vm.expectRevert(ColonyGame.BadVoterSignature.selector);
        game.claimVoterPass(voterA, proofA, sig);
        assertFalse(game.hasVoterPass(carol));
    }

    function test_voterNotOnList_refused() public {
        vm.prank(carol);
        vm.expectRevert(ColonyGame.NotOnVoterList.selector);
        game.claimVoterPass(outsider, proofA, _sign(keyOut, carol, 0));
    }

    function test_noRoot_refused() public {
        vm.prank(owner);
        game.setVoterRoot(bytes32(0), "");
        vm.prank(carol);
        vm.expectRevert(ColonyGame.NotOnVoterList.selector);
        game.claimVoterPass(voterA, proofA, _sign(keyA, carol, 0));
    }

    function test_gameWalletWithPass_cannotUseUpAnotherVoter() public {
        vm.prank(carol);
        game.claimVoterPass(voterA, proofA, _sign(keyA, carol, 0));
        vm.prank(carol);
        vm.expectRevert(ColonyGame.AlreadyHasPass.selector);
        game.claimVoterPass(voterB, proofB, _sign(keyB, carol, 0));
        assertEq(game.voterUsed(voterB), address(0), "voterB still free");
    }

    // ------------------------------------------------------------------ interplay with the direct path

    function test_directPath_stillWorks_andUsesUpTheVoter() public {
        wif.mint(voterA, 10_000 ether);
        vm.startPrank(voterA);
        wif.approve(address(game), type(uint256).max);
        uint256 before = wif.balanceOf(voterA);
        game.foundColony(proofA);
        vm.stopPrank();
        assertEq(before - wif.balanceOf(voterA), 1_200 ether);
        assertTrue(game.hasVoterPass(voterA));
        assertEq(game.voterUsed(voterA), voterA);
        // The same voter cannot also hand the pass to a game wallet
        vm.prank(carol);
        vm.expectRevert(ColonyGame.VoterAlreadyUsed.selector);
        game.claimVoterPass(voterA, proofA, _sign(keyA, carol, 0));
    }

    function test_linkedVoter_getsNoSecondPassDirectly() public {
        vm.prank(carol);
        game.claimVoterPass(voterA, proofA, _sign(keyA, carol, 0));
        wif.mint(voterA, 10_000 ether);
        vm.startPrank(voterA);
        wif.approve(address(game), type(uint256).max);
        uint256 before = wif.balanceOf(voterA);
        game.foundColony(proofA); // valid proof, but the voter's grant is already used: full price, no revert
        vm.stopPrank();
        assertEq(before - wif.balanceOf(voterA), 1_500 ether);
        assertFalse(game.hasVoterPass(voterA));
    }

    function test_domain_matchesEip712Spec() public view {
        (, string memory name, string memory version, uint256 chainId, address verifying,,) = game.eip712Domain();
        assertEq(name, "C0LONY");
        assertEq(version, "1");
        assertEq(chainId, block.chainid);
        assertEq(verifying, address(game));
    }
}
