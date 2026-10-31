"use client";
// Turns a feed row into the kind label, tone and sentence the Live feed and profile activity show.
// Sealed raids never name a resource: "MARCHING" and "is guarding" only. Resources appear once a roll lands.
import Link from "next/link";
import type { ReactNode } from "react";
import type { FeedEvent } from "../../lib/api";
import { displayName, fmtInt, fmtRes, fmtWif } from "../../lib/format";
import { useXProfile } from "../../lib/useXProfile";

export type FeedLine = {
  kind: string;
  tone: "raid" | "sub";
  sentence: ReactNode;
  /** Set on rows worth sharing; the caller adds the profile link. */
  shareText?: string;
  /** The wallet whose avatar leads the row. */
  actor?: string;
  raidId?: string;
};

/** Rows that only add noise to the public feed. */
export const QUIET_TYPES = new Set(["paid", "tended", "assigned"]);

/** A tappable handle (or "you") that opens that player's profile. */
export function Handle({ addr, me }: { addr: string; me?: string | null }) {
  const x = useXProfile(addr);
  const label = me && addr.toLowerCase() === me.toLowerCase() ? "you" : displayName(addr.toLowerCase(), x?.xHandle);
  return (
    <b>
      <Link className="c0-handle" href={`/colony?addr=${addr.toLowerCase()}`}>{label}</Link>
    </b>
  );
}

const num = (v: unknown) => Number(v ?? 0);
const big = (v: unknown) => {
  try {
    return BigInt(String(v ?? "0"));
  } catch {
    return 0n;
  }
};
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Returns null for rows the feed hides. `me` is the signed-in wallet, if any. */
export function describeEvent(ev: FeedEvent, me?: string | null): FeedLine | null {
  const d = ev.data;
  const a0 = ev.actors[0];
  const H = (addr: string) => <Handle addr={addr} me={me} />;
  const raider = str(d.raider) || a0;
  const defender = str(d.defender) || ev.actors[1];
  const raidId = d.raidId !== undefined ? String(d.raidId) : undefined;
  const base = { actor: a0, raidId };

  switch (ev.type) {
    case "founded":
      return { ...base, kind: "FOUNDED", tone: "sub", shareText: "I founded a colony on C0LONY.",
        sentence: <>{H(a0)} founded a colony on day {num(d.seasonDay)}</> };
    case "fed":
      return { ...base, kind: "FED", tone: "sub", sentence: <>{H(a0)} fed the queen</> };
    case "built": {
      const b = str(d.building);
      return { ...base, kind: "BUILT", tone: "sub", sentence: <>{H(a0)} built {b ? `a ${b}` : "something new"}</> };
    }
    case "sped_up":
      return { ...base, kind: "SPEED UP", tone: "sub", sentence: <>{H(a0)} sped up foraging</> };
    case "shielded":
      return { ...base, kind: "SHIELD", tone: "sub", sentence: <>{H(a0)} raised a shield</> };
    case "revived":
      return { ...base, kind: "REVIVED", tone: "sub", sentence: <>{H(a0)} brought the queen back</> };
    case "collapsed":
      return { ...base, kind: "FALLEN", tone: "sub", sentence: <>The queen of {H(a0)} starved. The colony fell.</> };
    case "raid_launched":
      return { ...base, actor: raider, kind: "MARCHING", tone: "raid",
        sentence: <>{H(raider)} is marching on {H(defender)}</> };
    case "guarded":
      return { ...base, actor: defender, kind: "GUARDING", tone: "sub", sentence: <>{H(defender)} is guarding</> };
    case "revealed":
      return { ...base, actor: raider, kind: "ROLLING", tone: "raid",
        sentence: <>The raid of {H(raider)} on {H(defender ?? raider)} is out. Waiting for drand round {num(d.round)}.</> };
    case "settled": {
      const out = str(d.outcome);
      const lost = num(d.soldiersLost);
      if (out === "raider_won") {
        const res = str(d.lootResource) || "loot";
        const youWereRaided = !!me && defender?.toLowerCase() === me.toLowerCase();
        return { ...base, actor: raider, kind: youWereRaided ? "RAIDED" : "RAID WON", tone: "raid",
          shareText: "My ants came home with loot on C0LONY.",
          sentence: <>{H(raider)} raided {H(defender)} and carried off {fmtRes(big(d.lootAmount))} {res}</> };
      }
      if (out === "guarded") {
        return { ...base, actor: defender, kind: "DEFENDED", tone: "sub", shareText: "My guard held on C0LONY.",
          sentence: <>{H(defender)} guarded the right store. {H(raider)} went home empty.</> };
      }
      return { ...base, actor: defender, kind: "DEFENDED", tone: "sub", shareText: "My colony held off a raid on C0LONY.",
        sentence: <>{H(defender)} held off {H(raider)}{lost > 0 ? `. ${fmtInt(lost)} soldiers fell` : ""}</> };
    }
    case "collected": {
      const refunded = str(d.status) === "refunded";
      return { ...base, actor: raider, kind: "RECALLED", tone: "sub",
        sentence: <>The raid of {H(raider ?? a0)} ended without a roll{refunded ? ". The soldiers came home" : ""}</> };
    }
    case "avenge_granted":
      return { ...base, actor: defender, kind: "AVENGE", tone: "raid",
        sentence: <>{H(defender)} can raid {H(raider)} back for free</> };
    case "sponsored":
      return { ...base, kind: "SPONSOR", tone: "sub",
        sentence: <>{H(a0)} added {fmtWif(big(d.amount))} WIF to the pot</> };
    case "season_ended":
      return { kind: "SEASON", tone: "sub", sentence: <>Season {num(d.season)} is over. The pot is {fmtWif(big(d.pot))} WIF.</> };
    case "season_finalized":
      return { kind: "SEASON", tone: "sub", sentence: <>Season {num(d.season)} is ranked. {num(d.topCount)} colonies share the pot.</> };
    case "claimed":
      return { ...base, kind: "CLAIMED", tone: "sub", shareText: "I claimed my share of the C0LONY pot.",
        sentence: <>{H(a0)} claimed {fmtWif(big(d.amount))} WIF from the pot</> };
    case "unclaimed_rolled":
      return { kind: "POT", tone: "sub", sentence: <>{fmtWif(big(d.amount))} unclaimed WIF rolled into season {num(d.toSeason)}</> };
    default:
      return null;
  }
}

/** The line as it reads on someone's own profile, without leading handles (sentences stay the same). */
export function feedIntentUrl(text: string, profileAddr: string) {
  const url = `https://app.c0lony.xyz/colony?addr=${profileAddr}`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
