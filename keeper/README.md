# Colony keeper

A small Node.js service that runs on a VPS. This part covers:

- **Event intake:** one `EventSource` interface with two interchangeable sources, switched by `EVENT_SOURCE`.
  - `streams` (primary): a [Quicknode Streams](https://www.quicknode.com/docs/streams) webhook receiver. Every delivery is checked against the stream's security token with HMAC-SHA256 over `nonce + timestamp + body`. Stale timestamps are rejected and replayed nonces are ignored. A delivery is acknowledged (200) only after it has been processed, so Quicknode retries anything that failed.
  - `poll` (fallback): `eth_getLogs` every 15 s against the Quicknode RPC, in block chunks (halved automatically if the RPC rejects a range). A saved cursor means restarts resume without gaps.
- **Voter's Pass:** indexes WIF transfers to the World is Fair candidate wallets in `data/world-is-fair-vote-wallets.json`, builds the OpenZeppelin Merkle tree, publishes `docs/voters.json`, and serves each player's proof at `GET /voters/proof/<address>`.

Raid settlement and notifications build on this intake and are added in the next phase.

Requires Node 22.18+ (it runs the TypeScript directly) and pnpm.

## Setup

```bash
cd keeper
pnpm install
cp .env.example .env          # then fill in the Quicknode URLs, tokens and addresses
pnpm test                     # intake, signature and voter tests (no network needed)
```

## Quicknode Streams

The filter functions run on Quicknode's side. Each one turns every block into `{ stream, logs: [...] }`, sending only matching logs in standard `eth_getLogs` shape, so the keeper never depends on Quicknode's raw dataset format. Generate them with:

```bash
pnpm filters    # writes streams/wif-votes.filter.js (and streams/colony-events.filter.js once contract addresses are set)
```

Expose the keeper over HTTPS (for example Caddy in front of `WEBHOOK_PORT`), then create the streams in the Quicknode dashboard.

**1. One-time Voter's Pass backfill (Robinhood Chain mainnet)**

| Setting | Value |
| --- | --- |
| Dataset | Block with receipts |
| Start block | `VOTES_START_BLOCK` (default 40,000,000; the first event #1 votes appear around block 50.9M) |
| End block | the current block (one-time backfill) |
| Filter | paste `streams/wif-votes.filter.js` |
| Destination | Webhook → `https://<your-keeper-host>/streams/votes` |

Copy the stream's security token into `STREAMS_VOTES_TOKEN`, start the keeper, and let the backfill run. Then build the list:

```bash
pnpm voters:build    # writes ../docs/voters.json and state/proofs.json; prints the root
```

As a sanity check, the count of exactly-1-WIF transfers should come out near the event's published 1,454 votes.

**2. Game events (testnet now, mainnet at launch)**

| Setting | Value |
| --- | --- |
| Dataset | Block with receipts |
| Start block | the ColonyGame deploy block (`START_BLOCK`) |
| End block | none (live) |
| Filter | paste `streams/colony-events.filter.js` |
| Destination | Webhook → `https://<your-keeper-host>/streams/game` |

Copy its security token into `STREAMS_GAME_TOKEN`.

## Fallback without Streams

```bash
EVENT_SOURCE=poll pnpm start                                   # live intake by polling
node --env-file=.env scripts/backfill-votes-poll.ts            # one-off voter backfill by polling
```

## Endpoints

| Method and path | Purpose |
| --- | --- |
| `POST /streams/game`, `POST /streams/votes` | Quicknode Streams webhooks (signed) |
| `GET /voters/proof/<address>` | `{ address, root, eligible, proof }` for the app |
| `GET /health` | liveness |
