// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {ColonyGame} from "../src/ColonyGame.sol";
import {DrandVerifier} from "../src/DrandVerifier.sol";

/// @notice The settle refund must never exceed what the settler actually paid for gas.
contract RefundAccuracyTest is Base {
    function test_refund_doesNotExceedActualGas() public {
        uint64 a = _found(alice);
        uint64 b = _found(bob);
        uint64 round = ROUND_DAY0;
        vm.warp(DrandVerifier.roundTime(round) - 30 - 4 hours - 10 minutes);
        uint256 raidId = _launch(alice, a, b, 3, ColonyGame.Resource.Sugar);
        _revealAtRound(alice, raidId, ColonyGame.Resource.Sugar, round);
        vm.warp(DrandVerifier.roundTime(round) + 60);

        uint256 price = 0.02 gwei;
        vm.txGasPrice(price);
        bytes memory sig = sigOf[round];
        bytes memory data = abi.encodeCall(ColonyGame.settle, (raidId, sig));
        uint256 calldataGas;
        for (uint256 i; i < data.length; ++i) {
            calldataGas += data[i] == 0 ? 4 : 16;
        }

        uint256 before = keeper.balance;
        vm.prank(keeper);
        uint256 g = gasleft();
        (bool ok,) = address(game).call(data);
        uint256 execGas = g - gasleft();
        assertTrue(ok);
        uint256 refund = keeper.balance - before;
        uint256 actual = (21_000 + calldataGas + execGas) * price;
        emit log_named_uint("actual tx gas", 21_000 + calldataGas + execGas);
        emit log_named_uint("refunded gas", refund / price);
        assertLe(refund, actual, "refund never exceeds gas actually paid");
        assertGe(refund * 100, actual * 90, "refund covers at least 90% of the gas");
    }
}
