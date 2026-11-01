"use client";
// Starter gas: a new player's wallet gets a little ETH from the keeper before their first transaction.
// One shared state per wallet, so FoundCard, the Menu and the Get WIF sheet show the same thing and ask once.
import { useEffect, useSyncExternalStore } from "react";
import { parseEther } from "viem";
import { NETWORK_NAME } from "../config";
import { useBalances } from "./game";
import { invalidate } from "./store";
import { useSession } from "./session";

export type GasState = "idle" | "asking" | "queued" | "arrived" | "denied" | "error";
export type StarterGas = { state: GasState; message: string };

const THRESHOLD = parseEther(NETWORK_NAME === "mainnet" ? "0.00002" : "0.0002");
const DAY_MS = 86_400_000;
const WATCH_MS = 120_000;
const POLL_MS = 5_000;
export const WAITING_REASON = "Waiting for your first gas";

const IDLE: StarterGas = { state: "idle", message: "" };
const states = new Map<string, StarterGas>();
const started = new Set<string>();
const subs = new Set<() => void>();

function set(wallet: string, s: StarterGas) {
  states.set(wallet, s);
  subs.forEach((f) => f());
}

const key = (wallet: string) => `c0lony:starterGas:${wallet}`;

function lastAttempt(wallet: string): number | null {
  try {
    const n = Number(localStorage.getItem(key(wallet)));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function remember(wallet: string) {
  try {
    localStorage.setItem(key(wallet), String(Date.now()));
  } catch {
    // private mode: the server still enforces the limits
  }
}

/** While queued, refresh balances every 5 s for up to 2 minutes; the hook flips to "arrived" when ETH shows up. */
function watch(wallet: string, from = Date.now()) {
  set(wallet, { state: "queued", message: "Your first gas is on its way." });
  const id = setInterval(() => {
    const cur = states.get(wallet);
    if (!cur || cur.state !== "queued") return clearInterval(id);
    if (Date.now() - from > WATCH_MS) {
      clearInterval(id);
      set(wallet, { state: "error", message: "Your gas hasn't arrived yet. Check again in a minute." });
      return;
    }
    void invalidate("balances:");
  }, POLL_MS);
}

async function ask(wallet: string, getToken: () => Promise<string | null>) {
  const recent = lastAttempt(wallet);
  if (recent !== null) {
    if (Date.now() - recent < WATCH_MS) return watch(wallet, recent);
    if (NETWORK_NAME === "mainnet" || Date.now() - recent < DAY_MS) return;
  }
  set(wallet, { state: "asking", message: "" });
  try {
    const token = await getToken();
    if (!token) return set(wallet, IDLE);
    const res = await fetch("/api/gas/starter", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const out = (await res.json()) as { status: string; message: string };
    if (out.status === "queued") {
      remember(wallet);
      return watch(wallet);
    }
    if (out.status !== "limit") remember(wallet);
    set(wallet, { state: "denied", message: out.message });
  } catch {
    started.delete(wallet); // allow a retry on the next visit to this screen
    set(wallet, { state: "error", message: "Couldn't ask for starter gas just now." });
  }
}

export function useStarterGas(): StarterGas {
  const session = useSession();
  const wallet = session.signedIn ? session.address : null;
  const eth = useBalances(wallet).data?.eth;
  const eligible = !!wallet && eth !== undefined && eth < THRESHOLD && (NETWORK_NAME === "mainnet" ? session.embedded : true);

  const current = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => (wallet ? states.get(wallet) : undefined),
    () => undefined,
  );

  useEffect(() => {
    if (!wallet || eth === undefined) return;
    if (eth >= THRESHOLD) {
      if (states.get(wallet)?.state === "queued") set(wallet, { state: "arrived", message: "" });
      return;
    }
    if (!eligible || started.has(wallet)) return;
    started.add(wallet);
    void ask(wallet, session.getToken);
  }, [wallet, eth, eligible, session.getToken]);

  return !wallet || (eth !== undefined && eth >= THRESHOLD && current?.state !== "arrived") ? IDLE : (current ?? IDLE);
}

/** True while the player should wait for the top-up before sending a transaction. */
export const gasWaiting = (g: StarterGas) => g.state === "asking" || g.state === "queued";

/** The Underway bar shown while the top-up is on its way. */
export function gasProgressLabel(g: StarterGas): string | null {
  return gasWaiting(g) ? "Getting your first gas · a few seconds" : null;
}
