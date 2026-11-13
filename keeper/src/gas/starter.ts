// Starter gas: tops up a new player's wallet with a little ETH from the keeper wallet before their first transaction.
// The same queue carries testnet WIF faucet requests (kind "wif"), which the keeper pays by minting test WIF, and
// approval top-ups (kind "approval"): a tiny one-time amount so an out-of-gas player can approve the Courier and buy a
// gas pack with WIF (docs/design/2026-11-13-wif-for-gas.md). The app limits approvals to once per wallet ever.
// The app queues requests (it applies the limits); this loop only pays them.
//
// Safety, in order: a request id is written to the state file as "sending" before any ETH leaves; a restart never
// resends an id recorded as sent, and an id stuck at "sending" is resolved by its recorded tx or by re-reading the
// wallet balance. Nothing is sent when the keeper balance would drop below the floor plus the amount.
import { JsonStore } from "../state.ts";
import { signedPost, type FetchFn } from "../feed/signed.ts";

const ALERT_EVERY_SEC = 3600;

export type GasStatus = "sent" | "skipped" | "failed";
export type Kind = "gas" | "wif" | "approval";
type Entry = { status: "sending" | GasStatus; tx?: string };
type GasState = Record<string, Entry>;

export interface GasApi {
  pending(): Promise<{ id: number; wallet: string; kind?: Kind }[]>;
  done(id: number, status: GasStatus, tx?: string): Promise<void>;
}

/** What the sender needs from the chain. send() resolves with the tx hash once submitted; wait() with receipt success. */
export interface GasChain {
  balanceOf(address: string): Promise<bigint>;
  keeperBalance(): Promise<bigint>;
  send(to: string, amount: bigint): Promise<string>;
  /** Mints test WIF to `to` (testnet only); absent when the faucet is off. */
  mintWif?(to: string): Promise<string>;
  wait(hash: string): Promise<boolean>;
}

export class StarterGas {
  private readonly o: {
    api: GasApi;
    chain: GasChain;
    store: JsonStore<GasState>;
    amount: bigint;
    below: bigint;
    minBalance: bigint;
    approvalAmount?: bigint;
    now: () => number;
    log: (m: string) => void;
  };
  private lastAlert = 0;
  private ticking = false;
  private timer?: NodeJS.Timeout;

  constructor(opts: {
    api: GasApi;
    chain: GasChain;
    store: JsonStore<GasState>;
    amount: bigint;
    below: bigint;
    minBalance: bigint;
    /** ETH for one Courier approval; 0 or absent skips approval requests. */
    approvalAmount?: bigint;
    now?: () => number;
    log?: (m: string) => void;
  }) {
    this.o = { now: () => Math.floor(Date.now() / 1000), log: () => {}, ...opts };
  }

  start(intervalMs = 10_000): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      let requests;
      try {
        requests = await this.o.api.pending();
      } catch (err) {
        this.o.log(`gas: could not fetch requests (${msg(err)})`);
        return;
      }
      for (const r of requests) {
        try {
          if (!(await this.handle(r.id, r.wallet, r.kind ?? "gas"))) break;
        } catch (err) {
          this.o.log(`gas: request ${r.id} failed this round (${msg(err)})`);
        }
      }
    } finally {
      this.ticking = false;
    }
  }

  private record(id: number, e: Entry): void {
    const s = this.o.store.read();
    s[String(id)] = e;
    this.o.store.write(s);
  }

  private async report(id: number, status: GasStatus, tx?: string): Promise<void> {
    this.record(id, { status, tx });
    await this.o.api.done(id, status, tx);
  }

  /** Returns false to stop the batch (balance floor). */
  private async handle(id: number, wallet: string, kind: Kind): Promise<boolean> {
    const prior = this.o.store.read()[String(id)];
    if (prior && prior.status !== "sending") {
      await this.o.api.done(id, prior.status, prior.tx); // reported before the restart, the app just missed it
      return true;
    }
    if (prior?.tx) {
      // Submitted before a restart: follow that tx rather than send again.
      const ok = await this.o.chain.wait(prior.tx);
      await this.report(id, ok ? "sent" : "failed", prior.tx);
      return true;
    }
    if (kind === "wif" && !this.o.chain.mintWif) {
      await this.report(id, "skipped");
      return true;
    }
    if (kind === "gas" && (await this.o.chain.balanceOf(wallet)) >= this.o.below) {
      await this.report(id, "skipped");
      return true;
    }
    const approval = this.o.approvalAmount ?? 0n;
    if (kind === "approval" && (approval === 0n || (await this.o.chain.balanceOf(wallet)) >= approval)) {
      await this.report(id, "skipped"); // off, or the wallet can already pay for its own approval
      return true;
    }
    const value = kind === "gas" ? this.o.amount : kind === "approval" ? approval : 0n;
    const keeper = await this.o.chain.keeperBalance();
    if (keeper < this.o.minBalance + value) {
      const now = this.o.now();
      if (now - this.lastAlert >= ALERT_EVERY_SEC) {
        this.lastAlert = now;
        this.o.log(`ALERT gas: keeper balance ${keeper} wei is too low to send starter gas, top it up`);
      }
      return false;
    }
    this.record(id, { status: "sending" });
    const hash = kind === "wif" ? await this.o.chain.mintWif!(wallet) : await this.o.chain.send(wallet, value);
    this.record(id, { status: "sending", tx: hash });
    const ok = await this.o.chain.wait(hash);
    await this.report(id, ok ? "sent" : "failed", hash);
    this.o.log(`${kind === "wif" ? "faucet" : kind === "approval" ? "approval gas" : "gas"}: ${ok ? "sent" : "reverted"} request ${id} to ${wallet} (${hash})`);
    return true;
  }
}

export function httpGasApi(fetchFn: FetchFn, base: string, secret: string): GasApi {
  const post = async (path: string, body: unknown) => {
    const res = await signedPost(fetchFn, `${base}${path}`, secret, body);
    if (!res.ok) throw new Error(`${path} answered ${res.status}`);
    return res;
  };
  return {
    async pending() {
      const j = (await (await post("/api/gas/pending", {})).json()) as { requests?: { id: number; wallet: string; kind?: Kind }[] };
      return j.requests ?? [];
    },
    async done(id, status, tx) {
      await post("/api/gas/done", { id, status, tx });
    },
  };
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
