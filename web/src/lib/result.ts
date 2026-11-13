"use client";
// A tiny global store for the result modal that opens after every action (success or failure).
import { useSyncExternalStore, type ReactNode } from "react";
import type { Hash } from "viem";

export type ResultContent = {
  title: string;
  lines?: ReactNode[];
  /** raid tints the first line red. Plain by default. */
  tone?: "wif" | "raid" | "plain";
  failed?: boolean;
  /** A small picture above the lines: "gift" is an ant tossing a WIF coin to another. */
  art?: "gift";
  hash?: Hash | null;
  /** An in-app follow-up, e.g. "Read the report" or "Avenge · raid them back". */
  link?: { href: string; label: string };
  /** The action failed because the wallet has no ETH left: offer to swap WIF for gas (only if packs are on sale). */
  gasOffer?: boolean;
};

let current: ResultContent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showResult(r: ResultContent) {
  current = r;
  emit();
}
export function closeResult() {
  current = null;
  emit();
}
export function useResult(): ResultContent | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null,
  );
}
