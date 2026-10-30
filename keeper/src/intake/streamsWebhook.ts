import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { gunzipSync } from "node:zlib";
import { timestampSeconds, verifyQuicknodeSignature } from "./hmac.ts";
import { extractLogs } from "./extract.ts";
import { matchesFilter, sortLogs, type EventSource, type LogFilter, type LogHandler } from "./types.ts";

const MAX_BODY_BYTES = 20 * 1024 * 1024;

/** Optional read-only JSON endpoints served alongside the webhooks (e.g. Voter's Pass proofs). */
export type GetHandler = (path: string) => { status: number; body: unknown } | undefined;

type Route = {
  token: string;
  filter: LogFilter;
  handler?: LogHandler;
};

/**
 * HTTP server that receives Quicknode Streams webhooks. Each stream posts to its own path and is
 * checked against its own security token. Responds 200 only after the handler has processed the batch,
 * so Quicknode retries any batch that failed.
 */
export class StreamsWebhookServer {
  private readonly routes = new Map<string, Route>();
  private readonly seenNonces = new Map<string, number>();
  private readonly maxAgeSec: number;
  private readonly log: (msg: string) => void;
  private readonly get: GetHandler | undefined;
  private server: Server | undefined;

  constructor(opts: { maxAgeSec: number; log?: (msg: string) => void; get?: GetHandler }) {
    this.maxAgeSec = opts.maxAgeSec;
    this.log = opts.log ?? (() => {});
    this.get = opts.get;
  }

  /** Registers a stream path and returns an EventSource for it. */
  route(path: string, token: string, filter: LogFilter): EventSource {
    if (!token) throw new Error(`Streams route ${path} has no security token`);
    const route: Route = { token, filter };
    this.routes.set(path, route);
    return {
      kind: "streams",
      start: async (handler: LogHandler) => {
        route.handler = handler;
      },
      stop: async () => {
        route.handler = undefined;
      },
    };
  }

  async listen(port: number, host: string): Promise<number> {
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((err) => {
        this.log(`webhook error: ${err instanceof Error ? err.message : String(err)}`);
        if (!res.headersSent) send(res, 500, "error");
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(port, host, resolve));
    const addr = this.server.address();
    return typeof addr === "object" && addr ? addr.port : port;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method === "GET" && path === "/health") return send(res, 200, "ok");
    if (req.method === "GET" && this.get) {
      const out = this.get(path);
      if (out) {
        res.writeHead(out.status, { "content-type": "application/json", "access-control-allow-origin": "*" });
        res.end(JSON.stringify(out.body));
        return;
      }
    }
    const route = this.routes.get(path);
    if (req.method !== "POST" || !route) return send(res, 404, "not found");

    const nonce = header(req, "x-qn-nonce");
    const timestamp = header(req, "x-qn-timestamp");
    const signature = header(req, "x-qn-signature");
    if (!nonce || !timestamp || !signature) return send(res, 400, "missing signature headers");

    let body = await readBody(req);
    if ((header(req, "content-encoding") ?? "").toLowerCase().includes("gzip")) body = gunzipSync(body);
    const payload = body.toString("utf8");

    if (!verifyQuicknodeSignature(route.token, payload, nonce, timestamp, signature)) {
      return send(res, 401, "bad signature");
    }
    const age = Math.floor(Date.now() / 1000) - timestampSeconds(timestamp);
    if (!Number.isFinite(age) || age > this.maxAgeSec || age < -300) return send(res, 401, "stale timestamp");
    this.pruneNonces();
    if (this.seenNonces.has(nonce)) return send(res, 200, "duplicate"); // already processed
    if (!route.handler) return send(res, 503, "not ready");

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return send(res, 400, "bad json");
    }
    const logs = sortLogs(extractLogs(parsed).filter((l) => matchesFilter(l, route.filter)));
    if (logs.length > 0) await route.handler(logs, { source: "streams" });
    this.seenNonces.set(nonce, Date.now() + this.maxAgeSec * 1000);
    send(res, 200, `ok ${logs.length}`);
  }

  private pruneNonces(): void {
    const now = Date.now();
    for (const [n, expiry] of this.seenNonces) if (expiry < now) this.seenNonces.delete(n);
  }
}

function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function send(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, { "content-type": "text/plain" });
  res.end(text);
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}
