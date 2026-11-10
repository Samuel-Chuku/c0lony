# Design: pay gas in WIF for "Send WIF to a colony" (Courier)

- **Date:** 2026-11-10
- **Tier:** 3. A new contract moves player funds, and the keeper signs and sends transactions for players.
- **Goal:** a player can send WIF to another colony while holding **no ETH**. They sign a message, the keeper submits it and pays the ETH gas, and the player pays a small WIF fee in the same transaction.
- **Status:** approved by Samuel on 2026-11-10 (fee 5 WIF, fee to the keeper, 10,000 WIF approval, Send WIF only).

## 0. Why not the obvious options

| Option | Why not |
| --- | --- |
| ERC-4337 paymaster | Needs smart-contract wallets. Every player would get a new address, which breaks existing colonies (the colony NFT is locked to the address). No known paymaster runs on Robinhood Chain. |
| `permit` (EIP-2612), no approval needed | **$WIF has no `permit`**: checked live, `nonces()`, `DOMAIN_SEPARATOR()` and `eip712Domain()` all revert. |
| EIP-7702 (an EOA delegates to code) | No approval transaction at all, but it depends on chain and Privy support we haven't verified, and adds a lot of moving parts. Revisit later. |
| **Our own relay contract + keeper** | Works with today's wallets. One approval transaction per player, then every send is signature-only. **Chosen.** |

The one-time approval still costs ETH. That's fine: new players already get starter gas, which covers it.

## 1. Architecture

```
 Player app ──(1) approve Courier once (normal tx, ETH gas)──────────────▶ $WIF
     │
     │(2) sign EIP-712 "Send" (free, one click in the embedded wallet)
     ▼
 Pages Function  POST /api/courier ──(3) validate + store "pending"──▶ D1 courier_requests
     ▲                                                                        │
     │(6) GET /api/courier/status?id  ◀── done/failed + tx ──────────────────┤
     │                                                                        │
 Keeper (VPS) ──(4) signed poll /api/courier/pending every 5 s ──────────────┘
     │   checks: signature, nonce, deadline, fee ≥ minimum, balance + allowance, simulate
     └──(5) Courier.send(...)  (keeper pays ETH) ──────────────▶ Courier ──transferFrom──▶ $WIF
                                                                   ├─ amount → receiver
                                                                   └─ fee    → feeTo (signed by the player)
```

| Component | Interface | Owns |
| --- | --- | --- |
| **Courier** (new contract, immutable, no owner) | `send(Send s, bytes sig)`, `nonces(address)`, `hashSend(Send)`, `DOMAIN_SEPARATOR()`, event `Sent(from, to, amount, fee, feeTo, nonce)` | per-player `nonces` |
| **Pages Function** `/api/courier/*` (new) | `POST /api/courier` (public), `GET /api/courier/status?id=` (public), `POST /api/courier/pending` and `/done` (HMAC-signed, keeper only), `GET /api/courier/config` (fee, feeTo, Courier address) | D1 table `courier_requests` |
| **Keeper relay** (new module, same pattern as starter gas) | polls pending, sends, reports done | `courier-sent.json` (id → sending/sent + tx), so it never sends twice |
| **App** (Send WIF sheet) | "Pay gas in WIF" toggle, one-time "Enable" (approve), sign, then show the result window | nothing new |

**Signed message (EIP-712, domain `{ name: "C0LONY Courier", version: "1", chainId, verifyingContract }`):**
`Send(address from, address to, uint256 amount, uint256 fee, address feeTo, uint256 nonce, uint256 deadline)`

`feeTo` is **in the signature**. The player agrees to exactly who gets the fee, so the contract needs no owner and no fee setting. Whoever submits the transaction can't redirect the fee.

## 2. Capacity

- **Today:** a handful of players. Expect fewer than 50 sends a day.
- **At 10x:** under 500 a day, about one every 3 minutes. One keeper wallet sending one transaction at a time handles this easily.
- **Gas per send:** about 80 to 120k gas (two `transferFrom` calls plus a signature check). At today's 0.02 gwei that's about 0.0000025 ETH, roughly half a cent.
- **What breaks first:** the keeper's ETH float. It drains by about 0.0000025 ETH per send while WIF fees build up. 0.001 ETH covers about 400 sends. The existing low-balance alert (below 0.0002 ETH) covers this. Someone has to swap fee WIF back to ETH now and then (manual).

## 3. Load balancing

N/A: one keeper wallet sends sequentially, so there are no nonce races. If the keeper dies mid-send, the state file shows "sending" with the tx hash. On restart it checks that tx and never re-sends. The onchain nonce would block a second execution anyway.

## 4. Caching

- The app caches `/api/courier/config` (fee, feeTo, Courier address) for 5 minutes. **Invalidation:** if the keeper rejects a request with `fee_too_low`, the app re-fetches the config and asks the player to sign again. **Eviction:** a page reload.
- No other caches.

## 5. Availability

| Step | On failure |
| --- | --- |
| Player signs | Nothing stored; they can retry. |
| `POST /api/courier` | 4xx with a reason, or 5xx: the app says "Couldn't queue the send" and offers to retry, or to pay gas in ETH instead (the normal path). |
| Keeper poll | Retries every 5 s. If the keeper is down, requests wait. After the deadline (signed, 10 minutes) they can never execute; the Pages Function marks them `expired` and the app shows "Not sent. Nothing left your wallet." |
| Keeper checks fail (low balance/allowance, bad sig, nonce used, fee below minimum) | Marked `failed` with a reason. No transaction. |
| Simulation reverts | `failed`, no transaction. |
| Tx sent but reverted | `failed` with the tx. The player loses nothing; the keeper loses the gas. |
| Keeper ETH below floor | Stops sending and alerts; requests expire. The app falls back to the ETH path. |

**Single point of failure:** the keeper. That's acceptable, because the plain ETH send path keeps working without it.

## 6. Scaling

Vertical only (one keeper). It's stateful through its wallet nonce, and at this volume nothing more is needed.

## 7. Storage

New D1 table, accessed by id (status polling) and by `status = 'pending'` (keeper poll).

```sql
CREATE TABLE courier_requests (
  id TEXT PRIMARY KEY,          -- the EIP-712 digest of the Send (deterministic, so idempotent)
  network TEXT NOT NULL,
  sender TEXT NOT NULL, receiver TEXT NOT NULL,
  amount TEXT NOT NULL, fee TEXT NOT NULL, fee_to TEXT NOT NULL,
  nonce TEXT NOT NULL, deadline INTEGER NOT NULL,
  sig TEXT NOT NULL,
  status TEXT NOT NULL,         -- pending | sending | sent | failed | expired
  reason TEXT, tx TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX courier_pending ON courier_requests (status, network, created_at);
CREATE INDEX courier_sender ON courier_requests (sender, created_at);
```

**N+1:** the keeper fetches up to 20 pending requests in one query. **Migration:** additive (a new table), created in the D1 console like `tg_codes`, so it's backward compatible.

## 8. Consistency

| Data | During an outage |
| --- | --- |
| Onchain nonce, balances, allowance | **refuse**: always read live before sending |
| `courier_requests.status` | **stale** is fine: the app shows "Sending…" until it updates; the chain is the truth |
| Fee config | **stale** for up to 5 minutes; a too-low fee is rejected, never silently accepted |

## 9. Async

Sending is async on purpose: the app queues the request and polls `status` every 2 s, for up to 2 minutes.

- **Producer:** the app. **Consumer:** the keeper.
- **Retries:** none per request. A failed request becomes `failed`, and the player can sign a new one (new nonce, new id).
- **Dead letter:** `failed` and `expired` rows stay in D1 with a reason, and are pruned after 30 days.

## 10. Circuit breakers

| Call | Timeout | Opens after | Cool-down | When open | Alert |
| --- | --- | --- | --- | --- | --- |
| Keeper → Pages Function (pending/done) | 10 s | 5 failures | 60 s | skip that tick | log |
| Keeper → RPC (simulate, send, receipt) | 15 s, with fallback RPCs (existing transport) | 3 failures in a row | 60 s | leave the request pending until its deadline | log, plus the low-balance alert |
| App → `/api/courier/status` | 10 s | n/a | n/a | keep polling until 2 minutes, then say "still processing" with an explorer link | none |

## 11. Rate limits

| Operation | Limit | When hit |
| --- | --- | --- |
| `POST /api/courier` per sender | 5 pending at once, 30 a day | 429 "Too many sends right now" |
| `POST /api/courier` overall | 500 a day per network | 429; the app offers the ETH path |
| Keeper sends | 1 at a time; at most 20 per tick, every 5 s | the rest wait for the next tick |
| Fee | at least `COURIER_MIN_FEE_WIF` (keeper env, default 5); the app shows the current fee | `failed: fee_too_low` |
| Amount | above 0; the app keeps the Send sheet's balance check | 400 |

## 12. Idempotency

- **Request id** = the EIP-712 digest of the Send. The same signed message posted twice gives the same row (`INSERT OR IGNORE`) and returns the existing status.
- **Onchain:** `nonce` must equal `nonces[from]`, and it increments on success. The same signature can never execute twice, and the EIP-712 domain includes chainId, so it can't run on another chain either.
- **Keeper:** writes `sending` with the id to its state file before sending, and never re-sends an id it has seen.

## 13. Security

- **Courier has no owner, no admin, no pause, and no upgrade.** It can only move WIF out of a wallet with a valid signature from that wallet, and only:
  - for the exact receiver, amount, fee and fee recipient that were signed;
  - once (by nonce);
  - before the deadline.
- **Checks-effects-interactions:** it bumps the nonce before calling `transferFrom`, uses `nonReentrant`, and calls the token through SafeERC20.
- **Signatures:** OpenZeppelin `EIP712` + `ECDSA`. Malleable signatures (high s) are rejected, and `from` must be the recovered signer. Players use ordinary wallets (EOAs), so smart-contract signatures (ERC-1271) aren't supported.
- **Allowance risk:** a player approves the Courier. The app approves a fixed amount (default 10,000 WIF, topped up when low), not unlimited, and Settings has a "Revoke" button that sets the allowance to 0.
- **Public endpoint input checks:** addresses, uint strings, a 65-byte signature, a deadline no more than 15 minutes ahead, a body size limit, the fee recipient must equal the configured keeper `feeTo`, and the signature is checked server-side before storing.
- **Keeper key:** the existing settle key in the keeper env. It never touches the repo or logs.
- **Fee recipient:** the keeper wallet, since it pays the ETH. Shown on the config endpoint and in the docs.

## 14. Contract tests (Foundry, written first)

| Rule | Test |
| --- | --- |
| Signature required | A Send signed by someone else, a changed field (to, amount, fee, feeTo, deadline) or a garbage signature reverts. |
| Replay | The same signature twice reverts. A signature for nonce n+1 reverts while n is unused. A signature for another chainId or another Courier address reverts. |
| Deadline | It reverts after the deadline and succeeds at the deadline. |
| Exact funds flow | On success: the receiver gets exactly `amount`, feeTo gets exactly `fee`, the sender loses exactly `amount + fee`, and the Courier holds 0 WIF. Fuzzed over amounts and fees. |
| Anyone can submit | A random caller can submit a valid Send. The fee still goes to the signed feeTo, never to the caller. |
| Edge amounts | `fee = 0` works. `amount = 0` reverts. Insufficient balance or allowance reverts with nothing moved. `type(uint).max` amounts revert cleanly. |
| Reentrancy | A malicious token that re-enters `send` can't execute twice. |
| Malleability | A high-s version of a valid signature reverts. |
| Events | `Sent` is emitted with every field. |

Plus tests for the keeper relay (never sends twice across a restart, skips on bad sig/nonce/deadline/low fee, respects the ETH floor) and for the Pages Function (rejects bad input, idempotent insert, rate limits).

## 15. Rollout and rollback

1. Testnet: deploy Courier, record it in DEPLOYMENTS.md, enable on the testnet keeper, and test end to end with two test accounts.
2. Mainnet: **needs Samuel's go-ahead (real ETH).** The Courier deploy is about 0.9M gas, roughly 0.00002 ETH at today's gas price. Verify on Blockscout, then turn it on with a config flag.
3. **Rollback:** turn the feature off in config (the app hides the toggle; the keeper stops relaying). The contract has no admin, so it can't be paused. Players revoke their allowance from Settings, and an unused Courier holds nothing. A fix means a new Courier at a new address and a new approval.

## 16. Turning fees back into ETH (keeper)

- Fees build up as WIF in the keeper wallet. Swapping every 5 WIF would cost more in gas than it returns.
- The keeper swaps WIF to ETH through the KyberSwap aggregator (the same API the app's Get WIF sheet uses), **only when both** are true:
  - its ETH is below `COURIER_SWAP_BELOW_ETH` (default 0.0005);
  - it holds at least `COURIER_SWAP_MIN_WIF` (default 100).
- It swaps all its WIF minus a small reserve.
- **Safety:**
  - The route's router must be KyberSwap's known router address.
  - The quote's minimum return must be within 3% of the quoted output.
  - The swap is simulated first.
  - At most 1 swap per hour.
  - It's logged; a failure only logs and retries next hour.
- The router approval is set to the exact amount being swapped, not unlimited.
- **Kill switches:**
  - `COURIER_ENABLED=false` stops relaying; the app reads it from the config endpoint and hides the option.
  - `COURIER_MIN_FEE_WIF` raises the fee if the WIF price drops.

## 17. Decisions (Samuel, 2026-11-10)

1. Fee: 5 WIF per send. If WIF's price drops and that's no longer enough, raise the fee or switch it off.
2. The fee goes to the keeper wallet, which pays the gas. It swaps back to ETH in batches of about 100 WIF or more.
3. Approval: 10,000 WIF, topped up when low.
4. Scope: Send WIF only.

> Approved. Build in this order: contract tests, contract, Pages Function, keeper relay, app, testnet run. Mainnet deploy needs Samuel's go-ahead.
