# Security self-review

An honest self-audit of the C0LONY contracts written during the build. It is not a substitute for a professional audit. Each row says what was considered, how the code handles it, and what is left open.

## Money

| Risk | How it's handled | Status |
| --- | --- | --- |
| Owner drains the prize pot | SeasonPot has no owner and no withdrawal function. WIF leaves only through `claim` (to a ranked colony's owner) and `rollUnclaimed` (to a later season's pot). | Closed |
| Owner withdraws treasury funds | Allowed by design (needed to swap WIF for ETH for gas). Every withdrawal emits `EthWithdrawn` / `WifWithdrawn`, and the README says so plainly. | Accepted, disclosed |
| Owner raises prices to extract value | Every price is capped at 4× its launch value (and at least ¼), and changes emit `ConfigUpdated`. Spending only ever goes 70/20/10, never to the owner directly. | Closed |
| Owner retunes build costs | The base costs of chambers, trails and farms are in the same capped config (0.25× to 4× launch, `ConfigUpdated` on every change). They are paid in leaves and sugar, so the worst case is a balance change players can see onchain, never a move of WIF. | Closed |
| Reentrancy on WIF or ETH transfers | `nonReentrant` on every function that moves WIF or ETH, checks-effects-interactions, ETH sent with a 30k gas limit. WIF is a standard OpenZeppelin ERC-20 with no transfer hooks. | Closed |
| Rounding creates or loses WIF | Split: pot gets `amount − burn − treasury`, so the three parts always add up (fuzzed). Payouts round down, so the total paid is ≤ the pot (tested); dust rolls over with unclaimed shares. | Closed |
| Claim twice / claim another's share | Each colony's claim is marked as paid; `claim` pays only the caller's colony for that season. | Closed |
| Random roll moves WIF | Raid resolution touches only leaves, sugar and ants. A fuzz test checks WIF balances are unchanged by any roll. | Closed |

## Ranking and payouts

| Risk | How it's handled | Status |
| --- | --- | --- |
| A submitted ranking leaves someone out or reorders them | Every colony fed at least twice must be submitted. The contract checks the season, the fed-twice flag and a strict descending order on (qualifies, score, −colony ID), so exactly one ordering is valid. The season isn't finalized until the count matches. | Closed |
| Ranking never submitted | Anyone can submit it; the keeper does so automatically. | Depends on keeper liveness (anyone can step in) |
| Score changes after the season ends | Score only changes when feeding, and feeding is blocked once the season is over. Collapse marking only applies to current-season colonies. | Closed |
| Very many colonies make ranking expensive | Submission is batched. Each entry costs about 2 storage writes. | Open (fine at hackathon scale) |

## Randomness

| Risk | How it's handled | Status |
| --- | --- | --- |
| Predicting or grinding the roll | The roll is keccak256(drand signature, raid ID) for a round fixed at reveal and at least 30 s in the future. Nobody, including the owner, knows it in advance. | Closed |
| Choosing among outcomes when settling | Each round has exactly one valid BLS signature, and `settle` verifies it for exactly that round. | Closed |
| Fake or replayed signature | Wrong round, tampered, negated, out-of-range and random signatures all fail (tested with real rounds and fuzzing). | Closed |
| Use of `prevrandao` / `blockhash` / timestamps as randomness | Not used. Timestamps are used only for timers. | Closed |
| drand collusion | Safe as long as a threshold of League of Entropy members don't collude. | Accepted (trust assumption) |
| BLS library bugs | `bls-bn254` has no formal audit. The impact is limited because rolls never move WIF. | Accepted |
| drand stalls | Raids wait; if a round can't be settled within 48 h, `collect` sends the marching ants home with no winner and releases the defender's raid lock. | Closed |
| The losing side withholds settlement, hoping for the 48 h refund | Anyone can settle; the keeper settles every raid about a minute after its round; the collect-first rule blocks both colonies from launching new raids until it's resolved. | Mitigated (relies on the keeper or either player) |

## Raids and game logic

| Risk | How it's handled | Status |
| --- | --- | --- |
| Defender learns the target before guarding | The target is a commitment hash until reveal, and reveal is only allowed after the guard window closes. | Closed |
| Defender reads the timelocked target before guarding | The target and salt are timelocked (drand tlock, quicknet) to a round after the guard window; opening it needs that round's BLS signature, which doesn't exist until then. The app derives the round from the latest block's timestamp plus guard window plus 120 s, not the device clock. Only the raider chooses the round, so an early round only harms themselves. | Closed |
| Anyone can call `reveal` | The `NotRaider` check was removed so the keeper can reveal. A reveal must match the commitment (`BadCommitment` otherwise) and is only allowed after the guard window, so a third party can neither change the target nor reveal early. Revealing twice reverts (`WrongStatus`). | Closed |
| Raider posts a bad timelock, waits for the roll, then reveals by hand only if winning | The evmnet roll round is assigned at reveal (at least 30 s later), so it is unknown when deciding to reveal. A raid that is never revealed loses every marching ant. | Closed |
| Oversized `RaidSealed` data | Capped at 1,024 bytes (`SealedTooLong`); a tlock ciphertext is about 600 bytes. The raider pays for their own calldata. | Closed |
| Commitment brute force | Commitment = keccak256(target, salt, raidId). The salt comes from the raider's wallet signing the raid ID, so it can't be guessed. Raid IDs include the colony number, so commitments can't be replayed across raids. | Closed |
| Raider sees the defender guarded correctly and refuses to reveal | Not revealing loses every marching ant, versus 25% (rounded down) if revealed. The raider can choose this to deny the defender's loot, but it always costs them more ants. | Accepted (a game choice) |
| Farming score with a second colony | Each correctly guarded raid costs the attacking colony 25% of its marching ants and 10–15% of a resource, and every raid sends all free ants, so a colony that keeps losing shrinks out of raid range. The 12 h cooldown and 12 h target protection also cap the rate (a colony is raided at most twice a day, three times with an Avenge).  and every colony costs 1,500 WIF to found (1,200 with a Voter's Pass). | Mitigated |
| Owner starves colonies by changing timers | The starvation timer (72 h), revive window (24 h), settle timeout (48 h) and randomness delay (30 s) are constants. The feed interval can't reach 72 h. | Closed |
| Owner ends a season early | Allowed only to a future time within 21 days of the season start, and emits `SeasonEndChanged`. Ending very early could stop colonies reaching two feedings. | Accepted, disclosed |
| Colony transfer to dodge one-per-wallet | Colony NFTs revert on any transfer between wallets. Mint and burn are allowed, and the contract never burns. | Closed |
| Selling pot entries by moving colony NFTs | Same transfer block. `unlockSeasonNfts` is an owner-only placeholder for the post-hackathon Season NFTs ([ROADMAP.md](ROADMAP.md)). It always reverts with `NotYetAvailable`, so it cannot unlock anything. Real unlocking would need a new, reviewed contract. | Closed (placeholder only, nothing to exploit) |
| Avenge bypasses the raid cooldown and target protection | Scope is narrow. `avenge` skips only the caller's cooldown check and the target's 12 h protection and does not touch `lastRaidLaunch`, so the normal cooldown for `launchRaid` is unchanged. Everything else is shared with `launchRaid` (one internal function): range, shield, open-incoming limit, collect-first, under-attack check, guard window, reveal and drand settle. There is no bonus. | Closed |
| Avenge used against the wrong wallet or twice | The grant is keyed by (defender wallet, raider wallet). It is deleted before the raid is created, so it can't be reused, and it expires after 24 h. A reverted attempt rolls the delete back, so the grant is kept. | Closed |
| Avenge grant across refounding or a season boundary | The grant belongs to wallets, not colonies. `avenge` targets the raider's colony in the current season at call time, so a refounded or new-season colony can be avenged within the 24 h. The cost is at most 24 h of exposure, and the target still needs to be in range and unshielded. | Accepted (bounded to 24 h) |
| Collusion: two friends trading avenge raids to farm score | Every avenge raid still needs a guard window (4 h), a reveal, a drand roll and a settle, within the one-raid-at-a-time rule and the collect-first rule, and the colonies must stay in range. Each grant needs a fresh raider win. A win scores the same +25 as any raid. The only savings are skipping the 12 h launch cooldown and the target's 12 h protection. | Mitigated, not removed |
| No win odds: an unguarded raid always wins | A design choice. The balance comes from the target's 12 h raid protection after any launch, a 12 h raider cooldown, one raid at a time per colony, the 60% lock below, and the cap of 8 loot per marching ant. A defender guessing right fails the raid, and a wrong guess is punished (the raider takes 45-60% instead of 30-60%), so guarding is a real bet. `raidProtection` is owner-tunable only within 0.25x to 4x of its launch value, and the old win-odds settings no longer exist. | Accepted (a game choice) |
| Repeated raids drain a colony | At most one open raid on a colony, no normal raid for 12 h after one is launched (so at most twice a day, three times with an Avenge), loot capped at 8 per marching ant and at 60% of the stock. | Mitigated |
| Raid lock traps a colony or blocks feeding | At launch 60% of the defender's leaves and sugar are locked and builds cannot dip below that (`StockLocked`). Feeding ignores the lock for the queen's leaves and the ants' meal, so a colony can't starve because of it; only new ants hatch from unlocked sugar. The lock is released on `settle` and on `collect`, including the 48 h timeout path, and one raid at a time means locks never stack. A raider cannot launch while a raid marches on them (`UnderAttack`), so a locked colony can't be used to chain-lock others. | Closed |
| Avenge changes raid outcomes or WIF | The roll and loot code are unchanged. Avenge adds only a grant record and counters, and never moves WIF. | Closed |

## Voter's Pass

| Risk | How it's handled | Status |
| --- | --- | --- |
| Using another wallet's proof | The Merkle leaf is built from `msg.sender`, so a proof only works for the address it was made for. | Closed |
| A wrong or malicious voter root | Only the owner or the voter-root setter can post a root, and each change emits `VoterRootUpdated(root, listURI)`. The full list is published so anyone can rebuild and check the root. The impact is capped: at most a 30% discount on founding and feeding, and no effect on score, payouts or the pot. | Mitigated |
| A bad proof blocks play | An empty or invalid proof means full price; `foundColony` and `feedQueen` never revert because of a proof. | Closed |
| Leaf/inner-node confusion | Leaves are double-hashed (OpenZeppelin StandardMerkleTree format), so an internal node can't pass as a leaf. | Closed |
| The pass outlives the list | By design, the pass is permanent once granted, even if a later root drops the address. | Accepted |
| Stealing a pass through the linking path | `claimVoterPass` needs the Merkle proof and an EIP-712 signature from the voting address naming the caller as the game wallet. A wrong signer, a signature for a different wallet, and a stale nonce all revert (tested). | Closed |
| Replaying a link signature / one vote, many wallets | `voterUsed[voter]` is set on the first grant (linking or direct play) and every later claim with that voter reverts; the direct path then gives no discount. The nonce and the EIP-712 domain (name, version, chain, contract) stop reuse on other contracts or chains. | Closed |
| A game wallet burning several voters' grants | A wallet that already has the pass can't claim again (`AlreadyHasPass`), so a voter's one grant isn't wasted. | Closed |
| Smart-contract voting wallets | Accepted through ERC-1271 (OpenZeppelin `SignatureChecker`). The wallet contract decides what counts as a valid signature, as with any ERC-1271 signer. | Accepted |
| A single-voter list | With exactly one voter the valid proof is empty, which the contract treats as "no proof". Irrelevant at the real list size. | Accepted |

## Gas sponsorship

| Risk | How it's handled | Status |
| --- | --- | --- |
| Draining the ETH pool | Drips and refunds both stop when paying would leave less than 0.0003 ETH. | Closed |
| Drip farming | Once per wallet ever, 25 per day, and each requires a founding fee of at least 1,200 WIF, worth more than the 0.00005 ETH drip. | Closed |
| Refund exceeds gas paid | The refund is 90% of settle's own measured execution gas × `tx.gasprice`, plus the exact L1 fee from ArbGasInfo, capped at 0.00005 ETH. On Robinhood Chain `tx.gasprice` returns the base fee, not the sender's bid (checked live), so bidding high doesn't raise the refund. The first testnet run used a fixed overhead allowance instead and refunded 106% of the real cost; that was fixed (see [TESTNET_RUN.md](TESTNET_RUN.md)). On that real receipt the new formula pays about 90%. | Closed (recheck after the next testnet deploy) |
| Treasury reverts break gameplay | ColonyGame calls the treasury in `try/catch`, and the treasury skips instead of reverting, so founding and settling always work. | Closed |
| ArbGasInfo missing or failing | Read with a low-level call; if it fails, the L1 fee counts as 0 (under-refund, never over). | Closed |

## Chain-specific

| Risk | How it's handled | Status |
| --- | --- | --- |
| `block.number` is an L1 estimate on Robinhood Chain | Not used. | Closed |
| Contract size above 24 KB | ColonyGame is about 26 KB. Robinhood Chain accepts contracts up to at least 64 KB (checked live with `eth_estimateGas` on both networks). | Accepted, documented |
| Long idle period makes the next transaction expensive | Seasons are created lazily, one loop iteration per missed season. Even a year of 1-day seasons stays within block limits. | Accepted |

## Alerts (off chain)

| Risk | How it's handled | Status |
| --- | --- | --- |
| Someone links your wallet to their Telegram | A link code is only made for a wallet the signed-in player owns (checked against their Privy account), lasts 15 minutes, works once, and only in a private chat with the bot. | Closed |
| Forged messages to the bot's webhook | Telegram sends a secret header set with `setWebhook`; requests without it are refused. | Closed |
| Bot token leaks | It lives only in the app's encrypted secrets and the keeper's `.env`, never in the site or the repo. Logs never print it. | Closed |
| Alerts reveal a sealed target | Alerts are built from the public feed, which strips targets and guard choices until the reveal. | Closed |
| Spam to a player | The bot only messages chats that linked themselves, honours each chat's switches, `/stop` unlinks every wallet, and chats that block the bot are removed. | Closed |

## Settle gas

`settle` itself measures 314,958 gas in Foundry (`test_gas_settle` logs the call alone; the whole test, setup included, is 511,644 in `.gas-snapshot`). The earlier 512k figure was that whole-test number, so the two are not a like-for-like drop. The refund cap of 0.00005 ETH is unchanged and the refund is still computed from measured gas, so it can't exceed the real cost. If the cap is below the real cost of a settle, the settler covers the difference.

## Left open

- No external audit.
- Auto-reveal depends on the keeper and on drand quicknet being reachable. If either is down past the 24 h reveal window and the raider does not reveal by hand, the marching ants are lost. The app offers a by-hand Reveal 15 minutes after the guard window if the raid has not revealed itself.
- The keeper pays reveal gas from its own float (not refunded by the treasury, which only refunds `settle`).
- Ranking gas grows linearly with the number of colonies that were fed twice. That's fine for hundreds of colonies, but would need batching across several transactions for many thousands.
- The new raid loop (all-ants march, 60% lock, protection timers, timelocked auto-reveal) has unit and fuzz tests (150 pass) and has run end to end on testnet (Run 3 in [TESTNET_RUN.md](TESTNET_RUN.md)), but not yet a full season with many players. Balance numbers are untested with real players, and the owner can tune the timers within their caps.
- Guaranteed wins on unguarded raids are a design choice. If play shows raiding is too strong, the tools are `raidProtection` and the raider cooldown, each within 0.25x to 4x.
- Avenge collusion is slowed, not prevented. Two coordinated wallets can still trade raids. The score value of a win is the same as a normal raid.
- Avenge grants survive refounding and season boundaries for up to 24 h.
- The Season NFT unlock is not built. When it is, it needs its own design and review.
