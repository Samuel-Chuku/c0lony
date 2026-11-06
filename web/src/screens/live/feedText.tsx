"use client";
// Turns a feed row into the kind label, tone and sentence the Live feed and profile activity show.
// Sealed raids never name a resource: "MARCHING" and "is guarding" only. Resources appear once a roll lands.
import Link from "next/link";
import type { ReactNode } from "react";
import type { FeedEvent } from "../../lib/api";
import { ResIcon } from "../../ui/ResIcon";
import { displayName, fmtInt, fmtRes, fmtWif } from "../../lib/format";
import { useXProfile } from "../../lib/useXProfile";
import { drandRoundUrl } from "../../lib/raids";

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
export const QUIET_TYPES = new Set(["paid", "assigned"]);

/** A tappable handle (or "you") that opens that player's profile. */
export function Handle({ addr, me, cap }: { addr: string; me?: string | null; cap?: boolean }) {
  const x = useXProfile(addr);
  const label = me && addr.toLowerCase() === me.toLowerCase() ? (cap ? "You" : "you") : displayName(addr.toLowerCase(), x?.xHandle);
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
  const isMe = (addr?: string) => !!me && !!addr && addr.toLowerCase() === me.toLowerCase();
  /** Subject of a sentence: "You" / "<handle>", with the right verb form. */
  const S = (addr: string, you: string, other: string) => <>{isMe(addr) ? <Handle addr={addr} me={me} cap /> : H(addr)} {isMe(addr) ? you : other}</>;
  const raider = str(d.raider) || a0;
  const defender = str(d.defender) || ev.actors[1];
  const raidId = d.raidId !== undefined ? String(d.raidId) : undefined;
  const guardFor = str(d.raider) || undefined;
  const base = { actor: a0, raidId };

  switch (ev.type) {
    case "founded":
      return { ...base, kind: "FOUNDED", tone: "sub", shareText: "I founded a colony on C0LONY.",
        sentence: <>{S(a0, "founded", "founded")} a colony on day {num(d.seasonDay)}</> };
    case "fed":
      return { ...base, kind: "FED", tone: "sub", sentence: <>{S(a0, "fed your queen", "fed the queen")}</> };
    case "tended": {
      const leaves = big(d.leaves);
      const sugar = big(d.sugar);
      if (leaves === 0n && sugar === 0n) return null;
      return { ...base, kind: "TENDED", tone: "sub", sentence: <>{S(a0, "brought in", "brought in")}{leaves > 0n ? <> {fmtRes(leaves)} <ResIcon name="leaf" size={16} label="leaves" /></> : null}{leaves > 0n && sugar > 0n ? " and" : null}{sugar > 0n ? <> {fmtRes(sugar)} <ResIcon name="sugar" size={16} label="sugar" /></> : null}</> };
    }
    case "built": {
      const b = str(d.building);
      const n = num(d.count);
      return { ...base, kind: "BUILT", tone: "sub", sentence: <>{S(a0, "built", "built")} {b ? `a ${b}` : "something new"}{b && n > 1 ? ` · ${fmtInt(n)} now` : ""}</> };
    }
    case "sped_up":
      return { ...base, kind: "SPEED UP", tone: "sub", sentence: <>{S(a0, "sped up your foraging", "sped up foraging")}</> };
    case "shielded":
      return { ...base, kind: "SHIELD", tone: "sub", sentence: <>{S(a0, "raised a shield", "raised a shield")}</> };
    case "revived":
      return { ...base, kind: "REVIVED", tone: "sub", sentence: <>{S(a0, "brought your queen back", "brought the queen back")}</> };
    case "collapsed":
      return { ...base, kind: "FALLEN", tone: "sub", sentence: isMe(a0) ? <>Your queen starved. Your colony fell.</> : <>The queen of {H(a0)} starved. The colony fell.</> };
    case "raid_launched":
      return { ...base, actor: raider, kind: "MARCHING", tone: "raid",
        sentence: isMe(defender) ? <>{H(raider)} is marching on you</> : <>{S(raider, "are marching on", "is marching on")} {H(defender)}</> };
    case "guarded":
      return { ...base, actor: defender, kind: "GUARDING", tone: "sub", sentence: guardFor && guardFor.toLowerCase() !== defender?.toLowerCase() ? <>{S(defender, "are guarding against", "is guarding against")} {H(guardFor)}</> : <>{S(defender, "are guarding", "is guarding")}</> };
    case "revealed":
      return { ...base, actor: raider, kind: "ROLLING", tone: "raid",
        sentence: (
          <>
            {isMe(raider) ? "Your raid" : <>The raid of {H(raider)}</>} on {isMe(defender) ? "you" : H(defender ?? raider)} is revealed. The result lands shortly.
            {num(d.round) > 0 ? <> <a className="c0-feed__verify" href={drandRoundUrl(BigInt(num(d.round)))} target="_blank" rel="noopener noreferrer">verify roll ›</a></> : null}
          </>
        ) };
    case "settled": {
      const out = str(d.outcome);
      const lost = num(d.soldiersLost);
      if (out === "raider_won") {
        const res = str(d.lootResource) || "loot";
        const youWereRaided = !!me && defender?.toLowerCase() === me.toLowerCase();
        return { ...base, actor: raider, kind: youWereRaided ? "RAIDED" : "RAID WON", tone: "raid",
          shareText: "My ants came home with loot on C0LONY.",
          sentence: <>{S(raider, "raided", "raided")} {H(defender)} and took {fmtRes(big(d.lootAmount))} {res === "leaves" || res === "sugar" ? <ResIcon name={res === "leaves" ? "leaf" : "sugar"} size={16} label={res} /> : res}</> };
      }
      if (out === "guarded") {
        return { ...base, actor: defender, kind: "DEFENDED", tone: "sub", shareText: "My guard held on C0LONY.",
          sentence: <>{S(defender, "guarded", "guarded")} the right store. {H(raider)} went home empty.</> };
      }
      return { ...base, actor: defender, kind: "DEFENDED", tone: "sub", shareText: "My colony held off a raid on C0LONY.",
        sentence: <>{S(defender, "held off", "held off")} {H(raider)}{lost > 0 ? `. ${fmtInt(lost)} ants fell` : ""}</> };
    }
    case "collected": {
      const refunded = str(d.status) === "refunded";
      return { ...base, actor: raider, kind: "RECALLED", tone: "sub",
        sentence: <>{isMe(raider ?? a0) ? "Your raid" : <>The raid of {H(raider ?? a0)}</>} ended without a roll{refunded ? ". The ants came home" : ""}</> };
    }
    case "avenge_granted":
      return { ...base, actor: defender, kind: "AVENGE", tone: "raid",
        sentence: <>{S(defender, "can raid", "can raid")} {H(raider)} back for free</> };
    case "sponsored":
      return { ...base, kind: "SPONSOR", tone: "sub",
        sentence: <>{S(a0, "added", "added")} {fmtWif(big(d.amount))} WIF to the pot</> };
    case "season_ended":
      return { kind: "SEASON", tone: "sub", sentence: <>Season {num(d.season)} is over. The pot is {fmtWif(big(d.pot))} WIF.</> };
    case "season_finalized":
      return { kind: "SEASON", tone: "sub", sentence: <>Season {num(d.season)} is ranked. {num(d.topCount)} colonies share the pot.</> };
    case "claimed":
      return { ...base, kind: "CLAIMED", tone: "sub", shareText: "I claimed my share of the C0LONY pot.",
        sentence: <>{S(a0, "claimed", "claimed")} {fmtWif(big(d.amount))} WIF from the pot</> };
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
