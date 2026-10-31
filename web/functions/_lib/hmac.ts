const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signHmac(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${body}`)));
}

function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export type HmacResult = { ok: true } | { ok: false; error: string };

export async function verifyHmac(
  secret: string | undefined,
  timestamp: string | null,
  signature: string | null,
  body: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<HmacResult> {
  if (!secret) return { ok: false, error: "Signing is not configured." };
  if (!timestamp || !signature) return { ok: false, error: "Missing signature." };
  const t = Number(timestamp);
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > 300) return { ok: false, error: "Signature timestamp is stale." };
  const expected = await signHmac(secret, timestamp, body);
  return safeEqual(expected, signature.toLowerCase()) ? { ok: true } : { ok: false, error: "Invalid signature." };
}
