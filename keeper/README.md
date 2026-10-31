# C0LONY keeper

A small Node.js service that runs on a VPS. This part covers:

- **Event intake:** one `EventSource` interface with two interchangeable sources, switched by `EVENT_SOURCE`.
  - `streams` (primary): a [Quicknode Streams](https://www.quicknode.com/docs/streams) webhook receiver. Every delivery is checked against the stream's security token with HMAC-SHA256 over `nonce + timestamp + body`. Stale timestamps are rejected and replayed nonces are ignored. A delivery is acknowledged (200) only after it has been processed, so Quicknode retries anything that failed.
  - `poll` (fallback): `eth_getLogs` every 15 s against the Quicknode RPC, in block chunks (halved automatically if the RPC rejects a range). A saved cursor means restarts resume without gaps.
- **Voter's Pass:** indexes WIF transfers to the World is Fair candidate wallets in `data/world-is-fair-vote-wallets.json`, builds the OpenZeppelin Merkle tree, publishes `docs/voters.json`, and serves each player's proof at `GET /voters/proof/<address>`.

- **Activity feed:** every game event is decoded into a feed row (see `src/feed/decode.ts`) and queued in `state/feed-outbox.json`. The outbox posts batches of up to 200 to `FEED_API_BASE/api/feed/ingest`, signed with `FEED_INGEST_SECRET` (`x-c0-timestamp` and `x-c0-signature`, an HMAC of `timestamp.body`). Failed sends back off and retry. The server ignores duplicates, so resending is safe. Sealed raid targets and guard choices never enter the feed.
- **Push notifications:** Web Push with VAPID keys. Immediate pushes: someone is raiding you, a raid result. Timed pushes (kept in `state/push-jobs.json`): queen hungry in 12 h and 2 h, foragers home, free avenge ending, season ending in 24 h. A newer feeding or tending replaces the older reminders, and anything more than 30 minutes late after downtime is dropped. Each person's switches are respected, and dead subscriptions (404 or 410) are pruned.
- **Auto-settle:** when a raid is revealed, the keeper waits until 60 s after its drand round, fetches the signature from the drand API, checks the raid is still Revealed on chain, then calls `settle`. It also calls `collect` on raids past their deadlines (never revealed in time, or unsettled 48 h after the round). If the keeper balance falls below `MIN_BALANCE_ETH` it stops sending, logs a loud `ALERT` line once an hour, and resumes by itself after a top-up.
- **Voter's Pass files:** see below.

Each part switches itself off with one log line when its settings are missing, so the others keep running: no `FEED_API_BASE` or `FEED_INGEST_SECRET` means no feed, no VAPID keys means no push, no `KEEPER_PRIVATE_KEY` means no settling.

Requires Node 22.18+ (it runs the TypeScript directly) and pnpm.

## Settings for feed, push and settle

| Variable | Purpose |
| --- | --- |
| `FEED_API_BASE`, `FEED_INGEST_SECRET` | where the app lives, and the shared secret that signs requests to it |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push identity (`mailto:` or https URL as the subject) |
| `PUSH_ENABLED` | on by default when both VAPID keys are set |
| `KEEPER_PRIVATE_KEY`, `MIN_BALANCE_ETH` | settlement wallet and its balance floor |
| `COLONY_GAME_ADDRESS`, `SEASON_POT_ADDRESS` | contracts to decode |
| `DRAND_API_URL`, `DRAND_CHAIN_HASH` | where signatures come from |

Contract ABIs live in `src/abi.ts`, generated from the Foundry build. After a contract change run `forge build` in `contracts`, then `pnpm abi`.

## Running

```bash
node --env-file=.env src/main.ts      # or: pnpm start
```

## Restart safety

- Event intake resumes from a saved cursor (poll) or Quicknode retries (streams).
- The feed outbox and push jobs are saved to disk, and duplicates are dropped by key, so a restart or a replayed event never double-sends.
- Pending raids are rebuilt from `state/events.jsonl` at boot, and the chain is read again before every transaction. A raid is only settled if it is still Revealed, one transaction per raid at a time, each awaited to its receipt.

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
