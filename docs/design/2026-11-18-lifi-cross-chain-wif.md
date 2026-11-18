# Design: get WIF with USDC, USDT or ETH from other chains (LI.FI API)

- **Date:** 2026-11-18
- **Tier:** 3. Players move real funds through a third party's contracts on ten chains.
- **Goal:** a player holding USDC, USDT/USDT0 or ETH on another chain gets WIF in their C0LONY wallet on Robinhood Chain in one flow, inside the app, in the C0LONY look.
- **Contracts:** none of ours change. Routes run through LI.FI's own contracts. No fee is charged by C0LONY for now.
- **Status:** approved by Samuel on 2026-11-18 with his token list (gas tokens instead of wrapped ETH). Solana follows as a second step.

## 1. What was checked (2026-11-18, read-only)

- LI.FI lists Robinhood Chain (4663) and our WIF (`0x5173…4773`).
- Every pair below returned a live quote into WIF, about 10,000–11,200 WIF for $10 at about $0.03–$0.24 in route fees and under 10 s (mostly the Relay bridge, some Layerswap or LI.FI Intents).
- Every EVM quote's approval address and transaction target were the same contract per chain (LI.FI's diamond), so the app can pin one address per chain.

| Chain (id) | Tokens offered | Gas the player needs there |
| --- | --- | --- |
| Ethereum (1) | ETH, USDC, USDT | ETH |
| Base (8453) | ETH, USDC | ETH |
| Arbitrum (42161) | ETH, USDC, USDT0 | ETH |
| Optimism (10) | ETH, USDC, USDT0 | ETH |
| Unichain (130) | ETH, USDC, USDT0 | ETH |
| BSC (56) | BNB, USDC, USDT | BNB |
| Monad (143) | MON, USDC, USDT0 | MON |
| HyperEVM (999) | HYPE, USDC, USDT0 | HYPE |
| Arc (5042) | USDC (also the gas token) | USDC |
| Solana | USDC, USDT, SOL (second step, see section 5) | SOL |

Each chain offers its own gas token (ETH, BNB, MON, HYPE, USDC on Arc) plus USDC and the USDT that chain actually uses (USDT0 where it is the standard; Base has neither). Samuel's choice, 2026-11-18. The LI.FI contract pinned per chain matches LI.FI's published deployments (github.com/lifinance/contracts, `deployments/<chain>.json`, LiFiDiamond), checked 2026-11-18.

Token addresses come from LI.FI's token list and are pinned in `web/src/config.ts`. On chains without native ETH, "ETH" is the bridged or wrapped version LI.FI routes, named honestly in the picker.

## 2. Architecture

```
GetWifSheet (existing)
 ├─ "With ETH on Robinhood Chain"  (KyberSwap, unchanged)
 └─ "From another chain"  ← new
      │  pick chain + token, amount
      ▼
 lib/lifi.ts
   quote():   GET li.quest/v1/quote  (fromChain, fromToken, fromAmount, fromAddress = player,
                                      toChain 4663, toToken WIF, toAddress = player, slippage 1%, integrator "c0lony")
   check():   refuse unless toChain 4663, toToken WIF, toAddress = player, tx.to and approval = pinned contract for that chain
   send():    wallet.switchChain(source) → approve exactly fromAmount if short → send LI.FI's tx
   track():   GET li.quest/v1/status?txHash&fromChain&toChain every 5 s until DONE / FAILED (max 30 min)
      │
      ▼
 WIF arrives on Robinhood Chain at the player's own address; the app switches the wallet back to Robinhood Chain.
```

- **Data owners:** LI.FI owns routes and status. The browser keeps only an in-flight transfer (tx hash, chains, amounts) in localStorage so a reload resumes tracking. No server or database changes.
- **Embedded (Privy) wallets:** the same address exists on every EVM chain. The sheet shows "Send USDC on Base to your C0LONY address first" with a copy button, then the swap works from it. Privy's `supportedChains` gains the nine EVM chains.

## 3. Failure handling

| Case | What happens |
| --- | --- |
| No route / LI.FI down | "No route right now" under the button; nothing sent |
| Quote changed or older than 30 s | Re-quoted right before sending; the player confirms the new minimum |
| Wallet refuses the chain switch | Stops with "Switch your wallet to <chain> and try again" |
| Approval or send fails | Nothing moved (or only the approval); plain reason, as elsewhere |
| Bridge slow | "On its way · usually under a minute", tracking continues after a reload |
| Bridge FAILED / REFUNDED | Shows LI.FI's status and where the funds went back (source chain), with explorer links |
| Same send twice | The button is locked while a transfer is in flight; the in-flight record is keyed by tx hash |

## 4. Security

- The app only ever approves or calls the pinned LI.FI contract for that chain (allowlist in config), and approves exactly the amount, never unlimited.
- Every quote is checked before signing: destination chain 4663, destination token WIF, recipient = the player's own address. Anything else is refused.
- Minimum received (after 1% slippage) is shown before signing.
- No keys, no server, no fees. LI.FI's public API, called from the browser with a 15 s timeout.

## 5. Solana

Solana needs a Solana wallet (Phantom, Solflare) to sign, which the app doesn't connect today: it means turning on Privy's Solana wallets and adding Solana packages (`@solana/kit` and its helpers; a package install). The route itself works (quotes checked). Plan: ship the nine EVM chains first, then Solana as a second step once the install is approved.

## 6. Tests

- Unit: the quote check refuses a wrong destination chain, token, recipient or contract; the exact-amount approval; status mapping (PENDING, DONE, FAILED, REFUNDED).
- Live: one small transfer (about $2 of USDC on Base) from Samuel's wallet into WIF, checked arriving on Robinhood Chain. Needs Samuel's go-ahead (real funds).

## 7. Rollback

Remove the "From another chain" tab (one flag in config). Nothing on chain to undo.
