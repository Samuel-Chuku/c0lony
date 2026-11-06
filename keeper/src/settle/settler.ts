// Reveals timelocked raids once their quicknet round opens them, settles revealed raids once their evmnet round
// is out, and closes raids that ended without a roll.
//
// Safety, in order: a raid is only sent if the chain still says Revealed; at most one tx per raid is in flight;
// raids are handled one at a time and each tx is awaited to a receipt; the keeper stops sending when its balance
// is below the floor. Anyone can settle, so another settler winning the race is normal and just drops the raid.
import { RAID_STATUS, type GameReader } from "../chain.ts";
import type { RawEvent } from "../feed/decode.ts";
import { commitmentFor, type Opened, type Unsealer } from "./unseal.ts";

const SETTLE_DELAY_SEC = 60; // after the round's publish time, so the signature exists everywhere
const SETTLE_TIMEOUT_SEC = 48 * 3600; // contract: a revealed raid unsettled this long after its round can be collected
const SEALED_RECHECK_SEC = 15 * 60;
const RETRY_SEC = 10;
const ALERT_EVERY_SEC = 3600;

/** What the settler needs from the keeper wallet. send() resolves after the receipt and returns true on success. */
export interface SettleWallet {
  balance(): Promise<bigint>;
  send(fn: "settle" | "collect" | "reveal", raidId: bigint, arg?: string | Opened): Promise<boolean>;
}

type Tracked =
  // `sealed` holds the timelocked target (hex) while the keeper still has to reveal the raid.
  | { state: "sealed"; nextCheck: number; sealed?: `0x${string}`; nextReveal?: number }
  | { state: "revealed"; round: number; roundTime: number; nextTry: number };

export class Settler {
  private readonly o: {
    reader: GameReader;
    wallet: SettleWallet;
    signature: (round: number) => Promise<string | null>;
    unseal: Unsealer;
    minBalance: bigint;
    now: () => number;
    log: (m: string) => void;
  };
  private readonly tracked = new Map<string, Tracked>();
  private readonly inFlight = new Set<string>();
  private lastAlert = 0;
  private sealedLifetime?: number;
  private guardWindow?: number;
  private ticking = false;
  private timer?: NodeJS.Timeout;

  constructor(opts: {
    reader: GameReader;
    wallet: SettleWallet;
    signature: (round: number) => Promise<string | null>;
    unseal?: Unsealer;
    minBalance: bigint;
    now?: () => number;
    log?: (m: string) => void;
  }) {
    this.o = { now: () => Math.floor(Date.now() / 1000), log: () => {}, unseal: async () => null, ...opts };
  }

  get pendingCount(): number {
    return this.tracked.size;
  }

  /** Feed it every decoded game event, live or replayed from history. It only reads raid lifecycle events. */
  onEvent(ev: RawEvent): void {
    if (ev.contract !== "game") return;
    const id = String(ev.args.raidId);
    switch (ev.name) {
      case "RaidLaunched":
        if (!this.tracked.has(id)) this.tracked.set(id, { state: "sealed", nextCheck: 0 });
        break;
      case "RaidSealed": {
        const t = this.tracked.get(id);
        if (t?.state === "sealed") t.sealed = ev.args.sealedTarget as `0x${string}`;
        else if (!t) this.tracked.set(id, { state: "sealed", nextCheck: 0, sealed: ev.args.sealedTarget as `0x${string}` });
        break;
      }
      case "Revealed":
        this.tracked.set(id, { state: "revealed", round: Number(ev.args.round), roundTime: Number(ev.args.roundTime), nextTry: 0 });
        break;
      case "RaidSettled":
      case "RaidCollected":
        this.tracked.delete(id);
        break;
    }
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = this.o.now();
      const entries = [...this.tracked.entries()];
      // Reveals and settlements first; deadline sweeps are lower priority.
      for (const [id, t] of entries) {
        if (t.state === "sealed" && t.sealed && now >= (t.nextReveal ?? 0)) await this.tryReveal(id, t);
      }
      for (const [id, t] of entries) {
        if (t.state === "revealed" && now >= t.roundTime + SETTLE_DELAY_SEC && now >= t.nextTry && now < t.roundTime + SETTLE_TIMEOUT_SEC) {
          await this.trySettle(id, t);
        }
      }
      for (const [id, t] of entries) {
        if (!this.tracked.has(id)) continue;
        if (t.state === "revealed" && now >= t.roundTime + SETTLE_TIMEOUT_SEC && now >= t.nextTry) await this.tryCollect(id, t);
        else if (t.state === "sealed" && now >= t.nextCheck) await this.sweepSealed(id, t);
      }
    } finally {
      this.ticking = false;
    }
  }

  start(intervalMs = 10_000): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async trySettle(id: string, t: Extract<Tracked, { state: "revealed" }>): Promise<void> {
    const raidId = BigInt(id);
    const sig = await this.o.signature(t.round);
    if (!sig) {
      t.nextTry = this.o.now() + RETRY_SEC; // round not published yet
      return;
    }
    if (!(await this.stillIn(id, raidId, RAID_STATUS.Revealed))) return;
    await this.send(id, t, "settle", raidId, sig);
  }

  /** Opens the timelocked target once the guard window is over and its round is out, checks it against the
   *  onchain commitment, and reveals. A target that will never open or does not match is dropped, and the raid
   *  falls back to the raider revealing by hand (or the deadline sweep). */
  private async tryReveal(id: string, t: Extract<Tracked, { state: "sealed" }>): Promise<void> {
    const raidId = BigInt(id);
    const now = this.o.now();
    let raid;
    try {
      raid = await this.o.reader.raid(raidId);
      this.guardWindow ??= await this.o.reader.guardWindow();
    } catch (err) {
      this.o.log(`settle: could not read raid ${id} (${msg(err)})`);
      t.nextReveal = now + RETRY_SEC;
      return;
    }
    if (raid.status !== RAID_STATUS.Sealed) {
      t.sealed = undefined; // revealed by hand, or already closed: the other paths take it from here
      return;
    }
    const opensAt = raid.launchedAt + this.guardWindow;
    if (now < opensAt) {
      t.nextReveal = opensAt;
      return;
    }
    const opened = await this.o.unseal(t.sealed!);
    if (opened === "early") {
      t.nextReveal = now + RETRY_SEC;
      return;
    }
    if (!opened || !raid.commitment || commitmentFor(opened.target, opened.salt, raidId).toLowerCase() !== raid.commitment.toLowerCase()) {
      this.o.log(`settle: raid ${id} timelocked target does not open to its commitment; leaving it to the raider`);
      t.sealed = undefined;
      return;
    }
    await this.send(id, t, "reveal", raidId, opened);
  }

  private async tryCollect(id: string, t: Extract<Tracked, { state: "revealed" }>): Promise<void> {
    const raidId = BigInt(id);
    if (!(await this.stillIn(id, raidId, RAID_STATUS.Revealed))) return;
    await this.send(id, t, "collect", raidId);
  }

  /** A sealed raid that was never revealed can be collected once guard + reveal windows are over. */
  private async sweepSealed(id: string, t: Extract<Tracked, { state: "sealed" }>): Promise<void> {
    const raidId = BigInt(id);
    t.nextCheck = this.o.now() + SEALED_RECHECK_SEC;
    let raid;
    try {
      raid = await this.o.reader.raid(raidId);
      this.sealedLifetime ??= await this.o.reader.sealedLifetime();
    } catch (err) {
      this.o.log(`settle: could not read raid ${id} (${msg(err)})`);
      return;
    }
    if (raid.status !== RAID_STATUS.Sealed) {
      if (raid.status === RAID_STATUS.Revealed) {
        // Its Revealed event has not reached us yet; it will, and then the raid moves to the settle path.
        return;
      }
      this.tracked.delete(id);
      return;
    }
    if (this.o.now() >= raid.launchedAt + this.sealedLifetime) await this.send(id, t, "collect", raidId);
  }

  /** Reads the chain; drops the raid if it is no longer in the expected status. */
  private async stillIn(id: string, raidId: bigint, want: number): Promise<boolean> {
    try {
      const raid = await this.o.reader.raid(raidId);
      if (raid.status === want) return true;
      this.tracked.delete(id); // settled or collected by someone else
      return false;
    } catch (err) {
      this.o.log(`settle: could not read raid ${id} (${msg(err)})`);
      return false;
    }
  }

  private async send(id: string, t: Tracked, fn: "settle" | "collect" | "reveal", raidId: bigint, arg?: string | Opened): Promise<void> {
    if (this.inFlight.has(id)) return;
    if (!(await this.balanceOk())) return;
    this.inFlight.add(id);
    try {
      const ok = await this.o.wallet.send(fn, raidId, arg);
      this.o.log(`settle: ${fn} raid ${id} ${ok ? "ok" : "reverted"}`);
      // Success or revert, the next status read decides: a revert usually means someone else got there first.
      // A reveal keeps the raid tracked: its Revealed event moves it on to settling.
      if (ok && fn === "reveal" && t.state === "sealed") t.sealed = undefined;
      else if (ok) this.tracked.delete(id);
      else this.retryLater(t);
    } catch (err) {
      this.o.log(`settle: ${fn} raid ${id} failed (${msg(err)})`);
      this.retryLater(t);
    } finally {
      this.inFlight.delete(id);
    }
  }

  private retryLater(t: Tracked): void {
    if (t.state === "revealed") t.nextTry = this.o.now() + RETRY_SEC * 3;
    else t.nextReveal = this.o.now() + RETRY_SEC * 3;
  }

  private async balanceOk(): Promise<boolean> {
    let bal: bigint;
    try {
      bal = await this.o.wallet.balance();
    } catch (err) {
      this.o.log(`settle: balance check failed (${msg(err)})`);
      return false;
    }
    if (bal >= this.o.minBalance) return true;
    const now = this.o.now();
    if (now - this.lastAlert >= ALERT_EVERY_SEC) {
      this.lastAlert = now;
      this.o.log(`ALERT keeper balance ${bal} wei is below the floor ${this.o.minBalance} wei: settling is paused until it is topped up`);
    }
    return false;
  }
}

const msg = (e: unknown) => (e instanceof Error ? e.message.split("\n")[0] : String(e));
