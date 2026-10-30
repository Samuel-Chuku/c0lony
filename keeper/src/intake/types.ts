/** A log in standard JSON-RPC shape (hex strings), as returned by eth_getLogs. */
export type RawLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
  blockHash?: string;
  removed?: boolean;
};

/** Which logs a source should deliver. Topic filters follow eth_getLogs rules (OR within a position). */
export type LogFilter = {
  addresses: string[];
  topics: (string[] | null)[];
};

export type DeliveryInfo = {
  source: "streams" | "poll";
  fromBlock?: number;
  toBlock?: number;
};

/** Called with each batch of matching logs. Must be idempotent: a batch may be delivered more than once. */
export type LogHandler = (logs: RawLog[], info: DeliveryInfo) => Promise<void>;

/** One interface for event intake, whether logs arrive by Quicknode Streams webhook or by polling. */
export interface EventSource {
  readonly kind: "streams" | "poll";
  start(handler: LogHandler): Promise<void>;
  stop(): Promise<void>;
}

export function logKey(log: RawLog): string {
  return `${log.transactionHash.toLowerCase()}:${BigInt(log.logIndex)}`;
}

export function matchesFilter(log: RawLog, filter: LogFilter): boolean {
  if (log.removed) return false;
  const addrs = filter.addresses.map((a) => a.toLowerCase());
  if (addrs.length > 0 && !addrs.includes(log.address.toLowerCase())) return false;
  for (let i = 0; i < filter.topics.length; i++) {
    const want = filter.topics[i];
    if (want === null || want === undefined) continue;
    const got = log.topics[i]?.toLowerCase();
    if (got === undefined || !want.map((t) => t.toLowerCase()).includes(got)) return false;
  }
  return true;
}

/** Pads an address to a 32-byte topic. */
export function addressTopic(address: string): string {
  return "0x" + address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

export function sortLogs(logs: RawLog[]): RawLog[] {
  return [...logs].sort((a, b) => {
    const db = BigInt(a.blockNumber) - BigInt(b.blockNumber);
    if (db !== 0n) return db < 0n ? -1 : 1;
    const dl = BigInt(a.logIndex) - BigInt(b.logIndex);
    return dl === 0n ? 0 : dl < 0n ? -1 : 1;
  });
}
