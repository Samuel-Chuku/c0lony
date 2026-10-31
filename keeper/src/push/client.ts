// Talks to the app for push: which browsers to notify (signed), X handles (public), and the Web Push send itself.
import { signedPost, type FetchFn } from "../feed/signed.ts";
import type { PushPayload } from "./scheduler.ts";

export type PushTarget = {
  wallet: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  prefs: Record<string, boolean>;
};

/** web-push's sendNotification, injectable for tests. Errors carry statusCode. */
export type SendFn = (
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  body: string,
) => Promise<unknown>;

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export class PushClient {
  private readonly o: { apiBase: string; secret: string; send: SendFn; fetchFn: FetchFn; log: (m: string) => void };
  private readonly handleCache = new Map<string, string | null>();

  constructor(opts: { apiBase: string; secret: string; send: SendFn; fetchFn?: FetchFn; log?: (m: string) => void }) {
    this.o = { fetchFn: fetch, log: () => {}, ...opts };
  }

  async targets(wallets: string[]): Promise<PushTarget[]> {
    const res = await signedPost(this.o.fetchFn, `${this.o.apiBase}/api/push/targets`, this.o.secret, { wallets });
    if (!res.ok) throw new Error(`push/targets HTTP ${res.status}`);
    return ((await res.json()) as { targets: PushTarget[] }).targets;
  }

  async prune(endpoints: string[]): Promise<void> {
    if (endpoints.length === 0) return;
    const res = await signedPost(this.o.fetchFn, `${this.o.apiBase}/api/push/prune`, this.o.secret, { endpoints });
    if (!res.ok) this.o.log(`push: prune failed HTTP ${res.status}`);
  }

  /** "@handle" when the wallet has a linked X account, else 0x12ab…cd34. Never throws. */
  async label(wallet: string): Promise<string> {
    const w = wallet.toLowerCase();
    if (!this.handleCache.has(w)) {
      let handle: string | null = null;
      try {
        const res = await this.o.fetchFn(`${this.o.apiBase}/api/profiles?wallets=${w}`);
        if (res.ok) {
          const p = ((await res.json()) as { profiles: Record<string, { xHandle?: string }> }).profiles?.[w];
          handle = p?.xHandle ? p.xHandle.replace(/^@/, "") : null;
        }
      } catch {
        return shortAddr(w); // do not cache a failure
      }
      this.handleCache.set(w, handle);
    }
    const h = this.handleCache.get(w);
    return h ? `@${h}` : shortAddr(w);
  }

  /** Sends to every subscribed browser of `wallet` that has `pref` on. Returns how many were delivered. */
  async notify(wallet: string, pref: string, payload: PushPayload): Promise<number> {
    const targets = (await this.targets([wallet.toLowerCase()])).filter(
      (t) => t.wallet.toLowerCase() === wallet.toLowerCase() && t.prefs?.[pref] !== false,
    );
    const gone: string[] = [];
    let delivered = 0;
    for (const t of targets) {
      try {
        await this.o.send({ endpoint: t.endpoint, keys: t.keys }, JSON.stringify(payload));
        delivered++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(t.endpoint);
        else this.o.log(`push: send to ${t.endpoint.slice(0, 40)}… failed (${err instanceof Error ? err.message : err})`);
      }
    }
    await this.prune(gone);
    return delivered;
  }
}
