import { createHmac } from "node:crypto";

export type FetchFn = typeof fetch;

/**
 * Headers for a signed keeper -> app request:
 *   x-c0-signature = hex(HMAC-SHA256(secret, timestamp + "." + rawBody))
 * The app rejects bad signatures and timestamps more than 300 s off, so the timestamp is taken at send time.
 */
export function signedHeaders(secret: string, rawBody: string, nowSec: number): Record<string, string> {
  const ts = String(nowSec);
  return {
    "content-type": "application/json",
    "x-c0-timestamp": ts,
    "x-c0-signature": createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex"),
  };
}

/** POSTs a JSON body with the signature headers. The body string is signed exactly as sent. */
export async function signedPost(
  fetchFn: FetchFn,
  url: string,
  secret: string,
  body: unknown,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<Response> {
  const raw = JSON.stringify(body);
  return fetchFn(url, { method: "POST", headers: signedHeaders(secret, raw, nowSec), body: raw });
}
