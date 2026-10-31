import type { FetchFn } from "../feed/signed.ts";

/** The drand evmnet signature for a round as 0x hex, or null if the round is not published yet (or the API is down). */
export async function fetchDrandSignature(
  fetchFn: FetchFn,
  apiUrl: string,
  chainHash: string,
  round: number,
): Promise<string | null> {
  try {
    const res = await fetchFn(`${apiUrl}/${chainHash}/public/${round}`);
    if (!res.ok) return null;
    const { signature } = (await res.json()) as { signature?: string };
    return signature && /^[0-9a-fA-F]+$/.test(signature) ? `0x${signature}` : null;
  } catch {
    return null;
  }
}
