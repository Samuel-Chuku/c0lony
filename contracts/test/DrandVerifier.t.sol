// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {DrandVerifier} from "../src/DrandVerifier.sol";

/// @dev Exposes the internal library functions so tests can call them and measure gas.
contract DrandVerifierHarness {
    function verifyRound(uint64 round, bytes calldata signature) external view returns (bool) {
        return DrandVerifier.verifyRound(round, signature);
    }

    function roundTime(uint64 round) external pure returns (uint256) {
        return DrandVerifier.roundTime(round);
    }

    function firstRoundAtOrAfter(uint256 t) external pure returns (uint64) {
        return DrandVerifier.firstRoundAtOrAfter(t);
    }
}

/// @notice Tests DrandVerifier against real drand evmnet rounds fetched from
///         https://api.drand.sh/04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3/public/{round}
contract DrandVerifierTest is Test {
    DrandVerifierHarness internal v;

    // Real evmnet rounds (see docs/DEPLOYMENTS.md).
    bytes internal constant SIG_1 =
        hex"11f812d738a36b2210dc88c2d635ad8039588205f42445d6de09e6530165c3462a23aca348c84badcf8df5321ac24577b7963d5b0d780bc4626baedb45cde373";
    bytes internal constant SIG_2 =
        hex"1dbfe644485f31e2a7978fb551b50933b0001e64397fd2b7dc4022e8e2fcdbc325798cea5506deec489c8db3b4697f6b1bb6be8934b95bd9c0db88923487d9ad";
    bytes internal constant SIG_1000000 =
        hex"139a803860ff6d842b822b8b37eaeccc4e278dd44440535a976530a1a503e85e11d84b824f18e608a85e627e6b1b08322060cbcf7eca1ea78489252907e8473a";
    bytes internal constant SIG_12345678 =
        hex"1f82751a21ca166dcc2c804ddd5846cb5f0f8f4ded7e93a8ec9b34cdc885d99a26353f2dbf384155cc898695316de8ce942f167a0faf3906ca066ebc7200aa86";
    bytes internal constant SIG_21938904 =
        hex"2a00723406b37f4faac16d57d462a728264f3931bb38fa14db95fb25486c0bac0ec69c200c6e2602a821bdaeecf4016b706024b24232f40e7cfc9dc36c9ff830";

    // BN254 base field modulus.
    uint256 internal constant N = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    function setUp() public {
        v = new DrandVerifierHarness();
    }

    // --- real rounds verify ---

    function test_realRounds_verify() public view {
        assertTrue(v.verifyRound(1, SIG_1), "round 1");
        assertTrue(v.verifyRound(2, SIG_2), "round 2");
        assertTrue(v.verifyRound(1000000, SIG_1000000), "round 1000000");
        assertTrue(v.verifyRound(12345678, SIG_12345678), "round 12345678");
        assertTrue(v.verifyRound(21938904, SIG_21938904), "round 21938904");
    }

    function test_gas_verifyRound() public view {
        uint256 g = gasleft();
        v.verifyRound(21938904, SIG_21938904);
        uint256 used = g - gasleft();
        console.log("verifyRound gas", used);
        assertLt(used, 400_000, "verification should stay under 400k gas");
    }

    // --- wrong round / wrong signature ---

    function test_signatureForDifferentRound_fails() public view {
        assertFalse(v.verifyRound(2, SIG_1));
        assertFalse(v.verifyRound(1000001, SIG_1000000));
        assertFalse(v.verifyRound(21938903, SIG_21938904));
        assertFalse(v.verifyRound(12345678, SIG_21938904));
    }

    function test_tamperedSignature_fails() public view {
        bytes memory sig = SIG_1000000;
        sig[63] = bytes1(uint8(sig[63]) ^ 0x01); // flips y; point falls off the curve
        assertFalse(v.verifyRound(1000000, sig));

        sig = SIG_1000000;
        sig[10] = bytes1(uint8(sig[10]) ^ 0x80);
        assertFalse(v.verifyRound(1000000, sig));
    }

    function test_negatedSignature_fails() public view {
        // (x, N - y) is on the curve but is a different point: must not verify.
        bytes memory sig = SIG_1000000;
        uint256 x;
        uint256 y;
        assembly {
            x := mload(add(sig, 0x20))
            y := mload(add(sig, 0x40))
        }
        assertFalse(v.verifyRound(1000000, abi.encodePacked(x, N - y)));
    }

    function test_outOfFieldSignature_fails() public view {
        bytes memory sig = SIG_1000000;
        uint256 x;
        uint256 y;
        assembly {
            x := mload(add(sig, 0x20))
            y := mload(add(sig, 0x40))
        }
        // Same point, but coordinates not reduced mod N.
        assertFalse(v.verifyRound(1000000, abi.encodePacked(x + N, y)));
    }

    function test_badLengthOrZero_fails() public view {
        assertFalse(v.verifyRound(1000000, ""));
        assertFalse(v.verifyRound(1000000, hex"1234"));
        assertFalse(v.verifyRound(1000000, abi.encodePacked(SIG_1000000, bytes1(0x00))));
        assertFalse(v.verifyRound(1000000, new bytes(64))); // point at infinity encoding
        assertFalse(v.verifyRound(0, SIG_1));
    }

    function testFuzz_randomSignature_fails(uint64 round, bytes32 a, bytes32 b) public view {
        vm.assume(round > 0);
        assertFalse(v.verifyRound(round, abi.encodePacked(a, b)));
    }

    // --- round timing ---

    function test_roundTime_matchesObserved() public view {
        assertEq(v.roundTime(1), 1727521075);
        assertEq(v.roundTime(2), 1727521078);
        // Round 21938904 was the latest round at unix time 1793337787.
        assertEq(v.roundTime(21938904), 1793337784);
    }

    function test_firstRoundAtOrAfter() public view {
        assertEq(v.firstRoundAtOrAfter(0), 1);
        assertEq(v.firstRoundAtOrAfter(1727521075), 1);
        assertEq(v.firstRoundAtOrAfter(1727521076), 2);
        assertEq(v.firstRoundAtOrAfter(1727521078), 2);
        assertEq(v.firstRoundAtOrAfter(1727521079), 3);
    }

    function testFuzz_firstRoundAtOrAfter_isTight(uint256 t) public view {
        t = bound(t, 1727521076, 4_000_000_000);
        uint64 r = v.firstRoundAtOrAfter(t);
        assertGe(v.roundTime(r), t, "round is not before t");
        assertLt(v.roundTime(r - 1), t, "previous round is before t");
    }
}
