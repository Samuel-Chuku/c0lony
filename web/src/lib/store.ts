"use client";
// A tiny read cache: every chain or API read goes through useQuery(key, fetcher, intervalMs).
// Same key = one request shared by every screen. invalidate(prefix) refetches after a transaction.
import { useEffect, useSyncExternalStore } from "react";

type Entry = { data?: unknown; error?: Error; at: number; inflight?: Promise<void> };

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const fetchers = new Map<string, () => Promise<unknown>>();

function emit(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

function load(key: string): Promise<void> {
  const fetcher = fetchers.get(key);
  if (!fetcher) return Promise.resolve();
  const prev = cache.get(key) ?? { at: 0 };
  if (prev.inflight) return prev.inflight;
  const inflight = fetcher()
    .then((data) => {
      cache.set(key, { data, at: Date.now() });
    })
    .catch((error: unknown) => {
      cache.set(key, { data: prev.data, error: error instanceof Error ? error : new Error(String(error)), at: Date.now() });
    })
    .finally(() => emit(key));
  cache.set(key, { ...prev, inflight });
  return inflight;
}

/** Refetches every cached key that starts with `prefix` (all keys when empty). */
export function invalidate(prefix = ""): Promise<void> {
  const keys = [...fetchers.keys()].filter((k) => k.startsWith(prefix));
  return Promise.all(keys.map(load)).then(() => undefined);
}

export type Query<T> = { data: T | undefined; error: Error | undefined; loading: boolean; refresh: () => Promise<void> };

/**
 * Reads `key` with `fetcher`, polling every `intervalMs` while the page is visible. A null key skips the read
 * (e.g. no wallet yet). `data` keeps the last good value when a refresh fails, so screens don't flash.
 */
export function useQuery<T>(key: string | null, fetcher: () => Promise<T>, intervalMs = 0): Query<T> {
  if (key) fetchers.set(key, fetcher);

  const entry = useSyncExternalStore(
    (cb) => {
      if (!key) return () => {};
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(cb);
      return () => set!.delete(cb);
    },
    () => (key ? cache.get(key) : undefined),
    () => undefined,
  );

  useEffect(() => {
    if (!key) return;
    const e = cache.get(key);
    if (!e || (!e.inflight && Date.now() - e.at > 2000)) void load(key);
    if (!intervalMs) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load(key);
    }, intervalMs);
    return () => clearInterval(id);
  }, [key, intervalMs]);

  return {
    data: entry?.data as T | undefined,
    error: entry?.error,
    loading: !!key && entry?.data === undefined && !entry?.error,
    refresh: () => (key ? load(key) : Promise.resolve()),
  };
}
