import { existsSync, readFileSync } from "node:fs";
import { decodeRaw } from "../feed/decode.ts";
import type { RawLog } from "../intake/types.ts";
import type { Settler } from "./settler.ts";

/** Rebuilds the settler's pending raids from the saved event log (events.jsonl) after a restart. The chain is re-checked before any tx. */
export function replayHistory(file: string, settler: Settler, gameAddress: string, potAddress: string): number {
  if (!existsSync(file)) return 0;
  let n = 0;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const ev = decodeRaw(JSON.parse(line) as RawLog, gameAddress, potAddress);
      if (ev) {
        settler.onEvent(ev);
        n++;
      }
    } catch {
      // a torn last line after a crash is ignored
    }
  }
  return n;
}
