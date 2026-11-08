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
- **Random raid rolls never touch WIF.** They only move leaves, sugar and ants.

---

## ColonyGame

**What it does.** It keeps every colony's state: workers, nest chambers, leaves, sugar, trails, farms, score and timers. It also runs raids. A colony is a locked NFT: it can't be sold or moved to another wallet during a season. Minting at founding is allowed, and the contract never burns. Avenge lets a raided defender raid the winner back (see below).

**Paid actions.** Each one costs WIF, split 70% pot / 20% burned / 10% treasury.

| Action | Launch price | Rule |
| --- | --- | --- |
| Found a colony | 1,500 WIF (1,200 with a Voter's Pass) | One living colony per wallet. You may found again after a collapse (and pay again). |
| Feed the colony (`feedQueen`) | 100 WIF (80 with a Voter's Pass) + 3 leaves | At most once per 24 h. The queen eats 3 leaves, every ant eats 1 sugar (ants without sugar die), and what sugar is left hatches new ants at 2 sugar each. Grows the colony and adds score. Works while a raid marches on you: the queen's leaves and the ants' meal ignore the raid lock, but new ants only hatch from unlocked sugar. |
| Speed up a hand forage | 300 WIF | Once per 24 h for leaves, once for sugar. Collects any waiting trips of that kind plus one more trip. |
| Shield | 1,000 WIF | No new raids against you for 8 h, at most once per 24 h. |
| Revive a starving queen | 2,000 + 20 per worker | Only in the 24 h after the queen has gone 72 h unfed. |

**Free actions.** `tend` (collect hand forage trips and trail/farm output in one go), `digChamber`, `buildTrail`, `buildFarm` and `assignWorkers` (paid in leaves and sugar, never below the raid lock), plus the raid actions. Build costs grow with the colony from a base the owner can tune within 0.25× to 4× of launch (chamber 10 leaves, trail 50 leaves, farm 40 leaves, and from the second farm on 25 sugar as well; the first farm costs no sugar). Changing a base only changes how many leaves and sugar a building takes; it can never touch WIF.

**Gathering.**
- **Trails and farms:** each assigned ant earns 2 a day (23,148 per second in 1e-9 units), accrued every second and spendable at once.
- **Hand forage:** a leaf trip every 6 h brings 6 plus 0.5 per free ant, and a sugar trip every 3 h brings 4 plus 0.3 per free ant, both rounded up. Only the first 30 free ants count.
- **Missed trips wait:** up to 2 of each kind stack. A partly grown trip keeps its progress unless the bank was full. The first trip after founding is ready at once.

Prices are set in WIF and the owner can tune them within the caps below, so they are likely to change as the WIF price moves.

**Voter's Pass.** A wallet that has voted in a World is Fair event gets a discount on founding and feeding: 20% at launch, adjustable from 0 to 30%. Nothing else is discounted, and the pass doesn't affect score or pot share. The 70/20/10 split applies to the discounted amount.

- **The voter list.** The keeper indexes every address that sent at least 1 WIF to a candidate's vote wallet, publishes the full list at [keeper.c0lony.xyz/voters/voters.json](https://keeper.c0lony.xyz/voters/voters.json), and posts its Merkle root onchain (`setVoterRoot`).
- **Playing from the wallet that voted.** The player passes their Merkle proof once, with `foundColony` or `feedQueen`. The contract checks it against the root using the caller's own address, sets `hasVoterPass` permanently, and never needs a proof again. No proof, or a wrong one, just means full price; it never reverts.
- **Playing from a different wallet** (for example, a game wallet created in the app). The player signs a message with the wallet that voted, saying "give my pass to this game wallet", and the game wallet calls `claimVoterPass(voterAddress, proof, signature)`. The contract checks:
  1. the voting address is on the list (Merkle proof);
  2. the signature really comes from the voting address (EIP-712 typed data: domain "C0LONY", version 1, this chain and this contract; message `LinkVoterPass(gameWallet, nonce)`). Smart-contract wallets can sign too (ERC-1271);
  3. the signature names the wallet that is calling;
  4. this voting address hasn't granted its pass before.

  If all pass, the game wallet gets the pass permanently and `VoterPassLinked(voter, gameWallet)` is emitted. Anything wrong reverts with a clear error.
- **One pass per vote.** Each voting address can grant the pass to exactly one wallet, either itself (by playing directly) or one game wallet. `voterUsed(voter)` shows which.

**Raids, step by step.**

1. **Seal.** `launchRaid`: the raider picks a target colony and submits a hash of the secret target resource. The app also sends the target and its secret salt locked with drand timelock encryption to a drand quicknet round that comes after the guard window, and the contract publishes that locked message in a `RaidSealed` event (at most 1,024 bytes, or the call reverts with `SealedTooLong`; empty means "I'll reveal by hand"). Every free (idle) ant marches, and the call reverts with `NoFreeAnts` if there are none. Nobody can read the target from the hash. At launch the defender's trail and farm output is accrued and 60% of their leaves and of their sugar is locked, so builds cannot dip below that (`StockLocked`). The lock is released when the raid settles or is collected. It never blocks feeding. You cannot launch (or avenge) while a raid is marching on your own colony (`UnderAttack`), and a colony can face only one raid at a time.
2. **Guard.** `guard`: within 4 h, the defender may guess and guard one resource.
3. **Reveal.** `reveal`: within the next 24 h, anyone who knows the target and salt reveals it. Normally that is the keeper: once the quicknet round is out it can open the locked message, and nobody could before. The raider can also reveal by hand. The contract checks it matches the hash, then fixes a future drand round, the first one at least 30 s later. The outcome comes from `rand = keccak256(signature, raidId)`. There are no win odds. With no guard the raider wins and takes a random 30-60% of the target resource. A guard on the other resource still lets the raider win and take 45-60%, so guessing wrong is worse than not guarding. A guard on the target resource fails the raid: the raider loses 25% of the marching ants (rounded down) and the defender takes 10-15% of a random resource from the raider. The share is `lo + (rand % 1000) % (60 - lo + 1)`, and the `RaidSettled` event's `roll` field is that percentage. Loot is capped at 8 per marching ant.
4. **Settle.** `settle`: once that round is published, anyone submits its signature. The contract checks the signature is genuine for exactly that round, then derives the outcome from it.
5. **Collect.** `collect`: anyone can close a raid that ended without a roll. If the raid was never revealed (by the keeper or the raider), every marching ant is lost. If nobody settled within 48 h of the round, the ants come home. Either way the defender's lock is released.

**Avenge.** When a raid settles with the raider winning, the defender's wallet gets one free raid back at the raider's wallet for 24 h (`AvengeGranted` is emitted). It is not granted if the raider loses or the raid was guarded.
- `avenge(raider, commitment, sealedTarget)` works exactly like `launchRaid` against the raider's current colony: all free ants march, same range, shield, guard window, reveal and drand settle, and no bonus. The differences are that it neither needs nor restarts the caller's raid cooldown, and it ignores the target's 12 h raid protection. It is still blocked by a shield, by the one-raid-at-a-time rule and by `UnderAttack`.
- The grant is used once. It is deleted when `avenge` is called, so a second call reverts with `NoAvenge`.
- A new win by the same raider over the same defender refreshes the expiry to 24 h from that settle.
- If an `avenge` attempt reverts (for example the target is shielded), the grant is kept.
- `avengeAvailable(defender, raider)` shows whether a grant is live and when it ends. `RaidLaunched` has an `isAvenge` flag.
- Avenge never moves WIF. Like any raid, it only moves leaves, sugar and ants.

**Events and profiles.** Player events now name the colony owner's wallet (for example `Paid`, `ColonyFounded`, `QueenFed`, `Built`, `RaidLaunched`, `RaidSettled`), so the live feed needs no extra reads. `RaidLaunched` still keeps the target resource sealed. `getProfile(address)` returns a whole profile in one call (it now also gives `raidableAt`, `nextRaidAt`, `lockedLeaves`, `lockedSugar`, `leafTrip` and `sugarTrip`; `raidableAt(colonyId)` is also a view of its own): ants, capacity, buildings, assignments, free ants, leaves and sugar (including trail and farm output not yet collected), score, founding time and day, raid record, fed-until time, shield time and Voter's Pass. Each colony counts `raidsWon` and `raidsLost` (as raider) and `raidsFaced` and `raidsDefended` (as defender), only for settled raids. `seasonDay(season, timestamp)` gives the day of the season.

**Who can call what.**

| Function | Who |
| --- | --- |
| `foundColony`, `tend`, `feedQueen`, building, `assignWorkers`, `speedUp`, `revive`, `shield`, `launchRaid` | Any wallet, acting on its own colony |
| `avenge` | Only a wallet holding a live grant against that exact raider, acting on its own colony |
| `guard` | Only the defending colony's owner |
| `reveal` | Anyone holding the target and salt that match the raid's hash: the keeper once the timelock opens, or the raider |
| `settle`, `collect`, `pokeCollapse` | Anyone (the outcome can't be influenced) |
| `setConfig`, `setCurrentSeasonEnd`, `setVoterRootSetter` | Owner only, within hard caps |
| `setVoterRoot` | The owner, or the voter-root setter (the keeper) |
| `claimVoterPass` | Any wallet, with a signature from a voting address naming that wallet |
| `avengeAvailable`, `getProfile`, `seasonDay` | Anyone (read-only views) |
| `setName` | Any player with a colony this season, for their own wallet only. 3 to 16 characters (a to z, 0 to 9, _), unique across players, changeable once per 21 days. Costs gas only, no WIF. |
| `tokenURI`, `nameOf`, `nameHolder`, `nameSetAt` | Anyone (read-only). `tokenURI` builds the colony NFT's name, picture and stats onchain, so nothing is hosted elsewhere. |
| `unlockSeasonNfts` | Owner only, and it always reverts (`NotYetAvailable`). A placeholder for the post-hackathon Season NFTs in [ROADMAP.md](ROADMAP.md). It cannot unlock anything. |

**What the owner can change, and the limits.**
- **Prices and cooldowns:** between ¼ and 4× their launch values. This includes the raider cooldown (12 h at launch) and `raidProtection` (12 h at launch).
- **Guard window:** between 1 and 8 hours.
- **Season length:** between 1 and 21 days. The current season's end can be moved, but only to a time in the future and no later than 21 days after the season started.
- **Fixed in code, so the owner can never use them to hurt players:** the 72 h starvation timer, the 24 h revive window, the 48 h settle timeout and the 30 s randomness delay.

Every change emits an event (`ConfigUpdated`, `SeasonEndChanged`) that anyone can watch.

**What an attacker would try, and why it fails.**
- **Use someone else's Voter's Pass proof.** On the direct path the leaf is built from the caller's own address, so another wallet's proof doesn't verify. On the linking path, the proof alone isn't enough: the voting wallet must also sign, and only its owner can.
- **Copy a voter's link signature for another wallet.** The signature names the game wallet; any other caller fails the check.
- **Replay a link signature, or spread one vote across several wallets.** After a voting address grants its pass once (by linking or by playing directly) it is marked as used, and every further claim with it reverts. The signature also includes a nonce and is tied to this contract on this chain, so it can't be reused elsewhere.
- **Post a fake voter root.** Only the owner or the voter-root setter can change it, every change emits `VoterRootUpdated`, and the published list lets anyone rebuild and check the root. At worst, a bad root hands out a discount of up to 30% on two actions; it can never move pot money.
- **Predict or grind a raid's outcome.** The roll comes from a drand round that's fixed at reveal and lies in the future, so nobody knows its signature in advance. Each round has exactly one valid signature, so a settler can't pick between outcomes.
- **Submit a fake or recycled signature.** `settle` verifies the BLS signature against drand's public key for exactly the assigned round. A wrong signature, or a real one from a different round, reverts.
- **Read the target and guard it perfectly.** The target is only a hash until the guard window closes.
- **Back out of a bad raid.** Not revealing loses every marching ant, which is worse than losing (a failed raid costs only 25%).
- **Reveal a raid with the wrong target, or reveal someone else's raid early.** A reveal only counts if it matches the hash the raider posted, so a wrong target or salt reverts (`BadCommitment`), and nobody can reveal before the guard window closes (`GuardWindowOpen`). Opening anyone's raid on someone else's behalf changes nothing: the target was fixed at launch.
- **Read the target early from the timelocked message.** It is locked to a drand round after the guard window, and opening it needs that round's signature, which doesn't exist yet. The app picks the round from the chain's own clock plus 2 minutes, so a wrong phone clock can't open it early. A raider who deliberately locks it to an earlier round only hurts themselves.
- **Lock garbage so the raid can never reveal, then reveal by hand only if it's going well.** The drand round for the roll is fixed at reveal, after the target is already known, so waiting gains nothing. And an unrevealed raid loses every marching ant.
- **Trap a colony with the raid lock.** The lock covers 60% of leaves and sugar, never more, feeding ignores it, and it clears on settle or collect, including the 48 h timeout path. One raid at a time stops locks stacking.
- **Spam raids.** Each colony can launch one normal raid per 12 h (avenge raids skip this cooldown, but each needs a live grant from a raid you lost), a target can face only 1 open raid, no normal raid can be launched on a colony for 12 h after the last one (so at most twice a day, three times with an Avenge), you cannot launch while a raid marches on you, and you must close your finished raids before launching another. `raidableAt(colonyId)` shows the later of shield end and protection end.
- **Take someone's name, or squat names.** Names are unique and first come, first served. Only the wallet itself can set its own name, so nobody can rename another player. Setting a name needs a colony this season (which costs a founding fee), and each wallet holds one name and can change it only once every 21 days, so squatting many names costs a colony per name.
- **Break the NFT picture or the app with a crafted name.** Names only allow a to z, 0 to 9 and _, so they can't carry quotes, markup or script into the onchain JSON or SVG.
- **Transfer a colony to dodge the one-per-wallet rule.** Colony NFTs can't be transferred between wallets.
- **Use avenge against someone else.** It fails. The grant is stored for the exact pair of wallets (defender, raider), so `avenge` against any other wallet reverts with `NoAvenge`.
- **Farm score by trading avenge raids with a friend.** Each avenge raid still needs the 4 h guard window, a reveal, a drand roll, the one-raid-at-a-time rule, the 12 h cooldown on the grant holder's own normal raids and the collect-first rule. It is slower than normal raiding, and a raid win is worth the same +25 as any other. Each avenge also needs a fresh win by the other side, and expires after 24 h.
- **Unlock NFTs mid-season to sell pot entries.** `unlockSeasonNfts` is a placeholder that always reverts, and transfers between wallets revert in the token code itself. No call can change that.

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
| Settlement refund | Most of the settler's gas: 90% of the execution gas the contract measures × gas price, plus the exact L1 data fee read from Arbitrum's ArbGasInfo. Always a little under the real cost, never over. | At most 0.00005 ETH per raid |

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
