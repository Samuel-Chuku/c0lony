# Security self-review

An honest self-audit of the C0LONY contracts written during the build. It is not a substitute for a professional audit. Each row says what was considered, how the code handles it, and what is left open.

## Money

| Risk | How it's handled | Status |
| --- | --- | --- |
| Owner drains the prize pot | SeasonPot has no owner and no withdrawal function. WIF leaves only through `claim` (to a ranked colony's owner) and `rollUnclaimed` (to a later season's pot). | Closed |
| Owner withdraws treasury funds | Allowed by design (needed to swap WIF for ETH for gas). Every withdrawal emits `EthWithdrawn` / `WifWithdrawn`, and the README says so plainly. | Accepted, disclosed |
| Owner raises prices to extract value | Every price is capped at 4× its launch value (and at least ¼), and changes emit `ConfigUpdated`. Spending only ever goes 70/20/10, never to the owner directly. | Closed |
| Reentrancy on WIF or ETH transfers | `nonReentrant` on every function that moves WIF or ETH, checks-effects-interactions, ETH sent with a 30k gas limit. WIF is a standard OpenZeppelin ERC-20 with no transfer hooks. | Closed |
| Rounding creates or loses WIF | Split: pot gets `amount − burn − treasury`, so the three parts always add up (fuzzed). Payouts round down, so the total paid is ≤ the pot (tested); dust rolls over with unclaimed shares. | Closed |
| Claim twice / claim another's share | Each colony's claim is marked as paid; `claim` pays only the caller's colony for that season. | Closed |
| Random roll moves WIF | Raid resolution touches only leaves, sugar and workers. A fuzz test checks WIF balances are unchanged by any roll. | Closed |

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
| drand stalls | Raids wait; if a round can't be settled within 48 h, `collect` returns the soldiers with no winner. | Closed |
| The losing side withholds settlement, hoping for the 48 h refund | Anyone can settle; the keeper settles every raid about a minute after its round; the collect-first rule blocks both colonies from launching new raids until it's resolved. | Mitigated (relies on the keeper or either player) |

## Raids and game logic

| Risk | How it's handled | Status |
| --- | --- | --- |
| Defender learns the target before guarding | The target is a commitment hash until reveal, and reveal is only allowed after the guard window closes. | Closed |
| Commitment brute force | Commitment = keccak256(target, salt, raidId). The salt comes from the raider's wallet signing the raid ID, so it can't be guessed. Raid IDs include the colony number, so commitments can't be replayed across raids. | Closed |
| Raider sees the defender guarded correctly and refuses to reveal | Not revealing loses every soldier sent, versus half if revealed. The raider can choose this to deny the defender's loot, but it always costs them more soldiers. | Accepted (a game choice) |
| Farming score with a second colony | Each guarded raid costs the attacking colony half its soldiers and 10–15% of a resource. A farming colony shrinks out of raid range quickly, and every colony costs 1,500 WIF to found (1,200 with a Voter's Pass). | Mitigated |
| Owner starves colonies by changing timers | The starvation timer (72 h), revive window (24 h), settle timeout (48 h) and randomness delay (30 s) are constants. The feed interval can't reach 72 h. | Closed |
| Owner ends a season early | Allowed only to a future time within 21 days of the season start, and emits `SeasonEndChanged`. Ending very early could stop colonies reaching two feedings. | Accepted, disclosed |
| Colony transfer to dodge one-per-wallet | Colony NFTs revert on any transfer. | Closed |

## Voter's Pass

| Risk | How it's handled | Status |
| --- | --- | --- |
| Using another wallet's proof | The Merkle leaf is built from `msg.sender`, so a proof only works for the address it was made for. | Closed |
| A wrong or malicious voter root | Only the owner or the voter-root setter can post a root, and each change emits `VoterRootUpdated(root, listURI)`. The full list is published so anyone can rebuild and check the root. The impact is capped: at most a 30% discount on founding and feeding, and no effect on score, payouts or the pot. | Mitigated |
| A bad proof blocks play | An empty or invalid proof means full price; `foundColony` and `feedQueen` never revert because of a proof. | Closed |
| Leaf/inner-node confusion | Leaves are double-hashed (OpenZeppelin StandardMerkleTree format), so an internal node can't pass as a leaf. | Closed |
| The pass outlives the list | By design, the pass is permanent once granted, even if a later root drops the address. | Accepted |
| A single-voter list | With exactly one voter the valid proof is empty, which the contract treats as "no proof". Irrelevant at the real list size. | Accepted |

## Gas sponsorship

| Risk | How it's handled | Status |
| --- | --- | --- |
| Draining the ETH pool | Drips and refunds both stop when paying would leave less than 0.0003 ETH. | Closed |
| Drip farming | Once per wallet ever, 25 per day, and each requires a founding fee of at least 1,200 WIF, worth more than the 0.00005 ETH drip. | Closed |
| Refund exceeds gas paid | The refund is measured gas × `tx.gasprice` + L1 fee from ArbGasInfo, capped at 0.00005 ETH. On Robinhood Chain `tx.gasprice` returns the base fee, not the sender's bid (checked live), so bidding high doesn't raise the refund. A test confirms the refund stays below actual gas, at about 93%. To be rechecked against real testnet receipts. | Closed (recheck on testnet) |
| Treasury reverts break gameplay | ColonyGame calls the treasury in `try/catch`, and the treasury skips instead of reverting, so founding and settling always work. | Closed |
| ArbGasInfo missing or failing | Read with a low-level call; if it fails, the L1 fee counts as 0 (under-refund, never over). | Closed |

## Chain-specific

| Risk | How it's handled | Status |
| --- | --- | --- |
| `block.number` is an L1 estimate on Robinhood Chain | Not used. | Closed |
| Contract size above 24 KB | ColonyGame is about 26 KB. Robinhood Chain accepts contracts up to at least 64 KB (checked live with `eth_estimateGas` on both networks). | Accepted, documented |
| Long idle period makes the next transaction expensive | Seasons are created lazily, one loop iteration per missed season. Even a year of 1-day seasons stays within block limits. | Accepted |

## Left open

- No external audit.
- Ranking gas grows linearly with the number of colonies that were fed twice. That's fine for hundreds of colonies, but would need batching across several transactions for many thousands.
- The settle refund overhead constant should be rechecked against real testnet receipts.
