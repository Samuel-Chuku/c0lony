import type { Env } from "./env.ts";

export function json(body: unknown, status = 200, cache = "no-store"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache },
  });
}

export function fail(status: number, error: string): Response {
  return json({ error }, status);
}

export const methodNotAllowed = (): Response => fail(405, "That method is not allowed here.");

/** Functions deploy with both Pages projects; the landing one has no FEED_DB. */
export function enabled(env: Env): boolean {
  return !!env.FEED_DB;
}

export const MAX_BODY = 1_000_000;

export async function readBody(request: Request): Promise<string | null> {
  const text = await request.text();
  return text.length > MAX_BODY ? null : text;
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
