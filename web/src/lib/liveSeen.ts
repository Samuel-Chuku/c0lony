"use client";
// The newest Live feed row the player has seen, so the Live tab can show a dot when there is something new.
import { useSyncExternalStore } from "react";

const KEY = "c0lony:liveSeen";
const listeners = new Set<() => void>();

function read(): number | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? null : Number(v) || 0;
  } catch {
    return null;
  }
}

export function markLiveSeen(id: number) {
  const cur = read();
  if (cur !== null && cur >= id) return;
  try { localStorage.setItem(KEY, String(id)); } catch { /* storage blocked */ }
  listeners.forEach((l) => l());
}

export function useLiveSeen(): number | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => null,
  );
}
