# C0LONY

**[c0lony.xyz](https://c0lony.xyz)** · The "0" in C0LONY is a zero, not the letter O.

An onchain ant-colony strategy game on Robinhood Chain, built for the World is Flat hackathon. Every paid action spends $WIF, and raid outcomes are decided by drand evmnet randomness verified onchain.

_Full README, contract addresses and how to play coming at launch._

> **Prices are not final.** Every price is set in WIF and can be tuned by the owner within hard caps written into the contract (between ¼ and 4× the launch value), so the numbers below are expected to change as the WIF price moves and the game is balanced. At launch, founding a colony costs 1,500 WIF and feeding the queen costs 100 WIF, with 20% off both for World is Fair voters (Voter's Pass).

RPC and event indexing run on [Quicknode](https://www.quicknode.com/chains/robinhood): Robinhood Chain RPC for the app, keeper and contract deploys, and Quicknode Streams for event indexing.

The site is a static Next.js export hosted on [Cloudflare Pages](https://pages.cloudflare.com) at [c0lony.xyz](https://c0lony.xyz). The keeper and the published Voter's Pass list run on a small VPS behind Caddy at `keeper.c0lony.xyz`.

## Layout

- `contracts/`: Solidity (Foundry)
- `keeper/`: TypeScript settlement and notification service
- `web/`: Next.js frontend, static export for Cloudflare Pages (server code only as Pages Functions in `web/functions`)
- `docs/`: deployments, contract explainer, security review, progress
