"use client";
import { useSyncExternalStore } from "react";
import { requestProfile, subscribeProfiles, type XProfile } from "./api";

/** X handle and avatar for a wallet, or null when none is linked. undefined while loading. */
export function useXProfile(wallet: string | null | undefined): XProfile | null | undefined {
  return useSyncExternalStore(
    subscribeProfiles,
    () => (wallet ? requestProfile(wallet) : null),
    () => undefined,
  );
}
