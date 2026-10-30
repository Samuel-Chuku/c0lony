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
- [ ] DrandVerifier + tests against real evmnet rounds
- [ ] ColonyGame, SeasonPot, Treasury + full test suite
- [ ] Gas snapshot for `settle`
- [ ] Testnet deploy with MockWIF; full loop played
- [ ] CONTRACTS_EXPLAINED.md, SECURITY_REVIEW.md

## Phase 2: keeper
- [ ] Event watcher, drand fetch, auto-settle, balance alert, pm2 config

## Phase 3: frontend
- [ ] Colony tab (approval checkpoint), Raids, Season, Activity, Get WIF sheet

## Phase 4: launch
- [ ] Mainnet deploy, treasury funding, Season 1 seed, verification, Vercel, README
