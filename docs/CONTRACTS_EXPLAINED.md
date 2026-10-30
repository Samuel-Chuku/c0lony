# C0LONY contracts in plain English

C0LONY runs on four onchain pieces, all on Robinhood Chain:

| Piece | One-line job |
| --- | --- |
| **ColonyGame** | The game itself: colonies, feeding, buildings, raids. Takes every WIF payment and splits it. |
| **SeasonPot** | Holds each season's prize money and pays winners. Nobody can withdraw from it, including the owner. |
| **Treasury** | Holds the 10% cut and a small ETH pool that pays new players' first gas and refunds raid settlement gas. |
| **DrandVerifier** | A library that checks a drand randomness signature is genuine. It holds no money. |

The sections below explain each one: what it does, who can call what, where WIF goes in and out, and what an attacker would try and why it fails.

---

## Where WIF flows

```
player ──pays──▶ ColonyGame ──70%──▶ SeasonPot ──claim──▶ qualifying players
                     │                     ▲  └─rollUnclaimed─▶ a later season's pot
                     ├──20%──▶ burned      │
                     └──10%──▶ Treasury ───┘ sweepToPot (WIF above the reserve)
                                   │
                                   └─▶ owner withdraw (treasury only, emits an event)
sponsors ──sponsor()──▶ SeasonPot (100% to the chosen season)
```

- **WIF never stays in ColonyGame.** Each payment is pulled in and split out within the same transaction.
- **The only ways WIF leaves the pot** are `claim` (to a player with a ranked colony) and `rollUnclaimed` (into a later season's pot).
- **Random raid rolls never touch WIF.** They only move leaves, sugar and soldiers.

---

## ColonyGame

**What it does.** It keeps every colony's state: workers, nest chambers, leaves, sugar, trails, farms, score and timers. It also runs raids. A colony is a non-transferable NFT, so it can't be sold or moved to another wallet.

**Paid actions.** Each one costs WIF, split 70% pot / 20% burned / 10% treasury.

| Action | Launch price | Rule |
| --- | --- | --- |
| Found a colony | 1,500 WIF (1,200 with a Voter's Pass) | One living colony per wallet. You may found again after a collapse (and pay again). |
| Feed the queen | 100 WIF (80 with a Voter's Pass) + 3 leaves | At most once per 24 h. Grows the colony and adds score. |
| Speed up a hand forage | 300 WIF | Once per 24 h for leaves, once for sugar. Collects that forage now. |
| Shield | 1,000 WIF | No new raids against you for 8 h, at most once per 24 h. |
| Revive a starving queen | 2,000 + 20 per worker | Only in the 24 h after the queen has gone 72 h unfed. |

**Free actions.** `tend` (collect hand forages and trail/farm output in one go), `digChamber`, `buildTrail`, `buildFarm` and `assignWorkers` (paid in leaves and sugar), plus the raid actions.

Prices are set in WIF and the owner can tune them within the caps below, so they are likely to change as the WIF price moves.

**Voter's Pass.** A wallet that has voted in a World is Fair event gets a discount on founding and feeding: 20% at launch, adjustable from 0 to 30%. Nothing else is discounted, and the pass doesn't affect score or pot share. The 70/20/10 split applies to the discounted amount.

- **The voter list.** The keeper indexes every address that sent at least 1 WIF to a candidate's vote wallet, publishes the full list as `docs/voters.json`, and posts its Merkle root onchain (`setVoterRoot`).
- **Proving you're on it.** A player passes their Merkle proof once, with `foundColony` or `feedQueen`. The contract checks it against the root using the caller's own address, sets `hasVoterPass` permanently, and never needs a proof again.
- **No proof, or a wrong one,** just means full price. It never reverts.

**Raids, step by step.
1. **Seal.** `launchRaid`: the raider picks a target colony and up to 30% of their idle workers as soldiers, and submits a hash of the secret target resource. Nobody can read the target from the hash.
2. **Guard.** `guard`: within 4 h, the defender may guess and guard one resource.
3. **Reveal.** `reveal`: within the next 24 h, the raider reveals the target. The contract checks it matches the hash, then fixes a future drand round, the first one at least 30 s later.
4. **Settle.** `settle`: once that round is published, anyone submits its signature. The contract checks the signature is genuine for exactly that round, then derives the outcome from it.
5. **Collect.** `collect`: anyone can close a raid that ended without a roll. If the raider never revealed, the soldiers are lost. If nobody settled within 48 h of the round, the soldiers come home.

**Who can call what.**

| Function | Who |
| --- | --- |
| `foundColony`, `tend`, `feedQueen`, building, `assignWorkers`, `speedUp`, `revive`, `shield`, `launchRaid` | Any wallet, acting on its own colony |
| `guard` | Only the defending colony's owner |
| `reveal` | Only the raiding colony's owner |
| `settle`, `collect`, `pokeCollapse` | Anyone (the outcome can't be influenced) |
| `setConfig`, `setCurrentSeasonEnd`, `setVoterRootSetter` | Owner only, within hard caps |
| `setVoterRoot` | The owner, or the voter-root setter (the keeper) |

**What the owner can change, and the limits.**
- **Prices and cooldowns:** between ¼ and 4× their launch values.
- **Raid win odds:** between 50 and 85 out of 100.
- **Guard window:** between 1 and 8 hours.
- **Season length:** between 1 and 21 days. The current season's end can be moved, but only to a time in the future and no later than 21 days after the season started.
- **Fixed in code, so the owner can never use them to hurt players:** the 72 h starvation timer, the 24 h revive window, the 48 h settle timeout and the 30 s randomness delay.

Every change emits an event (`ConfigUpdated`, `SeasonEndChanged`) that anyone can watch.

**What an attacker would try, and why it fails.**
- **Use someone else's Voter's Pass proof.** The leaf is built from the caller's own address, so another wallet's proof doesn't verify.
- **Post a fake voter root.** Only the owner or the voter-root setter can change it, every change emits `VoterRootUpdated`, and the published list lets anyone rebuild and check the root. At worst, a bad root hands out a discount of up to 30% on two actions; it can never move pot money.
- **Predict or grind a raid's outcome.** The roll comes from a drand round that's fixed at reveal and lies in the future, so nobody knows its signature in advance. Each round has exactly one valid signature, so a settler can't pick between outcomes.
- **Submit a fake or recycled signature.** `settle` verifies the BLS signature against drand's public key for exactly the assigned round. A wrong signature, or a real one from a different round, reverts.
- **Read the target and guard it perfectly.** The target is only a hash until the guard window closes.
- **Back out of a bad raid.** Not revealing loses every soldier sent, which is worse than losing.
- **Spam raids.** Each colony can launch one raid per 6 h, a target can face at most 2 open raids, and you must close your finished raids before launching another.
- **Transfer a colony to dodge the one-per-wallet rule.** Colony NFTs can't be transferred.

---

## SeasonPot

**What it does.** Each season has its own pot. When a season ends, half the pot is split by score among all qualifying colonies, and half by score among the top 25% of them (rounded up). A colony qualifies if it was fed at least twice that season and its queen was fed within 72 h of the season's end.

**Money in.**
- The 70% share from ColonyGame (`addFromGame`, ColonyGame only).
- Sponsors via `sponsor(season, amount, name)`, open to anyone, for the current season or a later one.
- Treasury sweeps, which arrive the same way as sponsorships.

**Money out.**
- `claim(season)` pays the caller's share to the caller.
- `rollUnclaimed(season)`: 30 days after a season is finalized, anyone can move what's left into the current season's pot.

There is no other way out.

**Ending a season.**
1. `endSeason`: anyone can call it once the season's end time has passed.
2. `submitRanking`: anyone submits the list of every colony that was fed at least twice, in batches. Qualifying colonies come first, highest score first (ties go to the lower colony number), then the non-qualifying ones by colony number. The contract checks each entry against ColonyGame and checks the order. Because the order is strict, only one list can ever be accepted, so the submitter can't favour anyone. The keeper does this automatically.

**Who can call what.**
- `setGame`: the deployer, once.
- `addFromGame`: ColonyGame only.
- Everything else: anyone.

There is no owner.

**What an attacker would try, and why it fails.**
- **Withdraw the pot.** There is no withdraw function and no owner.
- **Submit a ranking that leaves someone out or reorders them.** The order check rejects any list but the correct one, and the season isn't finalized until every colony that was fed twice has been submitted.
- **Claim twice, or claim for someone else.** Each colony's claim is marked as paid, and claims pay only the caller's own colony.
- **Claim more than the pot.** Shares are computed from the pot and the score totals. Tests confirm the payouts add up to no more than the pot.

---

## Treasury

**What it does.** It holds the 10% WIF cut and an ETH gas pool, which starts at 0.002 ETH and is topped up by the 0.5% fee on in-app swaps. It pays for exactly two things:

| Sponsorship | Amount | Limits |
| --- | --- | --- |
| Founder's gas drip | 0.00005 ETH, sent when a wallet founds its first colony | Once per wallet ever; at most 25 per day |
| Settlement refund | The settler's gas (execution gas × gas price, plus the L1 data fee read from Arbitrum's ArbGasInfo) | At most 0.00005 ETH per raid |

Both pause automatically if paying would leave less than **0.0003 ETH** in the treasury, so the pool can't be drained. Founding, feeding, speed-ups, shields and revives are never sponsored.

**Money in.** The 10% WIF cut from ColonyGame, and ETH sent to it (the starting deposit and swap fees).

**Money out.**
- Drips and refunds, triggered only by ColonyGame.
- `sweepToPot`: anyone can move WIF above the owner-set reserve into next season's pot.
- `withdrawEth` and `withdrawWif`: **the owner can withdraw treasury funds.** This exists so the owner can swap WIF for ETH when the gas pool runs low. Every withdrawal emits an event. The owner has no access to the season pot.

**What an attacker would try, and why it fails.**
- **Call `drip` or `refundSettle` directly.** Only ColonyGame can call them.
- **Farm founder drips with many wallets.** Each drip needs a founding fee of at least 1,200 WIF, which is worth more than the drip, and there are at most 25 drips a day.
- **Farm settlement refunds with a high gas bid.** The refund uses the gas price actually charged; on Robinhood Chain `tx.gasprice` returns the base fee, not the bid, which was checked live. It's capped per raid, each raid settles once, and tests confirm the refund is never more than the gas paid.
- **Drain the ETH pool.** Every payment checks the 0.0003 ETH floor first.

---

## DrandVerifier

**What it does.** It checks that a signature really is drand evmnet's signature for a given round. drand is the free public randomness beacon run by the League of Entropy. The library hashes the round number onto the BN254 curve and runs a pairing check against drand's public key, using the chain's built-in precompiles. The key, genesis time and 3-second period are constants taken from drand's `/info` endpoint.

It's built on kevincharm's open-source [`bls-bn254`](https://github.com/kevincharm/bls-bn254) library, vendored unmodified at a pinned commit. It holds no money and keeps no state.

**Tested against** five real evmnet rounds. It rejects: a real signature for a different round; tampered, negated and out-of-range signatures; wrong-length input; and random data (fuzzed).
