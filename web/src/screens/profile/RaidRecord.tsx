"use client";
import { Card } from "../../ui";
import { useFeed } from "../../lib/api";
import { fmtInt, fmtRes } from "../../lib/format";
import type { Profile } from "../../lib/game";

export function RaidRecord({ addr, profile, me, isMe }: { addr: string; profile: Profile; me: string | null; isMe: boolean }) {
  const feed = useFeed("raids", addr, 200);
  const settled = (feed.data ?? []).filter((e) => e.type === "settled");

  let third: { value: string; cap: string };
  if (isMe) {
    let sugar = 0n;
    for (const e of settled) {
      if (String(e.data.raider) === addr && e.data.outcome === "raider_won" && e.data.lootResource === "sugar") sugar += BigInt(String(e.data.lootAmount ?? "0"));
    }
    third = { value: fmtRes(sugar), cap: "sugar stolen" };
  } else if (!me) {
    third = { value: "–", cap: "sign in for vs you" };
  } else {
    let w = 0;
    let l = 0;
    for (const e of settled) {
      const r = String(e.data.raider);
      const d = String(e.data.defender);
      const won = e.data.outcome === "raider_won";
      if (r === me && d === addr) won ? w++ : l++;
      else if (d === me && r === addr) won ? l++ : w++;
    }
    third = { value: `${w}–${l}`, cap: "you vs them" };
  }

  return (
    <Card className="c0-pf__record" aria-label="Raid record">
      <div className="c0-pf__cell"><div className="c0-pf__big">{fmtInt(profile.raidsWon)}–{fmtInt(profile.raidsLost)}</div><div className="c0-pf__cap">raids won–lost</div></div>
      <div className="c0-pf__cell c0-pf__cell--rule"><div className="c0-pf__big">{fmtInt(profile.raidsDefended)}/{fmtInt(profile.raidsFaced)}</div><div className="c0-pf__cap">defended</div></div>
      <div className="c0-pf__cell c0-pf__cell--rule"><div className="c0-pf__big">{third.value}</div><div className="c0-pf__cap">{third.cap}</div></div>
    </Card>
  );
}
