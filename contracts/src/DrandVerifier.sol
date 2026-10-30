// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BLS} from "./vendor/bls-bn254/BLS.sol";

/// @title DrandVerifier
/// @notice Verifies drand evmnet beacon rounds onchain (BLS signatures on BN254, unchained scheme).
/// @dev All constants come from https://api.drand.sh/04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3/info
///      and are recorded in docs/DEPLOYMENTS.md. `verifyRound` is a public library function, so the
///      BLS code is deployed once as a linked library and kept out of ColonyGame's bytecode
///      (which would otherwise exceed the 24 KB contract size limit).
library DrandVerifier {
    /// @notice evmnet chain hash (for reference; not used in verification).
    bytes32 internal constant CHAIN_HASH = 0x04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3;

    /// @notice Unix time of round 1.
    uint256 internal constant GENESIS_TIME = 1727521075;

    /// @notice Seconds between rounds.
    uint256 internal constant PERIOD = 3;

    /// @notice Domain separation tag used by drand for hash-to-curve on BN254 G1.
    bytes internal constant DST = "BLS_SIG_BN254G1_XMD:KECCAK-256_SVDW_RO_NUL_";

    // evmnet public key (G2). drand publishes it as 128 bytes = four 32-byte words w0..w3;
    // the BLS library expects them in the order [w1, w0, w3, w2].
    uint256 internal constant PK_0 = 0x0557ec32c2ad488e4d4f6008f89a346f18492092ccc0d594610de2732c8b808f; // w1
    uint256 internal constant PK_1 = 0x07e1d1d335df83fa98462005690372c643340060d205306a9aa8106b6bd0b382; // w0
    uint256 internal constant PK_2 = 0x297d3a4f9749b33eb2d904c9d9ebf17224150ddd7abd7567a9bec6c74480ee0b; // w3
    uint256 internal constant PK_3 = 0x0095685ae3a85ba243747b1b2f426049010f6b73a0cf1d389351d5aaaa1047f6; // w2

    /// @notice Returns true if `signature` is drand evmnet's signature for `round`.
    /// @param round The beacon round number (rounds start at 1).
    /// @param signature The 64-byte G1 signature (x || y) exactly as returned by drand's HTTP API.
    function verifyRound(uint64 round, bytes memory signature) public view returns (bool) {
        if (round == 0 || signature.length != 64) return false;

        uint256[2] memory sig;
        assembly ("memory-safe") {
            mstore(sig, mload(add(signature, 0x20)))
            mstore(add(sig, 0x20), mload(add(signature, 0x40)))
        }
        if (!BLS.isValidSignature(sig)) return false;

        // drand evmnet signs keccak256(round as 8 big-endian bytes).
        bytes memory message = abi.encodePacked(keccak256(abi.encodePacked(round)));
        uint256[2] memory point = BLS.hashToPoint(DST, message);

        (bool pairingSuccess, bool callSuccess) = BLS.verifySingle(sig, [PK_0, PK_1, PK_2, PK_3], point);
        return pairingSuccess && callSuccess;
    }

    /// @notice Unix time at which `round` is published.
    function roundTime(uint64 round) internal pure returns (uint256) {
        return GENESIS_TIME + (uint256(round) - 1) * PERIOD;
    }

    /// @notice The first round published at or after unix time `t`.
    function firstRoundAtOrAfter(uint256 t) internal pure returns (uint64) {
        if (t <= GENESIS_TIME) return 1;
        return uint64((t - GENESIS_TIME + PERIOD - 1) / PERIOD + 1);
    }
}
