"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Hand, Panel, Underway } from "../../ui";
import { Screen } from "../../shell/Screen";
import { Outcome, RaidStatus, Resource, useAvenge, useColonies, useGameConfig, useNow, useRaid } from "../../lib/game";
import { useFeed } from "../../lib/api";
import { fmtDuration, fmtRes } from "../../lib/format";
import { drandRoundUrl } from "../../lib/raids";
import { useSession } from "../../lib/session";
import { RaidSketch } from "./RaidSketch";
import { ShieldButton } from "./ShieldButton";
import { Tracker } from "./Tracker";
import { profileUrl, stepOf, useColonyView, useWho, xIntent } from "./shared";

const resName = (r: unknown) => (r === Resource.Leaves || r === "leaves" ? "leaves" : "sugar");

export function RaidReport() {
  const router = useRouter();
  const session = useSession();
  const now = useNow();
  const cfg = useGameConfig().data;
  const colonies = useColonies().data;
  const idParam = useSearchParams().get("raid");
  let raidId: bigint | null = null;
  try {
    raidId = idParam ? BigInt(idParam) : null;
  } catch {
    raidId = null;
  }
  const raidQ = useRaid(raidId);
  const raid = raidQ.data;
  const feed = useFeed("raids", session.address, 50).data;
  const row = feed?.find((e) => e.type === "settled" && e.data.raidId === String(raidId));

  const raiderOwner = useColonyView(raid?.raider).data?.data.owner.toLowerCase();
  const defenderOwner = useColonyView(raid?.defender).data?.data.owner.toLowerCase();
  const me = session.address;
  const iDefended = !!me && defenderOwner === me;
  const iRaided = !!me && raiderOwner === me;
  const raiderWho = useWho(raiderOwner);
  const defenderWho = useWho(defenderOwner);
  const avenge = useAvenge(iDefended ? me : null, raiderOwner).data;
  const mine = colonies?.find((c) => c.owner === me);
  const cooldownLeft = mine && mine.lastRaidLaunch > 0 && cfg ? Math.max(0, mine.lastRaidLaunch + Number(cfg.raidCooldown) - now) : 0;

  if (raidQ.loading || !cfg || (raid && raid.status !== RaidStatus.None && (!raiderOwner || !defenderOwner))) {
    return <Screen back><Underway label="Opening the journal" /></Screen>;
  }
  if (!raid || raid.status === RaidStatus.None || raid.raider === 0n) {
    return (
      <Screen back>
        <Panel rule><p style={{ margin: 0 }}>We couldn&apos;t find that raid. Check the link, or open your raids from the Raids tab.</p></Panel>
        <Link href="/?tab=raids" className="c0-btn c0-btn--paper" style={{ textDecoration: "none" }}>Open Raids</Link>
      </Screen>
    );
  }

  const settled = raid.status === RaidStatus.Settled;
  if (!settled) {
    const guardWindow = Number(cfg.guardWindow);
    const step = stepOf(raid, now, guardWindow);
    const copy =
      raid.status === RaidStatus.Failed
        ? "The raider missed the reveal window, so the raid ended without a roll and the marching ants were lost."
        : raid.status === RaidStatus.Refunded
          ? "No roll came in within 48 hours, so the marching ants were sent home."
          : step === "sealed"
            ? `Sealed. The target stays hidden and ${iDefended ? "you can still guard for " + fmtDuration(Number(raid.launchedAt) + guardWindow - now) : "the guard window is still open"}.`
            : step === "marching"
              ? "The ants are marching. The raid reveals itself once the guard window closes."
              : "Revealed. The roll comes from a public drand round and lands as soon as it is published.";
    return (
      <Screen back>
        <article className="c0-journal">
          <div className="c0-journal__margin" aria-hidden="true" />
          <div className="c0-journal__date">Raid #{String(raid.id)}</div>
          <h1>{raiderWho.name} on {defenderWho.name}</h1>
          <Tracker at={raid.status === RaidStatus.Failed || raid.status === RaidStatus.Refunded ? "home" : step} />
          <div className="c0-journal__remark">{copy}</div>
        </article>
        <Link href="/?tab=raids" className="c0-btn c0-btn--paper" style={{ textDecoration: "none" }}>Open Raids</Link>
      </Screen>
    );
  }

  // ---- settled
  const won = raid.outcome === Outcome.RaiderWon;
  const guardedOut = raid.outcome === Outcome.Guarded;
  const target = resName(raid.target);
  const lootRes = resName(row?.data.lootResource ?? raid.target);
  const lootAmt = row?.data.lootAmount != null ? BigInt(String(row.data.lootAmount)) : null;
  const lost = row?.data.soldiersLost != null ? Number(row.data.soldiersLost) : guardedOut ? Math.floor(raid.soldiers / 4) : 0;
  const roll = row?.data.roll != null ? Number(row.data.roll) : null;
  const round = row?.data.round != null ? String(row.data.round) : String(raid.round);

  let title: string;
  let stamp: string;
  let ink = false;
  if (iDefended) {
    title = won ? `${raiderWho.name} raided your ${target} store` : guardedOut ? `Your guard stopped ${raiderWho.name}` : `You held off ${raiderWho.name}`;
    stamp = won ? "RAIDED" : "DEFENDED";
    ink = !won;
  } else if (iRaided) {
    title = won ? `You raided ${defenderWho.name}'s ${target} store` : `${defenderWho.name} held off your raid`;
    stamp = won ? "VICTORY" : "REPELLED";
    ink = !won;
  } else {
    title = won ? `${raiderWho.name} raided ${defenderWho.name}'s ${target} store` : `${defenderWho.name} held off ${raiderWho.name}`;
    stamp = won ? "RAIDED" : "REPELLED";
    ink = !won;
  }

  let remark: string;
  const share = roll !== null ? `${roll}%` : "a share";
  if (guardedOut) remark = iDefended ? "You guarded the right resource. A quarter of their marching ants fell." : "They guarded the right resource. A quarter of the marching ants did not come home.";
  else if (won && raid.guard === Resource.None) remark = iDefended ? `Nobody was on guard, so they took ${share} of your ${target}. Guarding the right resource would have stopped them.` : `No one was on guard. You took ${share} of their ${target}.`;
  else if (won) remark = iDefended ? `You guarded the other resource, so they took a bigger share: ${share}.` : `They guarded the other resource, so you took a bigger share: ${share}.`;
  else remark = iDefended ? "The raid came home empty." : "The raid came home empty.";

  const when = row ? new Date(row.ts * 1000).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

  const otherName = iDefended ? raiderWho.name : defenderWho.name;
  const gotText = lootAmt && lootAmt > 0n ? ` and took ${fmtRes(lootAmt)} ${lootRes}` : "";
  const shareText = iDefended
    ? won ? `${raiderWho.name} raided my colony on C0LONY${gotText}. Avenge incoming.` : `I held off ${raiderWho.name}'s raid on my colony on C0LONY.`
    : iRaided
      ? won ? `I just raided ${defenderWho.name}'s colony on C0LONY${gotText}.` : `${defenderWho.name} held off my raid on C0LONY. Next time.`
      : `${raiderWho.name} raided ${defenderWho.name} on C0LONY.`;
  const shareOnX = () => window.open(xIntent(shareText, profileUrl(me ?? defenderOwner ?? "")), "_blank", "noopener");
  const hoursLeft = avenge ? Math.max(1, Math.floor((avenge.expiresAt - now) / 3600)) : 0;

  return (
    <Screen back>
      <article className="c0-journal">
        <div className="c0-journal__margin" aria-hidden="true" />
        <div className="c0-journal__date">{when ? `${when} · ` : ""}raid #{String(raid.id)}</div>
        <h1>{title}</h1>
        <div className="c0-stamprow">
          <RaidSketch />
          <div className={`c0-stamp${ink ? " c0-stamp--ink" : ""}`} aria-label={`Stamp: ${stamp.toLowerCase()}`}>{stamp}</div>
        </div>
        <div>
          {lootAmt !== null ? (
            <div className={`c0-rrow${iDefended ? " c0-rrow--loss" : ""}`}>
              <span>{lootRes === "leaves" ? "Leaves" : "Sugar"} {iDefended ? "taken" : "won"}</span>
              <b>{lootAmt === 0n ? "0" : `${iDefended ? "−" : "+"}${fmtRes(lootAmt)}`}</b>
            </div>
          ) : null}
          <div className={`c0-rrow${iRaided ? " c0-rrow--loss" : ""}`}>
            <span>{iDefended ? "Raiders lost" : "Ants lost"}</span>
            <b>{lost === 0 ? "0" : `−${lost}`}</b>
          </div>
          <div className="c0-rrow">
            <span>{guardedOut ? "Guard" : "Share taken"}</span>
            <b>{guardedOut ? "held" : roll === null ? "·" : `${roll}%`}</b>
          </div>
        </div>
        <div className="c0-journal__remark">{remark}</div>
        <div className="c0-journal__verify">
          <a href={drandRoundUrl(round)} target="_blank" rel="noopener noreferrer">Roll from drand round {round} · tap to verify</a>
        </div>
      </article>

      <div className="c0-below">
        {iDefended && avenge?.ok && raiderOwner ? (
          <>
            <Button variant="raid" fullWidth className="c0-hero54" icon="raids" onClick={() => router.push(`/?tab=raids&avenge=${raiderOwner}`)}>
              Avenge · free raid back
            </Button>
            <Hand size={15} className="c0-note c0-muted">skips your cooldown · only at {otherName} · {hoursLeft}h left</Hand>
          </>
        ) : me ? (
          <Button
            variant="raid"
            fullWidth
            className="c0-hero54"
            icon="raids"
            disabledReason={cooldownLeft > 0 ? `Raid cooldown · ${fmtDuration(cooldownLeft)}` : undefined}
            onClick={() => router.push("/?tab=raids")}
          >
            Raid
          </Button>
        ) : null}
        <div className="c0-below__row">
          <Button variant="dark" onClick={shareOnX}>Share on X</Button>
          {me ? <ShieldButton size="default" icon={false} /> : null}
        </div>
      </div>
    </Screen>
  );
}
