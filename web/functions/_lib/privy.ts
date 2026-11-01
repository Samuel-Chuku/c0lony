import { importSPKI, jwtVerify } from "jose";
import type { Env } from "./env.ts";
import { normAddr } from "./validate.ts";

export type Profile = { wallets: string[]; embedded?: string[]; xHandle: string | null; xAvatar: string | null; updatedAt: number };

export function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : null;
}

/** Returns the user DID, or null if the token is missing/invalid. */
export async function verifyPrivyToken(token: string | null, env: Env): Promise<string | null> {
  if (!token || !env.PRIVY_VERIFICATION_KEY || !env.PRIVY_APP_ID) return null;
  try {
    const pem = env.PRIVY_VERIFICATION_KEY.replace(/\\n/g, "\n");
    const key = await importSPKI(pem, "ES256");
    const { payload } = await jwtVerify(token, key, { issuer: "privy.io", audience: env.PRIVY_APP_ID });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

type LinkedAccount = {
  type?: string; username?: string; profile_picture_url?: string; address?: string; chain_type?: string;
  wallet_client_type?: string;
};

export async function fetchPrivyProfile(did: string, env: Env, fetchImpl: typeof fetch = fetch): Promise<Profile | null> {
  if (!env.PRIVY_APP_ID || !env.PRIVY_APP_SECRET) return null;
  const res = await fetchImpl(`https://api.privy.io/v1/users/${encodeURIComponent(did)}`, {
    headers: {
      "privy-app-id": env.PRIVY_APP_ID,
      authorization: `Basic ${btoa(`${env.PRIVY_APP_ID}:${env.PRIVY_APP_SECRET}`)}`,
    },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { linked_accounts?: LinkedAccount[] };
  const accounts = user.linked_accounts ?? [];
  const wallets: string[] = [];
  const embedded: string[] = [];
  let xHandle: string | null = null;
  let xAvatar: string | null = null;
  for (const a of accounts) {
    if (a.type === "twitter_oauth") {
      xHandle = a.username ?? xHandle;
      xAvatar = a.profile_picture_url ?? xAvatar;
    } else if (a.type === "wallet" && a.chain_type === "ethereum") {
      const w = normAddr(a.address);
      if (w && !wallets.includes(w)) wallets.push(w);
      if (w && a.wallet_client_type === "privy" && !embedded.includes(w)) embedded.push(w);
    }
  }
  return { wallets, embedded, xHandle, xAvatar, updatedAt: Math.floor(Date.now() / 1000) };
}

/** Fetch from Privy and write the KV records. Returns null if Privy could not be reached. */
export async function refreshProfile(did: string, env: Env, fetchImpl: typeof fetch = fetch): Promise<Profile | null> {
  const kv = env.PROFILES;
  if (!kv) return null;
  const p = await fetchPrivyProfile(did, env, fetchImpl);
  if (!p) return null;
  await kv.put(`u:${did}`, JSON.stringify(p));
  for (const wallet of p.wallets) {
    await kv.put(`w:${wallet}`, JSON.stringify({ wallet, xHandle: p.xHandle, xAvatar: p.xAvatar, updatedAt: p.updatedAt }));
  }
  return p;
}

export async function userWallets(did: string, env: Env, fetchImpl: typeof fetch = fetch): Promise<string[] | null> {
  const stored = env.PROFILES ? ((await env.PROFILES.get(`u:${did}`, "json")) as Profile | null) : null;
  if (stored) return stored.wallets;
  const fresh = await refreshProfile(did, env, fetchImpl);
  return fresh ? fresh.wallets : null;
}

/** The stored profile, refreshed from Privy when missing, when it lacks the wallet, or when it predates `embedded`. */
export async function profileFor(
  did: string, wallet: string, env: Env, fetchImpl: typeof fetch = fetch,
): Promise<Profile | null> {
  const stored = env.PROFILES ? ((await env.PROFILES.get(`u:${did}`, "json")) as Profile | null) : null;
  if (stored && stored.embedded && stored.wallets.includes(wallet)) return stored;
  return refreshProfile(did, env, fetchImpl);
}
