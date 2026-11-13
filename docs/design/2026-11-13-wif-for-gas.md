# Design: swap WIF for gas when a player runs out (Courier)

- **Date:** 2026-11-13
- **Tier:** 3. The keeper sends real ETH to players in exchange for WIF.
- **Goal:** a player whose wallet has run out of ETH can keep playing by paying WIF. They sign one message; the keeper takes the WIF through the existing Courier and sends a small pack of ETH back. The offer only appears when the wallet is short on gas.
- **Contracts:** none changed, nothing redeployed. It reuses the deployed Courier (`0xABD0…bE31` mainnet) and the keeper's existing starter-gas sender and fee swap.
- **Status:** approved by Samuel on 2026-11-13, with one addition: the player can decline the offer ("No thanks" hides it for a day on that device). Built; on for testnet, off on mainnet until `GAS_PACK_ENABLED=true` is set there.

## 0. Why this shape

ColonyGame treats the transaction sender as the player, so the keeper can't send raids or feeds for anyone without redeploying the game. Instead of relaying game calls, we give the player ETH, and they send everything normally. The Courier already moves WIF from a player with only a signature, and the keeper already sends ETH (starter gas) and turns WIF back into ETH (fee swap), so every part exists.

## 1. Flow

```
 App (only when the wallet can't afford a heavy action)
  │ "Out of gas · Swap 207 WIF for gas"
  │
  ├─(a) if the Courier is not approved and the wallet can't pay for the approval:
  │      POST /api/gas/approval  ──▶ D1 gas_requests (kind 'approval') ──▶ keeper sends 0.000005 ETH, once per wallet ever
  │      then the app sends approve(Courier, 10,000 WIF) as a normal transaction
  │
  ├─(b) sign a Courier "Send": to = keeper wallet, amount = pack price, fee = 5 WIF, feeTo = keeper
  │      POST /api/courier  { ..., purpose: "gas" } ──▶ D1 courier_requests (purpose 'gas')
  │
  ▼
 Keeper relay loop
   1. re-checks: price still matches the posted quote (or better for the player), player ETH still short,
      keeper ETH >= floor + pack + gas, daily caps
   2. relays Courier.send (WIF: player -> keeper)           ← state "sending", then tx hash, as today
   3. on success: records "owed <pack> ETH to <player>" BEFORE sending, then sends the ETH
   4. reports done with both tx hashes; the app shows "Gas topped up"
 Keeper fee swap (existing): when keeper ETH is low and WIF has built up, swaps WIF -> ETH on KyberSwap
```

## 2. Numbers (to approve)

| Setting | Proposed | Notes |
| --- | --- | --- |
| Pack size | **0.0001 ETH** | about 14 raids, or about 50 tends or builds. Live quote 2026-11-13: 0.0001 ETH ≈ 188 WIF ≈ $0.20 |
| Pack price | KyberSwap quote ETH→WIF for the pack, **+10%**, rounded up to a whole WIF | about 208 WIF today. The 10% covers the keeper's two transactions and the swap back. Refreshed every 10 min and posted in the heartbeat |
| Courier fee | 5 WIF (unchanged) | |
| Price sanity bounds | refuse to quote below 50 or above 1,000 WIF per pack | guards against a broken quote |
| Who can buy | a wallet with a living colony this season whose ETH is below one heavy action (400k gas at current price) | keeper re-checks at relay time |
| Per wallet | 1 pack per 24 h | |
| Network cap | 15 packs per day | about 0.0015 ETH a day at most |
| Keeper floor | keeper keeps ≥ 0.0005 ETH after the pack | otherwise the offer is hidden |
| Approval drip | 0.000005 ETH, **once per wallet ever**, only for the embedded wallet C0LONY made, only if the Courier isn't approved and the wallet can't pay for an approval | needed because $WIF has no `permit` |

## 3. Where WIF and ETH move

- **WIF in:** player → keeper wallet, only through `Courier.send` with the player's own signature, exactly the signed amount and fee, once (nonce), before the signed deadline.
- **ETH out:** keeper → player, only after that send has landed, exactly the pack size, once per request id.
- **Approval drip ETH out:** keeper → player, once per wallet ever.
- **WIF back to ETH:** the existing fee swap (KyberSwap, router allowlist, 97% minimum output, hourly at most).
- Nothing touches the season pot, the treasury or ColonyGame.

## 4. Failure handling and idempotency

| Case | What happens |
| --- | --- |
| Relay of the WIF send fails | No WIF moved, no ETH sent. Reported failed with a reason, as today |
| WIF landed, ETH send fails or the keeper restarts | The "owed" record is written before the ETH leaves; on restart the keeper follows its tx hash or re-sends exactly once; it is retried until paid and alerts if it stays unpaid for 10 min |
| Keeper ETH runs low mid-day | The heartbeat stops advertising packs; queued gas requests are refused **before** relaying, so no WIF is taken |
| Price moves between quote and relay | The player signs the exact WIF amount; the keeper relays only if that amount is still ≥ 95% of the current price, otherwise refuses before taking anything ("price changed, try again") |
| Same request twice | Request id = the EIP-712 digest; the Courier nonce blocks a second execution; the "owed" record is keyed by the id |
| Approval drip farmed by new wallets | Embedded wallets only, once per wallet, and only when the Courier isn't approved; the same daily cap as starter gas (25) |

## 5. Security

- The app's API only accepts `purpose: "gas"` sends whose `to` and `feeTo` are the live keeper wallet and whose amount is at least the posted price; the keeper re-checks everything.
- The keeper never sends ETH to anyone but the signer of a landed send (or an approval-drip wallet).
- Caps (per wallet, per network, keeper floor) are enforced in both the API and the keeper.
- The RPC URL and keys stay in env files; logs print short messages only.

## 6. App changes (subtle, only when short on gas)

- When an action fails because the wallet is out of gas (or the app sees the wallet can't afford a heavy action), the failure line reads: "Your free starter gas has run out, so your wallet has no ETH left to pay for this." and adds one link: **"Swap 207 WIF for gas"** (gold, because it spends WIF).
- The offer sits inside that failure pop-up: what you pay (WIF + fee), what you get (0.0001 ETH, about N raids at today's gas price), a gold **Swap** button and a **No thanks** button. "No thanks" hides the offer on that device for 24 hours. Pending, success and failure states show under the button, with an explorer link for the top-up.
- Nothing appears for wallets that have gas. No new tab, no banner.

## 7. Tests

- Keeper: price bounds; refuse when the player has gas; refuse when keeper is under floor (no WIF taken); owed ETH paid exactly once across a simulated restart; network and per-wallet caps; approval drip once per wallet.
- API: rejects a gas send to any other `to`/`feeTo`, below the posted price, or over the caps.
- Testnet end to end first (mock WIF, testnet Courier), then mainnet keeper config with Samuel's go-ahead.

## 8. Rollback

Set `GAS_PACK_ENABLED=false` on the keeper and rebuild it: the heartbeat stops advertising packs and the app hides the offer. No contract to undo.

## 9. Rollout

1. Run `web/functions/sql/gaspack.sql` in the D1 console of **both** app databases (testnet and mainnet) **before** pushing: the new API code reads the new columns.
2. Push. Both app sites redeploy.
3. Rebuild the testnet keeper; buy a pack end to end on test.c0lony.xyz.
4. With Samuel's go-ahead: set `GAS_PACK_ENABLED=true` (and consider `COURIER_SWAP_BELOW_ETH=0.001`, so the fee swap refills ETH before packs pause at the 0.0005 floor) in the mainnet keeper env and rebuild it.
