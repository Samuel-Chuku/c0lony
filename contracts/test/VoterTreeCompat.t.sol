// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {stdJson} from "forge-std/StdJson.sol";

/// @notice The voter tree is built offchain by @openzeppelin/merkle-tree (keeper). This proves ColonyGame
///         accepts that library's root and proofs, i.e. the leaf encodings match.
contract VoterTreeCompatTest is Base {
    using stdJson for string;

    function test_jsLibraryProof_unlocksDiscount() public {
        string memory json =
            vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/voter_tree.json"));
        bytes32 root = json.readBytes32(".root");
        bytes32[] memory proof = json.readBytes32Array(".aliceProof");
        assertEq(json.readAddress(".alice"), alice, "fixture built for the test's alice");

        vm.prank(owner);
        game.setVoterRoot(root, "fixture");
        uint256 before = wif.balanceOf(alice);
        vm.prank(alice);
        game.foundColony(proof);
        assertEq(before - wif.balanceOf(alice), 1_200 ether);
        assertTrue(game.hasVoterPass(alice));
    }
}
