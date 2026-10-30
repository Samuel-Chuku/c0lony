# Deployments and verified constants

Every address and constant C0LONY uses is recorded here with the source it was read from. Contracts and scripts take these values from config; none are hard-coded elsewhere without a reference to this file.

Checks were run on **2026-10-30** (UTC).

## Hosting

| Piece | Where | Address |
| --- | --- | --- |
| Landing page | Cloudflare Pages: static Next.js export from `web/` with `NEXT_PUBLIC_SITE=landing`, output `web/out` | https://c0lony.xyz |
| Game app | Cloudflare Pages: the same `web/` built with `NEXT_PUBLIC_SITE=app`, output `web/out` | https://app.c0lony.xyz |
| Keeper and Voter's Pass files | VPS, Docker behind Caddy (automatic HTTPS) | https://keeper.c0lony.xyz |

- **No Node server for the site.** Server code exists only as Cloudflare Pages Functions in `web/functions`. Their secrets, such as the Quicknode URL, are encrypted runtime variables, never build variables.
- **Public site config is in the repo.** Contract addresses, RPC and explorer URLs, and the drand, KyberSwap and keeper settings for both networks live in `web/src/config.ts`. Each Pages project sets only `NEXT_PUBLIC_SITE` (`landing` or `app`), `NEXT_PUBLIC_NETWORK` (`testnet` or `mainnet`), `NODE_VERSION` and `PNPM_VERSION`.
- **Voter's Pass files** are served from the VPS, not the site, so daily list updates need no redeploy:
  - `https://keeper.c0lony.xyz/voters/voters.json`: the full list and root.
  - `https://keeper.c0lony.xyz/voters/proofs/<address>.json`: `{ address, root, proof }`.
  - No file means no pass.
  - The app uses a proof only if its root matches `ColonyGame.voterRoot()`.
- **Headers:** `web/public/_headers` caches hashed assets for a year, keeps the app shell, service worker and `/api/*` uncached, and sets basic security headers without a script/connect CSP (wallets, WalletConnect, Privy, RPC, drand, KyberSwap and the proof host are all cross-origin).

## Networks

| | Mainnet | Testnet |
| --- | --- | --- |
| Name | Robinhood Chain | Robinhood Chain Testnet |
| Chain ID | `4663` (confirmed with `cast chain-id`) | `46630` (confirmed with `cast chain-id`) |
| Public RPC (rate-limited) | `https://rpc.mainnet.chain.robinhood.com` | `https://rpc.testnet.chain.robinhood.com` |
| Alchemy RPC | `https://robinhood-mainnet.g.alchemy.com/v2/{API_KEY}` | `https://robinhood-testnet.g.alchemy.com/v2/{API_KEY}` |
| Explorer (Blockscout) | `https://robinhoodchain.blockscout.com` | `https://explorer.testnet.chain.robinhood.com` |
| Faucet | n/a | `https://faucet.testnet.chain.robinhood.com` |
| Gas price observed | 0.02 gwei (`cast gas-price`) | 0.01 gwei (`cast gas-price`) |

**C0LONY's RPC provider is [Quicknode](https://www.quicknode.com/chains/robinhood)** (mainnet and testnet, HTTPS and WSS, Streams). The endpoint URLs contain an API key, so they live only in env vars (`ROBINHOOD_RPC_URL`, `ROBINHOOD_TESTNET_RPC_URL`) and are never committed. The checks on this page were run against the public endpoints before Quicknode was set up.

Sources: [Robinhood Chain: connecting](https://docs.robinhood.com/chain/connecting), [add network to wallet](https://docs.robinhood.com/chain/add-network-to-wallet), [BitGo: Robinhood Chain](https://developers.bitgo.com/docs/robinhood-chain.md) (faucet URL), [Alchemy: Robinhood testnet](https://www.alchemy.com/rpc/robinhood-testnet.md).

Note: the faucet returns HTTP 429 to scripted requests, so it has to be opened in a browser. Testnet ETH can also be bridged from Sepolia.

### EVM features (checked live on both networks)

| Feature | Result | How checked |
| --- | --- | --- |
| BN254 `ecAdd` (0x06) | works | `eth_call` with G1+G1 returns 2·G1 |
| BN254 `ecMul` (0x07) | works | `eth_call` with G1·2 returns 2·G1 |
| BN254 `ecPairing` (0x08) | works | empty input returns `1` (mainnet and testnet) |
| `modexp` (0x05) | works | 3² mod 5 returns `4` |
| ArbGasInfo (0x6c) `getCurrentTxL1GasFees()` | works | mainnet returned 1,363,128,000 wei (≈0.0000000014 ETH). Testnet returned 0 at first, but during the play-through it reported a real L1 fee that matched the receipt's `gasUsedForL1` exactly |
| Contract size limit | above 24 KB accepted | `eth_estimateGas` for creating contracts of 24,577, 30,000, 49,153 and 65,535 bytes all succeed on both networks |
| `tx.gasprice` | returns the base fee, not the sender's bid | `eth_call` with a 1 gwei bid returns ≈0.02 gwei (mainnet) / 0.01 gwei (testnet) |
| PUSH0 / MCOPY / TSTORE (Cancun) | supported | `eth_call` of raw creation code returns success; an `INVALID` opcode control returns an error |

So the contracts compile with `evm_version = "cancun"`, and BLS verification on BN254 can run natively. ColonyGame (~26 KB) is above Ethereum's 24 KB limit but well within what Robinhood Chain accepts, so deploy scripts run with `--disable-code-size-limit`. Because `tx.gasprice` is the base fee, a settler can't inflate their gas refund by bidding high.

From [Differences from Ethereum](https://docs.robinhood.com/chain/differences-from-ethereum/):
- `block.prevrandao` / `block.difficulty` "return a constant value on Robinhood Chain and are not a source of randomness."
- `blockhash(n)` should not be used "as a randomness source."
- `block.number` "returns an estimate of the L1 (Ethereum) block number", so timers use `block.timestamp`.
- Fees include an L1 data fee on top of L2 execution gas, and "`gasleft()` behave[s] differently than on Ethereum." This matters for the settlement gas refund, which can only measure L2 execution gas from inside the contract.

## $WIF token (mainnet)

| Field | Value | Source |
| --- | --- | --- |
| Address | `0x5173b8eA6923c2d40267890D45C46a3480954773` | Hackathon rules ([worldisflat.fun/build/rules](https://worldisflat.fun/build/rules)) |
| `name()` | `World is Flat` | `cast call` on mainnet RPC |
| `symbol()` | `WIF` | `cast call` |
| `decimals()` | `18` | `cast call` |
| `totalSupply()` | 999,998,684.26 WIF (below 1e9, so some has already been burned) | `cast call` |
| Proxy? | No: the EIP-1967 implementation slot is empty | `cast storage` |
| Not on testnet | `eth_getCode` on 46630 returns `0x` | so testnet uses a MockWIF |

### Burn check: `burn(uint256)` exists ✅

- Runtime bytecode (3,248 bytes) contains the selectors `0x42966c68` `burn(uint256)` and `0x79cc6790` `burnFrom(address,uint256)`. It has no `mint` selector.
- A simulated `burn(1000)` from a real holder (`0x8366…0951`) succeeds and emits `Transfer(holder → 0x0000…0000, 1000)`, which is the OpenZeppelin `ERC20Burnable` pattern and lowers `totalSupply`.

**Decision:** C0LONY burns its 20% share by calling `WIF.burn(amount)`. It does not transfer to the dead address.

Blockscout's web UI and API sit behind a Cloudflare challenge for scripted requests, so these facts were read straight from the chain over RPC. To view them in a browser: [Blockscout: WIF](https://robinhoodchain.blockscout.com/address/0x5173b8eA6923c2d40267890D45C46a3480954773).

## drand evmnet

Fetched from [`https://api.drand.sh/04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3/info`](https://api.drand.sh/04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3/info):

| Field | Value |
| --- | --- |
| Chain hash | `04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3` |
| Beacon ID | `evmnet` |
| Scheme | `bls-bn254-unchained-on-g1` (unchained, signatures on G1, public key on G2) |
| Period | `3` seconds ✅ |
| Genesis time | `1727521075` (2024-09-28 10:57:55 UTC) |
| Group hash | `cd7ad2f0e0cce5d8c288f2dd016ffe7bc8dc88dbb229b3da2b6ad736490dfed6` |
| Public key (G2, 128 bytes) | `07e1d1d335df83fa98462005690372c643340060d205306a9aa8106b6bd0b3820557ec32c2ad488e4d4f6008f89a346f18492092ccc0d594610de2732c8b808f0095685ae3a85ba243747b1b2f426049010f6b73a0cf1d389351d5aaaa1047f6297d3a4f9749b33eb2d904c9d9ebf17224150ddd7abd7567a9bec6c74480ee0b` |

**Sample rounds** (from `/public/{round}` and `/public/latest`). These become test fixtures in Phase 1.

| Round | Signature (G1, 64 bytes) | Randomness |
| --- | --- | --- |
| 1000000 | `139a803860ff6d842b822b8b37eaeccc4e278dd44440535a976530a1a503e85e11d84b824f18e608a85e627e6b1b08322060cbcf7eca1ea78489252907e8473a` | `4da14d73e62d0c909d143e61a2adce866f6be3e7a9d58b1e32a95c87e780569c` |
| 21938904 | `2a00723406b37f4faac16d57d462a728264f3931bb38fa14db95fb25486c0bac0ec69c200c6e2602a821bdaeecf4016b706024b24232f40e7cfc9dc36c9ff830` | `ed85718ebf25cd883497405d475771bf9509fb042b4775c7e0a010105952273e` |

**Timing check:** round 21938904 was the latest at unix time 1793337787, and `genesis + 3·(round − 1)` = 1793337784, which fits a 3-second period. So:

- round `r` is published at `genesis + 3·(r − 1)`
- the round current at time `t` is `floor((t − genesis) / 3) + 1`

**Verifier library:** [kevincharm/bls-bn254](https://github.com/kevincharm/bls-bn254), MIT license, commit `9f70fb4dff2cd0921dc2144929dc0aff6f21a9b9` (repo last pushed 2024-09-21). `contracts/BLS.sol` + `contracts/ModExp.sol` expose `verifySingle`, `hashToPoint`, `isValidSignature`, `isValidPublicKey`. It is a Hardhat repo, so C0LONY vendors the two `.sol` files at that pinned commit. The exact message encoding and domain tag for evmnet are proved in Phase 1 by verifying the rounds above onchain in a Foundry test.

Background: [drand HTTP API](https://docs.drand.love/developer/API-v1/drand-http-api), [EVM-compatible drand and bls-bn254](https://hackmd.io/@kevincharm/rJA4r_Iia).

## KyberSwap Aggregator (`robinhood` route)

Quote request: `GET https://aggregator-api.kyberswap.com/robinhood/api/v1/routes?tokenIn=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE&tokenOut=0x5173…4773&amountIn=…&chargeFeeBy=currency_in&isInBps=true&feeAmount=50&feeReceiver=<treasury>` with header `x-client-id: c0lony` (the same value is sent as the `source` parameter). The fee receiver for these test quotes was a placeholder; the treasury address is filled in after deploy.

| ETH in | WIF out | USD in | USD out | Total loss (incl. 0.5% fee) |
| --- | --- | --- | --- | --- |
| 0.001 | 1,896.79 | 2.242 | 2.208 | 1.49% |
| 0.005 | 9,482.18 | 11.208 | 11.039 | 1.51% |
| 0.011 | 20,854.81 | 24.657 | 24.278 | 1.53% |
| 0.05 | 94,620.66 | 112.08 | 110.15 | 1.72% |

- The API accepted the fee parameters and echoed them back in `routeSummary.extraFee` (`feeAmount: 50, chargeFeeBy: currency_in, isInBps: true`).
- Router: `0x6131B5fae19EA4f9D964eAc0408E4408b66337b5`. Route: a single hop through `uniswap-v4-pons-v2` (the Pons pool).
- **Liquidity is fine:** buying 2,000–20,000 WIF costs about 1.0% in price impact on top of the 0.5% fee, far below the 3% warning threshold.
- **Implied prices at check time:** ETH ≈ 2,241 USD, WIF ≈ 0.00116 USD.
- Still open (mainnet, needs approval): one small real swap to confirm the fee arrives at the treasury contract. This waits until the Treasury is deployed.

Source: [KyberSwap Aggregator API: EVM swaps](https://docs.kyberswap.com/kyberswap-solutions/kyberswap-aggregator/aggregator-api-specification/evm-swaps).

## World is Fair votes (Voter's Pass source data)

Candidate vote wallets for event #1 ("Who is the G.O.A.T.?", closed at 1,454 votes) are in `data/world-is-fair-vote-wallets.json`, read from [worldisflat.fun/fair](https://worldisflat.fun/fair/) on 2026-10-30. A vote is a transfer of 1 WIF to a candidate wallet.

Checked with `eth_getLogs` on mainnet (2026-10-30):

- **Candidate wallet `0xFCA4…6295`:** 336 incoming WIF transfers from 305 senders, between blocks 50,943,889 and 83,943,728 (31 Aug to 9 Oct 2026). 330 of them are exactly 1 WIF; the rest are 10, 10, 20, 586.68, 2,455.22 and 1,641.59 WIF. On 15 Sep the wallet sent 5,052.48 WIF to `0x…dEaD` (votes burned).
- **Blocks 50,900,000–50,999,999, all 78 wallets:** 87 transfers (81 of exactly 1 WIF) from 76 voters. This was the keeper's poller smoke test.
- **Public RPC `eth_getLogs` limits:** 100,000 blocks with several `to` topics, or 10,000,000 blocks with one.

## Deployment gas (simulated, nothing sent)

`forge script script/Deploy.s.sol` simulated against each network's RPC on 2026-10-30:

| Network | Gas | Gas price | Cost |
| --- | --- | --- | --- |
| Testnet (46630), incl. MockWIF | 17,335,197 | 0.02 gwei | ≈0.00035 ETH |
| Mainnet (4663) | 16,633,817 | 0.04 gwei | ≈0.00067 ETH (≈0.0083 ETH if gas spiked to 0.5 gwei) |

Measured gas per call (`forge snapshot`, see `contracts/.gas-snapshot`): `settle` ≈ 269k execution gas (≈306k for the whole transaction), of which drand signature verification ≈ 222k.

## Deployed contracts

### Robinhood Chain testnet (46630), current deployment (2026-10-30, second)

Redeployed with the settle refund fix and Voter's Pass linking (`claimVoterPass`). Blocks 145,471,559–145,471,563, 9,649,279 gas in total. All contracts are verified on Blockscout; the DrandVerifier library and the MockWIF source are unchanged from the first deployment.

| Contract | Address |
| --- | --- |
| ColonyGame | [`0xE186253067C229CC1774830C09Be901ee16B26c8`](https://explorer.testnet.chain.robinhood.com/address/0xE186253067C229CC1774830C09Be901ee16B26c8) |
| SeasonPot | [`0x2B10C87A6A9bbAE418878FdCDE66F1C34f4F6128`](https://explorer.testnet.chain.robinhood.com/address/0x2B10C87A6A9bbAE418878FdCDE66F1C34f4F6128) |
| Treasury | [`0x5d7B210326435e1bDbC39AeFDD6E0969843183e4`](https://explorer.testnet.chain.robinhood.com/address/0x5d7B210326435e1bDbC39AeFDD6E0969843183e4) |
| DrandVerifier (linked library, reused) | [`0x2513832059bac29e5a5115634694F22B6B302Ae1`](https://explorer.testnet.chain.robinhood.com/address/0x2513832059bac29e5a5115634694F22B6B302Ae1) |
| MockWIF (testnet only) | [`0xC7524F3D78E5f6150aff0Eac811e9Bd0D0Fd9B68`](https://explorer.testnet.chain.robinhood.com/address/0xC7524F3D78E5f6150aff0Eac811e9Bd0D0Fd9B68) |

Owner: `0x4B11611CF7C90aEc2003721d71107d7E1cBf37c2`. Treasury funded with 0.002 testnet ETH. Runs the launch settings (4 h guard window, 24 h feed interval) until changed for testing.

### Robinhood Chain testnet (46630), first deployment (retired)

Used for the play-through in [TESTNET_RUN.md](TESTNET_RUN.md). It has the old settle refund formula and no linking.


Deployed in blocks 145,287,070–145,287,216 by `script/Deploy.s.sol` (13,342,600 gas in total). All five contracts are verified on Blockscout.

| Contract | Address |
| --- | --- |
| ColonyGame | [`0x76131b6547b584e9f101618239A26B2aCCd8aA43`](https://explorer.testnet.chain.robinhood.com/address/0x76131b6547b584e9f101618239A26B2aCCd8aA43) |
| SeasonPot | [`0x403988c9cAdE46293a4561ADC6fbb0BDA02647FF`](https://explorer.testnet.chain.robinhood.com/address/0x403988c9cAdE46293a4561ADC6fbb0BDA02647FF) |
| Treasury | [`0x74f955C7b01Ad3649d50a93149b9ad9C5594c8b9`](https://explorer.testnet.chain.robinhood.com/address/0x74f955C7b01Ad3649d50a93149b9ad9C5594c8b9) |
| DrandVerifier (linked library) | [`0x2513832059bac29e5a5115634694F22B6B302Ae1`](https://explorer.testnet.chain.robinhood.com/address/0x2513832059bac29e5a5115634694F22B6B302Ae1) |
| MockWIF (testnet only) | [`0x653a93f2018DfcCf6bE8b70d7cA227b27ADE6037`](https://explorer.testnet.chain.robinhood.com/address/0x653a93f2018DfcCf6bE8b70d7cA227b27ADE6037) |

Owner: `0x4B11611CF7C90aEc2003721d71107d7E1cBf37c2`. Treasury funded with 0.002 testnet ETH.

**Testnet-only settings** (set with `setConfig`, both within the hard caps): guard window 1 h and feed interval 6 h, so a full loop fits in an afternoon. Mainnet launches with 4 h and 24 h.

### Robinhood Chain mainnet (4663)

Not deployed yet.
