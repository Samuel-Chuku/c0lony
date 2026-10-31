import type { Env } from "./env.ts";
import { enabled, fail, methodNotAllowed } from "./http.ts";

type Ctx = { request: Request; env: Env };
type H = (request: Request, env: Env) => Promise<Response>;

/** Wrap a handler for one method: 404 without FEED_DB, 405 for other methods, JSON 500 on surprises. */
export function route(method: "GET" | "POST", handler: H): (ctx: Ctx) => Promise<Response> {
  return async ({ request, env }) => {
    if (!enabled(env)) return new Response("Not found", { status: 404 });
    if (request.method !== method) return methodNotAllowed();
    try {
      return await handler(request, env);
    } catch {
      return fail(500, "Something went wrong. Try again shortly.");
    }
  };
}

/** Catch-all for the other methods: 404 when disabled, else 405. */
export const fallback = ({ env }: Ctx): Response =>
  enabled(env) ? methodNotAllowed() : new Response("Not found", { status: 404 });
