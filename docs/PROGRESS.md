# Build progress

## Phase 0: setup and checks
- [x] Repo layout: `contracts/` (Foundry), `keeper/`, `web/`, `docs/`
- [x] `.gitignore`, `.env.example` for contracts and keeper (the web app needs no secrets; its public config is `web/src/config.ts`)
- [x] WIF `burn(uint256)` confirmed onchain → burn directly
- [x] drand evmnet `/info` and sample rounds recorded; 3 s period confirmed
- [x] BN254 + modexp precompiles and Cancun opcodes confirmed on mainnet and testnet
- [x] Testnet faucet located
- [x] KyberSwap `robinhood` quote with 50 bps fee works; liquidity checked
- [ ] Testnet ETH in deployer + two player wallets (manual, browser faucet)
- [ ] Name / X handle / domain availability (manual)
- [ ] Sponsor outreach to the World is Flat team (manual)
- [ ] One small real swap confirming the fee reaches the treasury (after mainnet deploy, needs approval)

## Phase 1: contracts
- [x] DrandVerifier + tests against real evmnet rounds (5 rounds verify; wrong/tampered/fuzzed signatures fail)
- [x] ColonyGame, SeasonPot, Treasury + full test suite (75 tests incl. fuzzing and a simulated week)
- [x] Gas snapshot for `settle` (~269k execution, ~306k per tx)
- [x] Deploy script (simulated on testnet and mainnet, nothing sent)
- [ ] Testnet deploy with MockWIF; full loop played (needs testnet ETH in the deployer)
- [x] Full testnet season played with a real drand round (docs/TESTNET_RUN.md); found the settle refund was 106% of real cost and fixed it to ~90%
- [ ] Redeploy testnet with the refund fix and recheck one real settle
- [x] CONTRACTS_EXPLAINED.md, SECURITY_REVIEW.md

## Voter's Pass (added on top of Phase 1)
- [x] Contract: voter root + setter role, optional proof on found/feed, permanent pass, discount 20% (cap 30%)
- [x] Founding price raised to 1,500 WIF; feeding stays 100
- [x] Tests: valid/empty/invalid/foreign proofs, persistence, setter access, cap, split on discounted amount
- [x] Confirmed vote transfers (1 WIF to candidate wallets) are visible via eth_getLogs on mainnet
- [x] Keeper: vote indexer (Streams or polling), Merkle builder script, docs/voters.json writer, proof endpoint
- [ ] Run the one-time Streams backfill and build docs/voters.json (needs Quicknode keys)
- [ ] Post the root onchain at most once a day, only when the list changes (with the Phase 2 settlement wallet)
- [ ] Cross-check the leaf encoding against @openzeppelin/merkle-tree output
- [ ] Frontend: Voter's Pass badge, discounted prices, World is Fair card in the Season tab

## Quicknode
- [x] RPC from env (ROBINHOOD_RPC_URL, ROBINHOOD_TESTNET_RPC_URL) in Foundry, keeper and web examples
- [x] Keeper intake: one EventSource interface; Streams webhook (HMAC-checked) or eth_getLogs poller (15 s), switched by EVENT_SOURCE
- [x] Streams filter functions generated from config (keeper/streams/)
- [ ] Web: /api/rpc Cloudflare Pages Function so the Quicknode key never reaches the browser (Phase 3)

## Phase 2: keeper
- [ ] drand fetch, auto-settle, balance alert, notifications, pm2 config (on top of the intake)

## Hosting
- [x] Web is a Next.js static export (`web/out`) for Cloudflare Pages; `_headers` sets caching and security headers; clean build confirmed
- [x] Voter's Pass published as static files (`voters.json`, `proofs/<address>.json`) for Caddy to serve from the VPS
- [ ] Keeper on the VPS in Docker behind Caddy at keeper.c0lony.xyz
- [x] Landing (c0lony.xyz) and app (app.c0lony.xyz) split: one `web/` codebase, built per site by `NEXT_PUBLIC_SITE`, linked to each other
- [ ] Two Cloudflare Pages projects connected, c0lony.xyz and app.c0lony.xyz attached

## Phase 3: frontend
- [ ] Colony tab (approval checkpoint), Raids, Season, Activity, Get WIF sheet

## Phase 4: launch
- [ ] Mainnet deploy, treasury funding, Season 1 seed, verification, Cloudflare Pages, README
