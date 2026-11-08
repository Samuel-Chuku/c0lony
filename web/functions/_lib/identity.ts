// Names and pictures for players who did not link X. The name is set onchain (ColonyGame.setName) and arrives
// here through the keeper's signed feed ("named" events); the picture is uploaded by the signed-in owner.
// Both live in their own KV record, `id:<wallet>`, so a Privy refresh of the X record never wipes them.
import type { Env } from "./env.ts";
import { authed, jsonBody } from "./handlers.ts";
import { fail, json } from "./http.ts";
import { normAddr } from "./validate.ts";

export type Identity = { name?: string; avatarV?: number };

export const MAX_AVATAR_BYTES = 100_000;
const NAME_RE = /^[a-z0-9_]{3,16}$/;

export async function readIdentity(env: Env, wallet: string): Promise<Identity> {
  return ((await env.PROFILES?.get(`id:${wallet}`, "json")) as Identity | null) ?? {};
}

async function writeIdentity(env: Env, wallet: string, patch: Identity): Promise<void> {
  const cur = await readIdentity(env, wallet);
  await env.PROFILES!.put(`id:${wallet}`, JSON.stringify({ ...cur, ...patch }));
}

/** Called from the signed feed ingest for each new "named" event, in chain order. */
export async function setNameFromChain(env: Env, wallet: string, name: unknown): Promise<void> {
  const w = normAddr(wallet);
  if (!env.PROFILES || !w || typeof name !== "string" || !NAME_RE.test(name)) return;
  await writeIdentity(env, w, { name });
}

/** Image type from its first bytes. SVG and anything else is refused (an SVG can carry script). */
export function sniffImage(b: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

function fromBase64(s: string): Uint8Array | null {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** POST {wallet, image: "data:image/...;base64,..."} by the signed-in owner. The app shrinks it to 128px first. */
export async function avatarUpload(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!env.PROFILES) return fail(404, "Pictures are not on here.");
  const a = await authed(request, env, fetchImpl);
  if (a instanceof Response) return a;
  const b = await jsonBody(request);
  if (b instanceof Response) return b;
  const wallet = normAddr(b.wallet);
  if (!wallet || !a.wallets.includes(wallet)) return fail(403, "That wallet is not linked to your account.");
  if (b.image === null) {
    await env.PROFILES.delete(`img:${wallet}`);
    await writeIdentity(env, wallet, { avatarV: 0 });
    return json({ ok: true });
  }
  const m = typeof b.image === "string" ? /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(b.image) : null;
  const bytes = m ? fromBase64(m[2]) : null;
  if (!bytes) return fail(400, "That picture could not be read.");
  if (bytes.length > MAX_AVATAR_BYTES) return fail(413, "That picture is too large.");
  const type = sniffImage(bytes);
  if (!type) return fail(400, "Use a PNG, JPEG or WebP picture.");
  await env.PROFILES.put(`img:${wallet}`, JSON.stringify({ type, b64: m![2] }));
  const v = Math.floor(Date.now() / 1000);
  await writeIdentity(env, wallet, { avatarV: v });
  return json({ ok: true, v });
}

/** GET ?w=<wallet>&v=<version>: the uploaded picture. Cached for a long time; the version changes on upload. */
export async function avatarGet(request: Request, env: Env): Promise<Response> {
  const wallet = normAddr(new URL(request.url).searchParams.get("w"));
  if (!wallet || !env.PROFILES) return new Response("Not found", { status: 404 });
  const img = (await env.PROFILES.get(`img:${wallet}`, "json")) as { type: string; b64: string } | null;
  const bytes = img ? fromBase64(img.b64) : null;
  const type = bytes ? sniffImage(bytes) : null;
  if (!bytes || !type) return new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=60" } });
  return new Response(bytes, {
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}

export const avatarUrl = (wallet: string, v: number) => `/api/avatar?w=${wallet}&v=${v}`;
