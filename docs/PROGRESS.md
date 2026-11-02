# Build progress

## Phase 0: setup and checks
- [x] Repo layout: `contracts/` (Foundry), `keeper/`, `web/`, `docs/`
- [x] `.gitignore`, `.env.example` for contracts and keeper (the web app needs no secrets; its public config is `web/src/config.ts`)
- [x] WIF `burn(uint256)` confirmed onchain → burn directly
- [x] drand evmnet `/info` and sample rounds recorded; 3 s period confirmed
- [x] BN254 + modexp precompiles and Cancun opcodes confirmed on mainnet and testnet
- [x] Testnet faucet located
- [x] KyberSwap `robinhood` quote with 50 bps fee works; liquidity checked
- [x] Testnet ETH in deployer + two player wallets (manual, browser faucet)
- [ ] Name / X handle / domain availability (manual)
- [ ] Sponsor outreach to the World is Flat team (manual)
- [ ] One small real swap confirming the fee reaches the treasury (after mainnet deploy, needs approval)

## Phase 1: contracts
- [x] DrandVerifier + tests against real evmnet rounds (5 rounds verify; wrong/tampered/fuzzed signatures fail)
- [x] ColonyGame, SeasonPot, Treasury + full test suite (75 tests incl. fuzzing and a simulated week)
- [x] Gas snapshot for `settle` (~269k execution, ~306k per tx)
- [x] Deploy script (simulated on testnet and mainnet, nothing sent)
- [x] Testnet deploy with MockWIF; full loop played
- [x] Full testnet season played with a real drand round (docs/TESTNET_RUN.md); found the settle refund was 106% of real cost and fixed it to ~90%
- [x] Redeployed testnet with the refund fix and Voter's Pass linking; all contracts verified
- [x] Second full testnet season on the new contracts: settle refund 84.7% of real cost, Voter's Pass linked from a separate wallet (docs/TESTNET_RUN.md)
- [x] CONTRACTS_EXPLAINED.md, SECURITY_REVIEW.md

## Voter's Pass (added on top of Phase 1)
- [x] Contract: voter root + setter role, optional proof on found/feed, permanent pass, discount 20% (cap 30%)
- [x] Linking: `claimVoterPass` moves a pass from the voting wallet to a game wallet with an EIP-712 signature (ERC-1271 too); one wallet per voter; 13 tests
- [x] Founding price raised to 1,500 WIF; feeding stays 100
- [x] Tests: valid/empty/invalid/foreign proofs, persistence, setter access, cap, split on discounted amount
- [x] Confirmed vote transfers (1 WIF to candidate wallets) are visible via eth_getLogs on mainnet
- [x] Keeper: vote indexer (Streams or polling), Merkle builder script, voters.json and per-address proof files
- [ ] Run the one-time Streams backfill and publish voters.json (needs Quicknode keys)
- [ ] Post the root onchain at most once a day, only when the list changes (with the Phase 2 settlement wallet)
- [x] Cross-check the leaf encoding against @openzeppelin/merkle-tree output (VoterTreeCompat test)
- [x] Frontend: Voter's Pass badge, discounted prices and the link flow (Settings screen, `VoterPass.tsx`)

## Contracts added after Phase 1
- [x] Avenge: free counter-raid within 24 h, once, skips the caller's raid cooldown
- [x] Raid record counters and `getProfile`; owner address in every player event
- [x] Locked colony NFT (no transfers during a season); `unlockSeasonNfts` placeholder
- [x] Third testnet deployment with all of the above, verified on Blockscout

## Economy and raid redesign (2026-11-02)
- [x] Trails and farms pay 2 a day per ant; hand forage trips scale with free ants (cap 30), stack up to 2, keep partial progress; first trip ready at once
- [x] Speed-up collects waiting trips plus one; first aphid farm costs leaves only
- [x] Feeding ignores the raid lock for the queen and the ants' meal; button reads "Feed the colony"
- [x] Raids: all free ants march (no picker, `NoFreeAnts`), 12 h raider cooldown, one raid at a time, 12 h target protection (`raidProtection`, `raidableAt`), no raids while under attack (`UnderAttack`), Avenge ignores cooldown and protection
- [x] No win odds: guaranteed win unguarded (30-60%), wrong guard 45-60%, right guard fails the raid (25% of ants lost, defender takes 10-15%); loot cap 8 per ant
- [x] 60% raid lock on the defender, released on settle and collect; `getProfile` gains `raidableAt`, `nextRaidAt`, `lockedLeaves`, `lockedSugar`, `leafTrip`, `sugarTrip`
- [x] 140 Foundry tests pass (was 127), including fuzzed loot maths; `settle` gas 314,958
- [x] Fourth testnet deployment, verified on Blockscout (third retired), voter root posted
- [x] App: ants slider with live earnings, first farm free of sugar shown in costs, marching-ants line on transaction buttons, raid protection and "under raid" timers on the Raids tab, launch sheet and raid reports show what is carried and the share taken
- [ ] Switch the keeper on the VPS from the third to the fourth deployment (after the next push, with the event cursor reset)
- [ ] Full testnet play-through of the new raid loop (docs/TESTNET_RUN.md still records the older rules)
- [ ] Recheck the settle refund against a real receipt on the new deployment

## Quicknode
- [x] RPC from env (ROBINHOOD_RPC_URL, ROBINHOOD_TESTNET_RPC_URL) in Foundry, keeper and web examples
- [x] Keeper intake: one EventSource interface; Streams webhook (HMAC-checked) or eth_getLogs poller (15 s), switched by EVENT_SOURCE
- [x] Streams filter functions generated from config (keeper/streams/)
- [ ] Web: /api/rpc serverless function so the Quicknode key never reaches the browser

## Phase 2: keeper
- [x] drand fetch and auto-settle, `collect` for expired raids, balance floor alert
- [x] Feed outbox (signed batches to the app) and Web Push planner (raided, result, hungry, foragers home, avenge ending, season ending)
- [x] Dockerfile and compose file
- [ ] Keeper running on the VPS behind the reverse proxy at keeper.c0lony.xyz
- [ ] Run the one-time Streams backfill and publish voters.json (needs Quicknode keys)
- [ ] Post the Voter's Pass root onchain at most once a day, only when the list changes

## Backend for feed, profiles and push
- [x] Serverless functions: feed (ingest, list, stats, summary), profile, profiles, push subscriptions; tests
- [x] D1 migration `web/migrations/0001_feed.sql`
- [ ] Create the Privy app and put its ID in `web/src/config.ts`; set the Privy Pages variables and secrets
- [ ] Create the D1 database `c0lony-feed` and the KV namespace `c0lony-profiles`, bind them to the app project, apply the migration
- [ ] Generate VAPID keys, put the public key in `web/src/config.ts` and the keys in the keeper env
- [ ] Set `FEED_INGEST_SECRET` on both the app project and the keeper

## Frontend
- [x] Design system and styleguide
- [x] Screens wired to the chain: Colony, Raids (launch, guard, reveal, settle, avenge, shield), Live, raid report, profiles, leaderboard, how to play, invite, settings
- [x] Navigation: four tabs (Colony, Raids, Live, Season) and a Menu drawer from the avatar
- [x] Get WIF swap sheet and add-funds sheet
- [x] Sign-in and embedded wallet (Privy) code, X profile display, push opt-in
- [x] Landing and app split built from one codebase
- [x] Landing page: hero with the live colony and live pot, how a day goes, raids, why WIF and the 70/20/10 split, fair and open (drand, verified contracts, owner limits), FAQ
- [x] Desktop layout (1024px and up): side rail, two-column screens, the colony picture at 1.5x or 2x, keyboard shortcuts (1-4, B, T, M, ?; no key spends WIF), hover states
- [x] Daylight look (Auto / Soil / Daylight in the Menu)
- [x] Live feed only shows events from the current game deployment
- [x] Social preview image for link cards (`web/public/og.png`, large card on X)
- [ ] Test installing and push on a real iPhone and Android phone
- [ ] Two Pages projects connected, c0lony.xyz and app.c0lony.xyz attached

## Launch (needs explicit approval first)
- [ ] Mainnet deploy, Treasury funding, Season 1 seed, Blockscout verification
- [ ] Fill mainnet addresses in `web/src/config.ts` and docs/DEPLOYMENTS.md
- [ ] One small real swap confirming the 0.5% fee reaches the Treasury
- [ ] Demo video
