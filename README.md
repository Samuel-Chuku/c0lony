<p align="center"><img src="web/public/logo.svg" width="488" alt="C0LONY"></p>

<p align="center"><b>An onchain ant-colony strategy game on Robinhood Chain, played and paid in $WIF.</b></p>

<p align="center">
  <a href="https://c0lony.xyz">c0lony.xyz</a> (landing) ·
  <a href="https://app.c0lony.xyz">app.c0lony.xyz</a> (the game)
</p>

> The "0" in C0LONY is a zero, not the letter O. In URLs it is lowercase: `c0lony`.

Built for the World is Flat hackathon. Every paid action spends WIF, raid outcomes come from drand randomness verified onchain, and the season prize pot can only ever be paid to players.

| Colony | Raids | Live | Raid report |
| --- | --- | --- | --- |
| <img src="docs/screenshots/colony.png" alt="Colony screen"> | <img src="docs/screenshots/raids.png" alt="Raids screen"> | <img src="docs/screenshots/live.png" alt="Live feed"> | <img src="docs/screenshots/report.png" alt="Raid report"> |

_Screenshots are from the Robinhood Chain testnet deployment._

## Contents

[What it is](#what-c0lony-is) · [Why WIF](#why-wif-is-needed) · [Flywheel](#the-flywheel) · [Raids and randomness](#raids-and-randomness) · [Features](#features) · [Voter's Pass](#voters-pass) · [Architecture](#architecture) · [Contracts](#contracts) · [How to play](#how-to-play) · [Testing](#testing) · [After the hackathon](#after-the-hackathon) · [Repo and docs](#repo-layout) · [License](#license)

## What C0LONY is

You run an ant colony. Season 1 ends just before the hackathon final closes, and the keeper closes it and opens claims on its own; later seasons last 10 days by default (35 at most). The daily loop:

1. **Tend** the colony: collect leaves and sugar from forage trips, trails and farms. Every ant on a trail or farm earns 2 a day, and the rest of your ants (the free ones) bring extra on each forage trip.
2. **Feed the colony** (WIF plus 3 leaves for the queen, and every ant eats 1 sugar) at least once every 72 hours or she starves. Each feeding grows the colony and adds score.
3. **Build**: dig chambers, lay leafcutter trails, grow aphid farms, assign workers.
4. **Raid** neighbours for leaves and sugar, and guard against raids on you.
5. **Season end**: the WIF pot is shared among colonies that stayed alive, by score.

Raids never move WIF. They only move leaves, sugar and ants.

**Gathering (launch values).** Trails and farms pay 2 per assigned ant per day, accrued every second and spendable at once. By hand, a leaf trip every 6 h brings 6 plus 0.5 per free ant, and a sugar trip every 3 h brings 4 plus 0.3 per free ant (rounded up, and only the first 30 free ants count). Missed trips wait: up to 2 of each kind stack. Your first trip after founding is ready at once.

## Why WIF is needed

Every paid action costs WIF, and 70% of each payment goes straight into the season pot, so playing grows the prize and the burn.

| Action | Launch price | With Voter's Pass |
| --- | --- | --- |
| Found a colony | 1,500 WIF | 1,200 WIF |
| Feed the queen | 100 WIF | 80 WIF |
| Speed up a hand forage | 300 WIF | Collects any waiting trips plus one more |
| Shield (no new raids for 8 h) | 1,000 WIF | |
| Revive a starving queen | 2,000 WIF + 20 per worker | |

> **Prices are not final.** The owner can tune every price within hard caps in the contract (0.25x to 4x the launch value) and every change emits an event. Expect them to move as the WIF price moves and the game is balanced. The values above are from `ColonyGame.launchConfig()`.

Players without WIF can swap ETH for WIF inside the app (KyberSwap aggregator, `robinhood` route). A 0.5% fee on that swap is paid in ETH to the Treasury.

## The flywheel

```mermaid
flowchart LR
  P[Players] -->|"found, feed, speed-up,<br/>shield, revive (WIF)"| G[ColonyGame]
  G -->|70%| SP[SeasonPot]
  G -->|20%| B[Burned]
  G -->|10%| T[Treasury]
  S[Sponsors] -->|"sponsor(), 100%"| SP
  P -->|"swap ETH to WIF<br/>0.5% fee in ETH"| T
  T -->|"WIF above reserve:<br/>sweepToPot"| SP
  T -->|"gas drips and<br/>settle refunds"| P
  SP -->|"claim at season end"| P
  SP -->|"rollUnclaimed<br/>after 30 days"| SP
```

- **Split:** every WIF payment is split 70% pot, 20% burned (`WIF.burn`), 10% Treasury, in the same transaction. ColonyGame never keeps WIF.
- **Payout:** a colony qualifies if it was fed at least twice and its queen was fed within 72 h of the season end. Half of the pot is shared by score among all qualifying colonies. The other half is shared by score among the top 25% of them.
- **Ranking is checked, not trusted:** anyone (the keeper in practice) submits the ranked list in batches and `SeasonPot` verifies the strict order, so only one correct ranking can be accepted.
- **The owner can withdraw Treasury funds (ETH and WIF), but never pot funds.** Treasury withdrawals emit events. The pot has no owner and no withdraw function: WIF leaves it only through `claim` (to a qualifying player) and `rollUnclaimed` (into a later season's pot, 30 days after payout opens).
- **Sponsors:** anyone can add WIF to the current or a future season's pot, with a name.

## Raids and randomness

A raid is a sealed bet. The raider commits to a target resource without revealing it, the defender may guess and guard, and the outcome is rolled from a public randomness beacon nobody can predict or choose. For the raider it is set and forget: the target is timelocked to a drand round after the guard window, so the raid reveals and rolls without them coming back.

```mermaid
sequenceDiagram
  autonumber
  participant R as Raider
  participant C as ColonyGame
  participant D as Defender
  participant Q as drand quicknet
  participant Dr as drand evmnet
  participant K as Anyone (keeper)
  R->>C: launchRaid(target colony, hash of target + salt, target + salt timelocked)
  Note over C: guard window (4 h at launch)
  D->>C: guard(leaves or sugar)
  Q-->>K: round after the guard window opens the timelock
  K->>C: reveal(target, salt)
  C->>C: check hash, assign first drand round at least 30 s later
  Dr-->>K: round published (BLS signature)
  K->>C: settle(raidId, signature)
  C->>C: verify BLS on BN254 (pairing precompile)
  C->>C: roll = keccak256(signature, raidId)
  C-->>R: loot of leaves or sugar, never WIF
```

- **Sealed target:** the raider submits only a hash. The target is hidden until after the guard window.
- **Reveals itself:** at launch the app also encrypts the target and salt with drand timelock encryption ([tlock](https://github.com/drand/tlock-js), on drand's quicknet network) to a round that comes after the guard window, and posts the ciphertext with the raid. Nobody can read it before that round, the keeper included. After it, anyone can, and the keeper reveals. The contract accepts a reveal from anyone, because the hash already decides what counts. The raider can still reveal by hand. quicknet is used only for this timelock (tlock needs a BLS12-381 network); the roll itself still comes from evmnet and is verified onchain.
- **All free ants march.** There is no soldier picker: every idle ant goes. They still count as workers (housed, fed) while away.
- **No odds, only a guess.** If the defender did not guard, the raider wins and takes a random 30 to 60% of the target resource. If the defender guarded the other resource, the raider still wins and takes 45 to 60%, so a wrong guess is worse than no guard. If the defender guards the right resource, the raid fails: the raider loses 25% of the marching ants (rounded down) and the defender takes 10 to 15% of a random resource from the raider. Loot is capped at 8 per marching ant. Never WIF.
- **Raid lock.** When a raid is launched, 60% of the defender's leaves and sugar are locked until it settles or is collected. Builds cannot dip into the lock, but feeding still works.
- **Limits (launch values).** A raider can launch once per 12 h (Avenge skips this). A colony can face one raid at a time, and after a raid is launched on it, no normal raid can be launched on it for 12 h. So a colony is raided at most twice a day, three times with an Avenge. You cannot launch a raid while one is marching on you.
- **If the raid is never revealed** (no keeper and no raider), every marching ant is lost. **If nobody settles within 48 h of the round,** the ants come home. `collect` closes both cases.

### Why drand evmnet

| Option | Verdict |
| --- | --- |
| `block.prevrandao`, `blockhash`, `block.timestamp` | Not usable. Robinhood Chain docs say `prevrandao` and `block.difficulty` return a constant and `blockhash` should not be used for randomness. |
| Chainlink VRF | Not available on Robinhood Chain, and the bridged route is not free. |
| **drand evmnet** | Free public beacon from the League of Entropy. Its signatures are BLS on BN254, which the chain's pairing precompile (0x08) verifies natively. |

`DrandVerifier` is built on [kevincharm/bls-bn254](https://github.com/kevincharm/bls-bn254). The round is fixed at reveal and lies in the future, and each round has exactly one valid signature, so neither raider, defender nor settler can steer the roll. A wrong signature, or a real one for a different round, reverts (tested against five real evmnet rounds).

### Verify any roll yourself

Every raid report links to its round. The format is:

```
https://api.drand.sh/04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3/public/<round>
```

The `signature` in that response is exactly what was submitted to `settle`. The roll is `keccak256(signature, raidId)`, and the share taken is derived from it as `lo + (roll % 1000) % (60 - lo + 1)` percent (`lo` is 30, 45 or 10 as above), and the raid report shows that percentage. The chain hash is in [`web/src/config.ts`](web/src/config.ts) and [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md).

## Features

- **Avenge:** when a raider beats you, you get one free counter-raid against that wallet for 24 hours. It skips your own raid cooldown (and does not restart it) and the target's 12 h raid protection, and works once. It is not granted if the raid was guarded or the raider lost.
- **Clear in the app:** every transaction button shows a line of pixel ants marching along its edge while the transaction is out. The Raids tab says "You can be raided again in ..." (protection and shield) and shows a red line while a raid marches on you. Neighbour rows show "raid in 3h" and "under raid · busy", and the launch sheet says what your free ants can carry.
- **Locked colony NFT:** each colony is an NFT ("C0LONY" / "C0L") minted at founding. It cannot be transferred during a season, so nobody can buy a way into the pot.
- **Live feed:** the Live tab shows raids, results, new colonies and more in near real time. Sealed targets and guard choices never enter the feed.
- **Push alerts:** opt in per type in Settings.

  | Alert | Trigger |
  | --- | --- |
  | Raided | someone launches a raid on you |
  | Result | one of your raids, or a raid on you, settles |
  | Queen hungry | 12 h and 2 h before she starves |
  | Foragers home | your leaf forage cooldown is over |
  | Avenge ending | your free avenge expires in 2 h |
  | Season ending | 24 h before the season ends |

  On iPhone, push needs the app on the Home Screen (iOS 16.4 or later).
- **Embedded wallets:** sign in with Privy and play from an embedded wallet with no transaction pop-ups. Regular wallets (browser, WalletConnect) also work.
- **X profiles:** link an X account and your handle and avatar show on the leaderboard and feed. The handle is read server-side from your linked Privy account, never typed in.
- **Gas sponsorship** (Treasury, only callable by ColonyGame):

  | What | Amount | Limits |
  | --- | --- | --- |
  | Founder drip | 0.00005 ETH, once per wallet | at most 25 per day |
  | Settle refund | the settler's gas, 90% of measured execution gas plus the L1 data fee | capped at 0.00005 ETH per raid |

  Both pause when paying would leave the Treasury under **0.0003 ETH**. Founding, feeding, speed-ups, shields and revives are never sponsored.

## Voter's Pass

Wallets that voted with WIF in a World is Fair event get 20% off founding and feeding (the discount is adjustable from 0 to 30%). The pass is permanent once set, and does not affect score or pot share.

How to verify the list:

1. Download [voters.json](https://keeper.c0lony.xyz/voters/voters.json): every address that sent at least 1 WIF to a candidate vote wallet (source list in `data/world-is-fair-vote-wallets.json`).
2. Rebuild the tree. The leaf is an OpenZeppelin `StandardMerkleTree` `address` leaf: `keccak256(bytes.concat(keccak256(abi.encode(addr))))`.
3. Compare the root with `ColonyGame.voterRoot()` onchain.

To rebuild with the keeper script (needs the indexed votes): `pnpm voters:build` in `keeper/`, which prints the root and writes `voters.json` and `proofs/<address>.json`. See [keeper/README.md](keeper/README.md).

Playing from a different wallet than the one that voted (for example an embedded wallet): sign an EIP-712 `LinkVoterPass(gameWallet, nonce)` message with the voting wallet, and the game wallet submits it with `claimVoterPass`. Each voting address can grant its pass once.

## Architecture

```mermaid
flowchart TB
  subgraph Chain["Robinhood Chain"]
    CG[ColonyGame<br/>ERC-721, rules, raids]
    SP[SeasonPot]
    TR[Treasury]
    DV[DrandVerifier<br/>linked library]
    CG --> SP
    CG --> TR
    CG --> DV
    TR -.sweepToPot.-> SP
  end
  subgraph Web["Static site + serverless functions"]
    APP[Game app]
    FN["/api functions"]
    D1[("D1: feed, push subscriptions")]
    KV[("KV: X profiles")]
    FN --- D1
    FN --- KV
  end
  subgraph VPS["Keeper (Docker, VPS)"]
    IN[Event intake]
    ST[Auto-settle]
    PU[Push sender]
    VF[Voter's Pass files]
  end
  QN[Quicknode<br/>RPC + Streams]
  DR[drand evmnet API]
  PV[Privy]
  APP -->|reads and txs| CG
  APP --> FN
  APP --- PV
  FN --- PV
  QN -->|events| IN
  IN -->|signed feed batches| FN
  IN --> PU
  PU -->|Web Push| APP
  ST -->|fetch signature| DR
  ST -->|settle, collect| CG
  VF -->|voters.json, proofs| APP
```

- RPC and event indexing run on [Quicknode](https://www.quicknode.com/chains/robinhood): RPC for the app, keeper and deploys, and Quicknode Streams (or an `eth_getLogs` poller as fallback) for events.
- The site is a static export plus serverless functions. The functions hold the live feed (D1 database), X profiles (KV store) and push subscriptions.
- The keeper reveals every timelocked raid once its quicknet round opens it, settles every revealed raid about 60 s after its drand round, closes expired raids with `collect`, feeds events to the app, sends push alerts, and publishes the Voter's Pass files. It stops and logs an alert if its ETH balance falls below `MIN_BALANCE_ETH`, and is safe to restart.
- Anyone can run a settler. `settle` is permissionless and the signature comes straight from drand.

## Contracts

**Robinhood Chain mainnet (4663)**, deployed 2026-11-08, verified on [Sourcify](https://sourcify.dev). Season 1 ends 2026-11-16 07:30 UTC, and its pot was seeded with 10,000 WIF ([sponsor transaction](https://robinhoodchain.blockscout.com/tx/0xc3666a53145323679305726a6708bf06efcf353a40ba3f92456c37d294b1b1ea)). Play at [app.c0lony.xyz](https://app.c0lony.xyz).

| Contract | Address |
| --- | --- |
| ColonyGame | [`0x403988c9cAdE46293a4561ADC6fbb0BDA02647FF`](https://robinhoodchain.blockscout.com/address/0x403988c9cAdE46293a4561ADC6fbb0BDA02647FF) |
| SeasonPot | [`0x74f955C7b01Ad3649d50a93149b9ad9C5594c8b9`](https://robinhoodchain.blockscout.com/address/0x74f955C7b01Ad3649d50a93149b9ad9C5594c8b9) |
| Treasury | [`0x653a93f2018DfcCf6bE8b70d7cA227b27ADE6037`](https://robinhoodchain.blockscout.com/address/0x653a93f2018DfcCf6bE8b70d7cA227b27ADE6037) |
| DrandVerifier (library) | [`0x2513832059bac29e5a5115634694F22B6B302Ae1`](https://robinhoodchain.blockscout.com/address/0x2513832059bac29e5a5115634694F22B6B302Ae1) |
| WIF | [`0x5173b8eA6923c2d40267890D45C46a3480954773`](https://robinhoodchain.blockscout.com/address/0x5173b8eA6923c2d40267890D45C46a3480954773) |

**Robinhood Chain testnet (46630)**, kept running as a free practice game at [test.c0lony.xyz](https://test.c0lony.xyz) (sixth deployment, 2026-11-05, verified on Blockscout):

| Contract | Address |
| --- | --- |
| ColonyGame | [`0x8CCc67AcC8C3Cd70576501bC37a4755C4562504b`](https://explorer.testnet.chain.robinhood.com/address/0x8CCc67AcC8C3Cd70576501bC37a4755C4562504b) |
| SeasonPot | [`0xdD9a1c89455e74106E534AD207CB2e306f271F6f`](https://explorer.testnet.chain.robinhood.com/address/0xdD9a1c89455e74106E534AD207CB2e306f271F6f) |
| Treasury | [`0x98Aa85b93555459Ce4Cc4c1372Be33cD46453411`](https://explorer.testnet.chain.robinhood.com/address/0x98Aa85b93555459Ce4Cc4c1372Be33cD46453411) |
| DrandVerifier (library) | [`0x2513832059bac29e5a5115634694F22B6B302Ae1`](https://explorer.testnet.chain.robinhood.com/address/0x2513832059bac29e5a5115634694F22B6B302Ae1) |
| MockWIF (testnet only) | [`0xC7524F3D78E5f6150aff0Eac811e9Bd0D0Fd9B68`](https://explorer.testnet.chain.robinhood.com/address/0xC7524F3D78E5f6150aff0Eac811e9Bd0D0Fd9B68) |

Sources and checks for every address are in [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md). Plain-English contract guide: [docs/CONTRACTS_EXPLAINED.md](docs/CONTRACTS_EXPLAINED.md). Self-audit: [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md).

## How to play

1. Open [app.c0lony.xyz](https://app.c0lony.xyz) and sign in (or connect a wallet).
2. Get WIF: use **Get WIF** to swap ETH, or bring your own. New wallets get a small gas drip when they found, and a new player's own C0LONY wallet gets a tiny starter top-up before that first transaction.
3. **Found** your colony, then **tend** and **feed** the colony at least every 72 hours.
4. **Build** chambers, trails and farms, and assign workers with the ants slider, which shows live earnings per hour and per day. The first aphid farm costs leaves only (40 at launch).
5. **Raid** a neighbour (all your free ants march), **guard** when you are raided, and **avenge** if you lose. Check the Live tab and claim your share when the season ends.

**Install on a phone:** iPhone Safari: Share, then Add to Home Screen. Android Chrome: menu, then Install app.

## Testing

```bash
cd contracts && forge test            # contracts, incl. real drand rounds and a simulated week
cd keeper && pnpm test                # intake, settle, feed, push, voter files
cd web && pnpm test:functions         # feed and profile functions
cd web && pnpm typecheck && pnpm typecheck:functions
```

The Foundry suite has 159 tests, including fuzzed loot maths and real drand rounds; the keeper has 80 and the serverless functions 32. The economy and raid rules above were added on 2026-11-02, after the recorded seasons below, which ran on the older rules.

Recorded testnet runs with transaction links are in [docs/TESTNET_RUN.md](docs/TESTNET_RUN.md): two full seasons with real drand rounds on the earlier rules, and a set-and-forget raid on the current contracts that the keeper revealed and settled by itself, with the settle gas refund checked against the real receipt.

## After the hackathon

Details in [docs/ROADMAP.md](docs/ROADMAP.md):

- **Season NFTs:** colonies alive at season end unlock as tradable Season NFTs; burn one for a perk next season.
- **In-app WIF marketplace** where sale royalties top up the next pot.
- **Fungus garden** building, weekly neighbourhood standings, more seasons and sponsor tools.

## Repo layout

| Path | What |
| --- | --- |
| `contracts/` | Solidity (Foundry): ColonyGame, SeasonPot, Treasury, DrandVerifier |
| `keeper/` | TypeScript service: event intake, auto-settle, feed, push, Voter's Pass files |
| `web/` | Next.js static export (landing and app from one codebase) and `web/functions` serverless API |
| `data/` | World is Fair candidate vote wallets |
| `docs/` | The documents below |

### Docs

| Doc | Contents |
| --- | --- |
| [CONTRACTS_EXPLAINED.md](docs/CONTRACTS_EXPLAINED.md) | What each contract does, who can call what, attack scenarios |
| [SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md) | Self-audit: risks, mitigations, open items |
| [DEPLOYMENTS.md](docs/DEPLOYMENTS.md) | Addresses, verified chain facts, hosting and backend setup |
| [TESTNET_RUN.md](docs/TESTNET_RUN.md) | Recorded testnet seasons with transaction links |
| [ROADMAP.md](docs/ROADMAP.md) | Season 1 scope and what comes after |

## License

The code is released under the [MIT License](LICENSE), © 2026 Hirving Labs.

The C0LONY name, logo, pixel art and world art are not covered by that license. Please don't use them for other projects or forks.
