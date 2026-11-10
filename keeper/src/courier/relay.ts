// WIF gas courier relay: players sign an EIP-712 "Send" in the app, the app queues it, and this loop submits it to the
// Courier contract and pays the ETH gas. The player pays a WIF fee to the keeper wallet inside the same transaction.
// Design: docs/design/2026-11-10-wif-gas-courier.md.
//
// Safety, in order: every request is re-checked here (digest, signer, fee, deadline, nonce, balance, allowance) and
// simulated before any ETH is spent; an id is written to the state file as "sending" BEFORE the broadcast and the tx
// hash right after, so a restart follows that tx and never sends the same id again; the contract's nonce would block
// a second execution anyway. The heartbeat tells the app to stop offering the feature when the keeper ETH runs low.
import { hashTypedData, recoverTypedDataAddress, type Address, type Hex } from "viem";
import { JsonStore } from "../state.ts";
import { signedPost, type FetchFn } from "../feed/signed.ts";

export const COURIER_ABI = [
  {
    type: "function", name: "send", stateMutability: "nonpayable", outputs: [],
    inputs: [
      {
        name: "s", type: "tuple",
        components: [
          { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "amount", type: "uint256" },
          { name: "fee", type: "uint256" }, { name: "feeTo", type: "address" }, { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
  },
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
] as const;

export const SEND_TYPES = {
  Send: [
    { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "amount", type: "uint256" },
    { name: "fee", type: "uint256" }, { name: "feeTo", type: "address" }, { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

const MIN_DEADLINE_LEAD_SEC = 20;
const RECEIPT_TIMEOUT_MS = 60_000;
const STUCK_CHECK_MS = 2_000;
const KEEP_FINISHED_SEC = 2 * 86400;
const ALERT_EVERY_SEC = 3600;

/** A queued request as the app's /api/courier/pending returns it. */
export type CourierRequest = {
  id: string; sender: string; receiver: string; amount: string; fee: string; feeTo: string; nonce: string; deadline: number; sig: string;
};
export type Heartbeat = { enabled: boolean; minFee: string; feeTo: string; courier: string };
export type CourierStatus = "sending" | "sent" | "failed";

type Entry = { status: CourierStatus; tx?: string; reason?: string; from?: string; nonce?: string; reported?: boolean; at: number };
type State = Record<string, Entry>;

export interface CourierApi {
  pending(beat: Heartbeat): Promise<CourierRequest[]>;
  done(id: string, status: CourierStatus, tx?: string, reason?: string): Promise<void>;
}

export type SendArgs = {
  from: Address; to: Address; amount: bigint; fee: bigint; feeTo: Address; nonce: bigint; deadline: bigint;
};

export interface CourierChain {
  keeperBalance(): Promise<bigint>;
  nonceOf(from: string): Promise<bigint>;
  tokenBalance(owner: string): Promise<bigint>;
  /** Allowance the owner gave the Courier. */
  allowance(owner: string): Promise<bigint>;
  /** null when the call would succeed, else the revert name or message. */
  simulate(send: SendArgs, sig: Hex): Promise<string | null>;
  /** Resolves with the tx hash once submitted. */
  send(send: SendArgs, sig: Hex): Promise<string>;
  receipt(hash: string, timeoutMs: number): Promise<"success" | "reverted" | "timeout">;
}

export interface Swapper {
  maybeSwap(): Promise<void>;
}

export type RelayOptions = {
  api: CourierApi;
  chain: CourierChain;
  store: JsonStore<State>;
  keeper: string; // the keeper wallet: fees are paid to it
  courier: string;
  chainId: number;
  minFee: bigint;
  minBalance: bigint;
  swapper?: Swapper;
  now?: () => number;
  log?: (m: string) => void;
};

export function toSendArgs(r: CourierRequest): SendArgs {
  return {
    from: r.sender as Address, to: r.receiver as Address, amount: BigInt(r.amount), fee: BigInt(r.fee),
    feeTo: r.feeTo as Address, nonce: BigInt(r.nonce), deadline: BigInt(r.deadline),
  };
}

export function sendTypedData(s: SendArgs, courier: string, chainId: number) {
  return {
    domain: { name: "C0LONY Courier", version: "1", chainId, verifyingContract: courier as Address },
    types: SEND_TYPES, primaryType: "Send" as const, message: s,
  };
}

export class CourierRelay {
  private readonly o: Required<Omit<RelayOptions, "swapper">> & { swapper?: Swapper };
  private ticking = false;
  private timer?: NodeJS.Timeout;
  private lastAlert = 0;

  constructor(opts: RelayOptions) {
    this.o = { now: () => Math.floor(Date.now() / 1000), log: () => {}, ...opts };
  }

  start(intervalMs = 5_000): void {
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
      let balance: bigint | undefined;
      try {
        balance = await this.o.chain.keeperBalance();
      } catch (err) {
        this.o.log(`courier: could not read the keeper balance (${msg(err)})`);
      }
      const enabled = balance !== undefined && balance >= this.o.minBalance;
      if (balance !== undefined && !enabled) this.alertLow(balance);
      let requests: CourierRequest[];
      try {
        requests = await this.o.api.pending({
          enabled, minFee: this.o.minFee.toString(), feeTo: this.o.keeper, courier: this.o.courier,
        });
      } catch (err) {
        this.o.log(`courier: could not fetch requests (${msg(err)})`);
        return;
      }
      await this.settleOwn();
      for (const r of requests) {
        try {
          if (!(await this.handle(r, balance))) break;
        } catch (err) {
          this.o.log(`courier: request ${r.id} failed this round (${msg(err)})`);
        }
      }
      if (this.o.swapper) {
        try {
          await this.o.swapper.maybeSwap();
        } catch (err) {
          this.o.log(`courier: swap skipped (${msg(err)})`);
        }
      }
    } finally {
      this.ticking = false;
    }
  }

  private alertLow(balance: bigint): void {
    const now = this.o.now();
    if (now - this.lastAlert >= ALERT_EVERY_SEC) {
      this.lastAlert = now;
      this.o.log(`ALERT courier: keeper balance ${balance} wei is under the floor, relaying is paused, top it up`);
    }
  }

  private record(id: string, e: Omit<Entry, "at">): void {
    const s = this.o.store.read();
    s[id] = { ...e, at: this.o.now() };
    this.o.store.write(s);
  }

  /** Records the final state, then tells the app; if the app can't be reached the entry stays unreported and is retried. */
  private async report(id: string, status: CourierStatus, tx?: string, reason?: string): Promise<void> {
    const prior = this.o.store.read()[id];
    this.record(id, { ...prior, status, tx: tx ?? prior?.tx, reason, reported: status === "sending" });
    await this.tell(id, status, tx ?? prior?.tx, reason);
  }

  private async tell(id: string, status: CourierStatus, tx?: string, reason?: string): Promise<void> {
    try {
      await this.o.api.done(id, status, tx, reason);
      if (status !== "sending") {
        const s = this.o.store.read();
        if (s[id]) {
          s[id].reported = true;
          this.o.store.write(s);
        }
      }
    } catch (err) {
      this.o.log(`courier: could not report ${id} as ${status} (${msg(err)}), will retry`);
    }
  }

  /** Entries this keeper started: follow submitted txs, re-report finished ones the app missed, prune old ones. */
  private async settleOwn(): Promise<void> {
    const now = this.o.now();
    const state = this.o.store.read();
    for (const [id, e] of Object.entries(state)) {
      try {
        if (e.status === "sending") await this.resolveSending(id, e);
        else if (!e.reported) await this.tell(id, e.status, e.tx, e.reason);
      } catch (err) {
        this.o.log(`courier: could not resolve ${id} (${msg(err)})`);
      }
    }
    const fresh = this.o.store.read();
    let pruned = false;
    for (const [id, e] of Object.entries(fresh)) {
      if (e.status !== "sending" && e.reported && now - e.at > KEEP_FINISHED_SEC) {
        delete fresh[id];
        pruned = true;
      }
    }
    if (pruned) this.o.store.write(fresh);
  }

  /** A "sending" entry: never resend. Use its tx; with no tx (crash before the hash came back) check the onchain nonce. */
  private async resolveSending(id: string, e: Entry): Promise<void> {
    if (e.tx) {
      const r = await this.o.chain.receipt(e.tx, STUCK_CHECK_MS);
      if (r === "timeout") return;
      await this.report(id, r === "success" ? "sent" : "failed", e.tx, r === "success" ? undefined : "reverted");
      return;
    }
    if (e.from && e.nonce !== undefined && (await this.o.chain.nonceOf(e.from)) > BigInt(e.nonce)) {
      await this.report(id, "sent"); // the nonce moved on, so the send landed; the hash was lost in the restart
    } else {
      await this.report(id, "failed", undefined, "interrupted");
    }
  }

  /** Returns false to stop the batch. */
  private async handle(r: CourierRequest, balance: bigint | undefined): Promise<boolean> {
    const prior = this.o.store.read()[r.id];
    if (prior) {
      // Already ours: follow it, never send again.
      if (prior.status === "sending") await this.resolveSending(r.id, prior);
      else await this.tell(r.id, prior.status, prior.tx, prior.reason);
      return true;
    }
    const reject = async (reason: string) => {
      await this.report(r.id, "failed", undefined, reason);
      this.o.log(`courier: rejected ${r.id} (${reason})`);
      return true;
    };
    if (balance === undefined || balance < this.o.minBalance) return false;

    const send = toSendArgs(r);
    const typed = sendTypedData(send, this.o.courier, this.o.chainId);
    if (hashTypedData(typed).toLowerCase() !== r.id.toLowerCase()) return reject("bad_digest");
    let signer: string;
    try {
      signer = await recoverTypedDataAddress({ ...typed, signature: r.sig as Hex });
    } catch {
      return reject("bad_signature");
    }
    if (signer.toLowerCase() !== r.sender.toLowerCase()) return reject("bad_signature");
    if (r.feeTo.toLowerCase() !== this.o.keeper.toLowerCase()) return reject("wrong_fee_to");
    if (send.fee < this.o.minFee) return reject("fee_too_low");
    if (send.amount === 0n) return reject("zero_amount");
    if (send.deadline < BigInt(this.o.now() + MIN_DEADLINE_LEAD_SEC)) return reject("expired");
    if ((await this.o.chain.nonceOf(r.sender)) !== send.nonce) return reject("bad_nonce");
    const need = send.amount + send.fee;
    if ((await this.o.chain.tokenBalance(r.sender)) < need) return reject("low_balance");
    if ((await this.o.chain.allowance(r.sender)) < need) return reject("low_allowance");
    const sim = await this.o.chain.simulate(send, r.sig as Hex);
    if (sim) return reject(sim);

    // Written before the broadcast: if we die between here and the hash, resolveSending reads the onchain nonce.
    this.record(r.id, { status: "sending", from: r.sender, nonce: r.nonce });
    const hash = await this.o.chain.send(send, r.sig as Hex);
    this.record(r.id, { status: "sending", tx: hash, from: r.sender, nonce: r.nonce });
    await this.tell(r.id, "sending", hash);
    const res = await this.o.chain.receipt(hash, RECEIPT_TIMEOUT_MS);
    if (res === "timeout") {
      this.o.log(`courier: ${r.id} not mined yet (${hash}), will check again`);
      return false; // keep the wallet's nonce order: wait for this one before sending more
    }
    await this.report(r.id, res === "success" ? "sent" : "failed", hash, res === "success" ? undefined : "reverted");
    this.o.log(`courier: ${res === "success" ? "sent" : "reverted"} ${r.id} (${hash})`);
    return true;
  }
}

export function httpCourierApi(fetchFn: FetchFn, base: string, secret: string, network: "testnet" | "mainnet"): CourierApi {
  const post = async (path: string, body: unknown) => {
    const res = await signedPost(fetchFn, `${base}${path}`, secret, body);
    if (!res.ok) throw new Error(`${path} answered ${res.status}`);
    return res;
  };
  return {
    async pending(beat) {
      const j = (await (await post("/api/courier/pending", { network, keeper: beat })).json()) as { requests?: CourierRequest[] };
      return j.requests ?? [];
    },
    async done(id, status, tx, reason) {
      await post("/api/courier/done", { id, status, tx, reason });
    },
  };
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
