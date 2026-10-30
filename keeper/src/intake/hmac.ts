import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a Quicknode Streams webhook signature:
 *   x-qn-signature = hex(HMAC-SHA256(securityToken, nonce + timestamp + payload))
 * where payload is the decoded (un-gzipped) request body as UTF-8.
 * https://www.quicknode.com/guides/quicknode-products/streams/validating-incoming-streams-webhook-messages
 */
export function verifyQuicknodeSignature(
  securityToken: string,
  payload: string,
  nonce: string,
  timestamp: string,
  givenSignature: string,
): boolean {
  if (!securityToken || !nonce || !timestamp || !givenSignature) return false;
  if (!/^[0-9a-fA-F]+$/.test(givenSignature)) return false;
  const computed = createHmac("sha256", Buffer.from(securityToken))
    .update(Buffer.from(nonce + timestamp + payload))
    .digest();
  const given = Buffer.from(givenSignature, "hex");
  return given.length === computed.length && timingSafeEqual(computed, given);
}

/** Converts an x-qn-timestamp (seconds or milliseconds) to seconds. */
export function timestampSeconds(ts: string): number {
  const n = Number(ts);
  if (!Number.isFinite(n)) return NaN;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}
