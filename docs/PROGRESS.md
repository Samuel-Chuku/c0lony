# Build progress

## Phase 0: setup and checks
- [x] Repo layout: `contracts/` (Foundry), `keeper/`, `web/`, `docs/`
- [x] `.gitignore`, `.env.example` for contracts, keeper and web
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
- [ ] Recheck settle refund against real testnet receipts
- [x] CONTRACTS_EXPLAINED.md, SECURITY_REVIEW.md

## Voter's Pass (added on top of Phase 1)
- [x] Contract: voter root + setter role, optional proof on found/feed, permanent pass, discount 20% (cap 30%)
- [x] Founding price raised to 1,500 WIF; feeding stays 100
- [x] Tests: valid/empty/invalid/foreign proofs, persistence, setter access, cap, split on discounted amount
- [x] Confirmed vote transfers (1 WIF to candidate wallets) are visible via eth_getLogs on mainnet
- [ ] Keeper: index votes, build the OpenZeppelin Merkle tree, publish docs/voters.json, post root daily, serve proofs
- [ ] Cross-check the leaf encoding against @openzeppelin/merkle-tree output
- [ ] Frontend: Voter's Pass badge, discounted prices, World is Fair card in the Season tab

## Phase 2: keeper
- [ ] Event watcher, drand fetch, auto-settle, balance alert, pm2 config

## Phase 3: frontend
- [ ] Colony tab (approval checkpoint), Raids, Season, Activity, Get WIF sheet

## Phase 4: launch
- [ ] Mainnet deploy, treasury funding, Season 1 seed, verification, Vercel, README
