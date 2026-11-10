// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Courier
/// @notice Lets a player send WIF to another player without holding ETH. The player signs a "Send" (EIP-712); anyone
///         (in practice the C0LONY keeper) submits it and pays the gas, and the player pays a small WIF fee to the
///         fee recipient named in their own signature.
/// @dev No owner, no admin, no pause, no upgrade. WIF only moves out of a wallet with that wallet's signature, to the
///      exact receiver, amount, fee and fee recipient signed, once (sequential nonce), before the signed deadline.
///      The contract never holds WIF: both transfers go straight from the sender. Players must approve this contract.
contract Courier is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Send {
        address from;
        address to;
        uint256 amount;
        uint256 fee;
        address feeTo;
        uint256 nonce;
        uint256 deadline;
    }

    bytes32 public constant SEND_TYPEHASH = keccak256(
        "Send(address from,address to,uint256 amount,uint256 fee,address feeTo,uint256 nonce,uint256 deadline)"
    );

    /// @notice The token this courier moves ($WIF on mainnet, the mock on testnet).
    IERC20 public immutable token;

    /// @notice The next nonce each sender must sign. Increments on every successful send.
    mapping(address => uint256) public nonces;

    event Sent(
        address indexed from, address indexed to, uint256 amount, uint256 fee, address indexed feeTo, uint256 nonce
    );

    error Expired();
    error ZeroAmount();
    error BadAddress();
    error BadNonce();
    error BadSignature();

    constructor(IERC20 token_) EIP712("C0LONY Courier", "1") {
        token = token_;
    }

    /// @notice Execute a signed Send. Callable by anyone; the fee always goes to the signed `feeTo`.
    function send(Send calldata s, bytes calldata signature) external nonReentrant {
        if (block.timestamp > s.deadline) revert Expired();
        if (s.amount == 0) revert ZeroAmount();
        if (s.to == address(0) || s.to == s.from || s.feeTo == address(0)) revert BadAddress();
        if (s.nonce != nonces[s.from]) revert BadNonce();
        // ECDSA.recover rejects malformed and high-s (malleable) signatures.
        if (ECDSA.recover(hashSend(s), signature) != s.from) revert BadSignature();

        nonces[s.from] = s.nonce + 1; // effects before interactions

        token.safeTransferFrom(s.from, s.to, s.amount);
        if (s.fee > 0) token.safeTransferFrom(s.from, s.feeTo, s.fee);
        emit Sent(s.from, s.to, s.amount, s.fee, s.feeTo, s.nonce);
    }

    /// @notice The EIP-712 digest a sender signs for `s`. Also the relay's request id.
    function hashSend(Send calldata s) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(SEND_TYPEHASH, s.from, s.to, s.amount, s.fee, s.feeTo, s.nonce, s.deadline))
        );
    }

    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
