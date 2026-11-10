// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Courier} from "../src/Courier.sol";
import {MockWIF} from "../src/mocks/MockWIF.sol";

/// A token whose transferFrom tries to run the same signed Send again (reentrancy probe).
contract ReentrantToken is ERC20 {
    Courier public courier;
    Courier.Send internal s;
    bytes internal sig;
    bool public armed;
    bool public reentered; // true if the nested send succeeded

    constructor() ERC20("Bad", "BAD") {}

    function mint(address to, uint256 a) external {
        _mint(to, a);
    }

    function arm(Courier c, Courier.Send calldata s_, bytes calldata sig_) external {
        courier = c;
        s = s_;
        sig = sig_;
        armed = true;
    }

    function transferFrom(address from, address to, uint256 a) public override returns (bool) {
        if (armed) {
            armed = false;
            try courier.send(s, sig) {
                reentered = true;
            } catch {}
        }
        return super.transferFrom(from, to, a);
    }
}

contract CourierTest is Test {
    MockWIF wif;
    Courier courier;
    uint256 constant ALICE_PK = 0xA11CE;
    uint256 constant MALLORY_PK = 0xBAD;
    address alice;
    address bob = address(0xB0B);
    address keeper = address(0x4EE9);
    address rando = address(0x7777);
    uint256 constant FEE = 5e18;

    event Sent(
        address indexed from, address indexed to, uint256 amount, uint256 fee, address indexed feeTo, uint256 nonce
    );

    function setUp() public {
        wif = new MockWIF();
        courier = new Courier(IERC20(address(wif)));
        alice = vm.addr(ALICE_PK);
        wif.mint(alice, 1_000_000e18);
        vm.prank(alice);
        wif.approve(address(courier), 10_000e18);
        vm.warp(1_800_000_000);
    }

    function _send(uint256 amount, uint256 fee, uint256 nonce) internal view returns (Courier.Send memory) {
        return Courier.Send({
            from: alice, to: bob, amount: amount, fee: fee, feeTo: keeper, nonce: nonce, deadline: block.timestamp + 600
        });
    }

    function _sign(uint256 pk, Courier.Send memory s) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 sv) = vm.sign(pk, courier.hashSend(s));
        return abi.encodePacked(r, sv, v);
    }

    // ---------------------------------------------------------------- funds flow

    function test_ExactFundsFlow() public {
        Courier.Send memory s = _send(200e18, FEE, 0);
        uint256 before = wif.balanceOf(alice);
        vm.expectEmit(address(courier));
        emit Sent(alice, bob, 200e18, FEE, keeper, 0);
        vm.prank(keeper);
        courier.send(s, _sign(ALICE_PK, s));
        assertEq(wif.balanceOf(bob), 200e18);
        assertEq(wif.balanceOf(keeper), FEE);
        assertEq(before - wif.balanceOf(alice), 200e18 + FEE);
        assertEq(wif.balanceOf(address(courier)), 0);
        assertEq(courier.nonces(alice), 1);
    }

    function testFuzz_FundsConservation(uint256 amount, uint256 fee) public {
        amount = bound(amount, 1, 5_000e18);
        fee = bound(fee, 0, 5_000e18);
        Courier.Send memory s = _send(amount, fee, 0);
        uint256 before = wif.balanceOf(alice);
        courier.send(s, _sign(ALICE_PK, s));
        assertEq(wif.balanceOf(bob), amount);
        assertEq(wif.balanceOf(keeper), fee);
        assertEq(before - wif.balanceOf(alice), amount + fee);
        assertEq(wif.balanceOf(address(courier)), 0);
    }

    function test_AnyoneCanSubmit_FeeStillGoesToSignedFeeTo() public {
        Courier.Send memory s = _send(10e18, FEE, 0);
        vm.prank(rando);
        courier.send(s, _sign(ALICE_PK, s));
        assertEq(wif.balanceOf(rando), 0);
        assertEq(wif.balanceOf(keeper), FEE);
    }

    function test_ZeroFeeWorks() public {
        Courier.Send memory s = _send(10e18, 0, 0);
        courier.send(s, _sign(ALICE_PK, s));
        assertEq(wif.balanceOf(bob), 10e18);
        assertEq(wif.balanceOf(keeper), 0);
    }

    // ---------------------------------------------------------------- signature

    function test_RevertWhen_SignedBySomeoneElse() public {
        Courier.Send memory s = _send(10e18, FEE, 0);
        bytes memory sig = _sign(MALLORY_PK, s);
        vm.expectRevert(Courier.BadSignature.selector);
        courier.send(s, sig);
    }

    function test_RevertWhen_AnyFieldChanged() public {
        Courier.Send memory s = _send(10e18, FEE, 0);
        bytes memory sig = _sign(ALICE_PK, s);
        Courier.Send memory t;

        t = s;
        t.to = rando;
        vm.expectRevert(Courier.BadSignature.selector);
        courier.send(t, sig);

        t = _send(10e18, FEE, 0);
        t.amount = 11e18;
        vm.expectRevert(Courier.BadSignature.selector);
        courier.send(t, sig);

        t = _send(10e18, FEE, 0);
        t.fee = 6e18;
        vm.expectRevert(Courier.BadSignature.selector);
        courier.send(t, sig);

        t = _send(10e18, FEE, 0);
        t.feeTo = rando;
        vm.expectRevert(Courier.BadSignature.selector);
        courier.send(t, sig);

        t = _send(10e18, FEE, 0);
        t.deadline += 1;
        vm.expectRevert(Courier.BadSignature.selector);
        courier.send(t, sig);

        assertEq(wif.balanceOf(bob), 0);
    }

    function test_RevertWhen_GarbageSignature() public {
        Courier.Send memory s = _send(10e18, FEE, 0);
        vm.expectRevert();
        courier.send(s, hex"1234");
        vm.expectRevert();
        courier.send(s, new bytes(65));
    }

    function test_RevertWhen_HighS() public {
        Courier.Send memory s = _send(10e18, FEE, 0);
        (uint8 v, bytes32 r, bytes32 sv) = vm.sign(ALICE_PK, courier.hashSend(s));
        // The other valid-looking signature for the same digest: s' = n - s, v flipped.
        bytes32 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes memory high = abi.encodePacked(r, bytes32(uint256(n) - uint256(sv)), v == 27 ? uint8(28) : uint8(27));
        vm.expectRevert();
        courier.send(s, high);
    }

    // ---------------------------------------------------------------- replay

    function test_RevertWhen_SameSignatureTwice() public {
        Courier.Send memory s = _send(10e18, FEE, 0);
        bytes memory sig = _sign(ALICE_PK, s);
        courier.send(s, sig);
        vm.expectRevert(Courier.BadNonce.selector);
        courier.send(s, sig);
        assertEq(wif.balanceOf(bob), 10e18);
    }

    function test_RevertWhen_NonceSkipsAhead() public {
        Courier.Send memory s = _send(10e18, FEE, 1);
        bytes memory sig = _sign(ALICE_PK, s);
        vm.expectRevert(Courier.BadNonce.selector);
        courier.send(s, sig);
    }

    function test_RevertWhen_OtherChainOrOtherCourier() public {
        Courier.Send memory s = _send(10e18, FEE, 0);
        bytes memory sig = _sign(ALICE_PK, s);

        Courier other = new Courier(IERC20(address(wif)));
        vm.prank(alice);
        wif.approve(address(other), 10_000e18);
        vm.expectRevert(Courier.BadSignature.selector);
        other.send(s, sig);

        vm.chainId(4663);
        vm.expectRevert(Courier.BadSignature.selector);
        courier.send(s, sig);
    }

    // ---------------------------------------------------------------- deadline

    function test_DeadlineInclusive_ThenReverts() public {
        Courier.Send memory s = _send(10e18, FEE, 0);
        bytes memory sig = _sign(ALICE_PK, s);
        vm.warp(s.deadline + 1);
        vm.expectRevert(Courier.Expired.selector);
        courier.send(s, sig);
        vm.warp(s.deadline);
        courier.send(s, sig);
        assertEq(wif.balanceOf(bob), 10e18);
    }

    // ---------------------------------------------------------------- edge amounts

    function test_RevertWhen_ZeroAmount() public {
        Courier.Send memory s = _send(0, FEE, 0);
        bytes memory sig = _sign(ALICE_PK, s);
        vm.expectRevert(Courier.ZeroAmount.selector);
        courier.send(s, sig);
    }

    function test_RevertWhen_SelfOrZeroAddresses() public {
        Courier.Send memory s = _send(10e18, FEE, 0);
        s.to = alice;
        bytes memory sig = _sign(ALICE_PK, s);
        vm.expectRevert(Courier.BadAddress.selector);
        courier.send(s, sig);

        s = _send(10e18, FEE, 0);
        s.to = address(0);
        sig = _sign(ALICE_PK, s);
        vm.expectRevert(Courier.BadAddress.selector);
        courier.send(s, sig);

        s = _send(10e18, FEE, 0);
        s.feeTo = address(0);
        sig = _sign(ALICE_PK, s);
        vm.expectRevert(Courier.BadAddress.selector);
        courier.send(s, sig);
    }

    function test_RevertWhen_NotEnoughAllowanceOrBalance_NothingMoves() public {
        Courier.Send memory s = _send(10_000e18, FEE, 0); // allowance is 10,000: amount + fee is over it
        bytes memory sig = _sign(ALICE_PK, s);
        vm.expectRevert();
        courier.send(s, sig);
        assertEq(courier.nonces(alice), 0);
        assertEq(wif.balanceOf(bob), 0);

        s = _send(type(uint256).max, 0, 0);
        sig = _sign(ALICE_PK, s);
        vm.expectRevert();
        courier.send(s, sig);
        assertEq(wif.balanceOf(bob), 0);
    }

    function test_RevertWhen_AmountPlusFeeOverflows() public {
        Courier.Send memory s = _send(type(uint256).max, 1, 0);
        bytes memory sig = _sign(ALICE_PK, s);
        vm.expectRevert();
        courier.send(s, sig);
    }

    // ---------------------------------------------------------------- reentrancy

    function test_ReentrancyCannotRunTheSameSendTwice() public {
        ReentrantToken bad = new ReentrantToken();
        Courier c = new Courier(IERC20(address(bad)));
        bad.mint(alice, 1_000e18);
        vm.prank(alice);
        bad.approve(address(c), 1_000e18);
        Courier.Send memory s = Courier.Send({
            from: alice, to: bob, amount: 10e18, fee: 0, feeTo: keeper, nonce: 0, deadline: block.timestamp + 600
        });
        (uint8 v, bytes32 r, bytes32 sv) = vm.sign(ALICE_PK, c.hashSend(s));
        bytes memory sig = abi.encodePacked(r, sv, v);
        bad.arm(c, s, sig);
        c.send(s, sig);
        assertFalse(bad.reentered());
        assertEq(bad.balanceOf(bob), 10e18);
        assertEq(c.nonces(alice), 1);
    }

    // ---------------------------------------------------------------- no admin surface

    function test_NoOwnerNoAdmin() public view {
        // The only state is the token (immutable) and nonces. There is nothing to configure, pause or withdraw.
        assertEq(address(courier.token()), address(wif));
        assertEq(courier.nonces(alice), 0);
    }
}
