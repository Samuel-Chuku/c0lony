// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {ColonyGame} from "../src/ColonyGame.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

contract NamesTest is Base {
    function test_setName_needsAColony() public {
        vm.prank(alice);
        vm.expectRevert(ColonyGame.NoColony.selector);
        game.setName("alice");
    }

    function test_setName_rules() public {
        _found(alice);
        string[6] memory bad = ["ab", "abcdefghijklmnopq", "Alice", "al ice", "al-ice", unicode"ålice"];
        for (uint256 i; i < bad.length; ++i) {
            vm.prank(alice);
            vm.expectRevert(ColonyGame.BadName.selector);
            game.setName(bad[i]);
        }
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit ColonyGame.NameSet(alice, "queen_bee_01");
        game.setName("queen_bee_01");
        assertEq(game.nameOf(alice), "queen_bee_01");
        assertEq(game.nameHolder(keccak256("queen_bee_01")), alice);
    }

    function test_setName_unique() public {
        _found(alice);
        _found(bob);
        vm.prank(alice);
        game.setName("pixy");
        vm.prank(bob);
        vm.expectRevert(ColonyGame.NameTaken.selector);
        game.setName("pixy");
    }

    function test_setName_cooldown_and_oldNameFreed() public {
        _found(alice);
        _found(bob);
        vm.prank(alice);
        game.setName("pixy");
        vm.prank(alice);
        vm.expectRevert(ColonyGame.NameCooldown.selector);
        game.setName("pixy2");
        // 21 days later it is a new season (7-day default): found again, then rename. The name stayed with the wallet.
        vm.warp(block.timestamp + 21 days);
        _found(alice);
        _found(bob);
        assertEq(game.nameOf(alice), "pixy");
        vm.prank(alice);
        game.setName("pixy2");
        assertEq(game.nameHolder(keccak256("pixy")), address(0));
        vm.prank(bob);
        game.setName("pixy");
        assertEq(game.nameOf(bob), "pixy");
    }

    function test_tokenURI_isOnchainJson() public {
        uint64 id = _found(alice);
        vm.prank(alice);
        game.setName("pixy");
        string memory uri = game.tokenURI(id);
        bytes memory prefix = bytes("data:application/json;base64,");
        bytes memory u = bytes(uri);
        for (uint256 i; i < prefix.length; ++i) assertEq(u[i], prefix[i]);
        bytes memory body = new bytes(u.length - prefix.length);
        for (uint256 i; i < body.length; ++i) body[i] = u[i + prefix.length];
        string memory json = string(_b64decode(string(body)));
        assertTrue(_contains(json, "\"name\":\"pixy's colony\""));
        assertTrue(_contains(json, "\"trait_type\":\"Ants\",\"value\":10"));
        assertTrue(_contains(json, "data:image/svg+xml;base64,"));
    }

    function test_tokenURI_unnamed_and_missing() public {
        uint64 id = _found(alice);
        assertTrue(bytes(game.tokenURI(id)).length > 100);
        vm.expectRevert();
        game.tokenURI(999);
    }

    // --- helpers
    function _contains(string memory hay, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(hay);
        bytes memory n = bytes(needle);
        if (n.length > h.length) return false;
        for (uint256 i; i <= h.length - n.length; ++i) {
            bool ok = true;
            for (uint256 j; j < n.length; ++j) {
                if (h[i + j] != n[j]) { ok = false; break; }
            }
            if (ok) return true;
        }
        return false;
    }

    function _b64decode(string memory s) internal pure returns (bytes memory out) {
        bytes memory t = bytes("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
        bytes memory b = bytes(s);
        uint256 pad = b.length > 0 && b[b.length - 1] == "=" ? (b[b.length - 2] == "=" ? 2 : 1) : 0;
        out = new bytes(b.length / 4 * 3 - pad);
        uint256 o;
        for (uint256 i; i < b.length; i += 4) {
            uint256 v;
            for (uint256 j; j < 4; ++j) {
                uint256 idx;
                bytes1 ch = b[i + j];
                if (ch != "=") { for (idx = 0; idx < 64; ++idx) if (t[idx] == ch) break; }
                v = (v << 6) | idx;
            }
            for (uint256 k; k < 3 && o < out.length; ++k) out[o++] = bytes1(uint8(v >> (16 - 8 * k)));
        }
        Base64.encode(""); // keep the import used
    }
}
