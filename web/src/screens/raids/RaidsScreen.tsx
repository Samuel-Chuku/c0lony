"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Hand, Panel, Underway } from "../../ui";
import { Screen } from "../../shell/Screen";
import { RaidStatus, Status, inRange, useActiveRaids, useColonies, useGameConfig, useNow, useProfile, type ColonyRow } from "../../lib/game";
import { useFeed } from "../../lib/api";
import { useSession } from "../../lib/session";
import { IncomingBanner } from "./IncomingBanner";
import { LaunchSheet, type LaunchTarget } from "./LaunchSheet";
import { NeighbourItem } from "./NeighbourItem";
import { RaidTrack } from "./RaidTrack";
import { Tracker } from "./Tracker";
import { SITE_URL, xIntent } from "./shared";
import { demoCfg, demoData } from "./demo";

export function RaidsScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const session = useSession();
  const now = useNow();
  const liveCfg = useGameConfig().data;
  const cfg = liveCfg ?? (process.env.NODE_ENV !== "production" && params.get("demo") === "1" ? demoCfg : undefined);
  const demo = process.env.NODE_ENV !== "production" && params.get("demo") === "1" ? demoData(now) : null;
  const liveProfile = useProfile(session.address).data;
  const liveColonies = useColonies().data;
  const profile = demo?.profile ?? liveProfile;
  const colonies = demo?.colonies ?? liveColonies;
  const myId = profile?.colonyId ? profile.colonyId : null;
  const liveRaids = useActiveRaids(demo ? null : myId).data;
  const raids = demo?.raids ?? liveRaids;
  const mineFeed = useFeed("mine", session.address, 30).data;

  const [sheet, setSheet] = useState<{ mode: "raid" | "avenge"; target: LaunchTarget } | null>(null);
  const [closed, setClosed] = useState<bigint[]>([]);

  // "/?tab=raids&avenge=<wallet>" opens the launch sheet in avenge mode.
  const avengeParam = params.get("avenge");
  useEffect(() => {
    if (!avengeParam || !profile?.colonyId || sheet) return;
    const wallet = avengeParam.toLowerCase();
    const row = colonies?.find((c) => c.owner === wallet);
    setSheet({ mode: "avenge", target: { wallet, colonyId: row?.id ?? null, row } });
    router.replace("/?tab=raids");
  }, [avengeParam, profile?.colonyId, colonies, sheet, router]);

  const guardWindow = Number(cfg?.guardWindow ?? 0n);
  const revealWindow = Number(cfg?.revealWindow ?? 0n);
  const alive = profile?.status === Status.Alive;

  const myAddr = demo ? demo.me : session.address;
  const mine = useMemo(() => (colonies ?? []).find((c) => c.owner === myAddr), [colonies, myAddr]);
  const cooldownLeft = mine && mine.lastRaidLaunch > 0 && cfg ? Math.max(0, mine.lastRaidLaunch + Number(cfg.raidCooldown) - now) : 0;

  const incoming = (raids ?? []).filter((r) => myId !== null && r.defender === myId);
  const outgoing = (raids ?? []).filter((r) => myId !== null && r.raider === myId);
  const banners = incoming.filter((r) => r.status === RaidStatus.Sealed && now < Number(r.launchedAt) + guardWindow);
  const tracked = [
    ...outgoing.map((r) => ({ r, role: "raider" as const })),
    ...incoming.filter((r) => !banners.includes(r)).map((r) => ({ r, role: "defender" as const })),
  ];
  const collectFirst = (raids ?? []).some((r) => r.status === RaidStatus.Sealed && now >= Number(r.launchedAt) + guardWindow + revealWindow);
  const marchingOn = new Set(outgoing.map((r) => String(r.defender)));

  const neighbours = useMemo(() => {
    if (!colonies || !profile || !alive) return [];
    return colonies
      .filter((c) => c.owner !== myAddr && c.status === Status.Alive && inRange(profile.ants, c.workers))
      .sort((a, b) => (b.sugar > a.sugar ? 1 : b.sugar < a.sugar ? -1 : 0));
  }, [colonies, profile, alive, myAddr]);

  // The wallet that raided me last, from the feed, goes first.
  const raiderWallet = mineFeed?.find((e) => e.type === "avenge_granted" && e.data.defender === session.address && Number(e.data.expiresAt) > now)?.data.raider as string | undefined;
  const ordered = raiderWallet ? [...neighbours.filter((n) => n.owner === raiderWallet), ...neighbours.filter((n) => n.owner !== raiderWallet)] : neighbours;

  const openRaid = (row: ColonyRow, avenge: boolean) => setSheet({ mode: avenge ? "avenge" : "raid", target: { wallet: row.owner, colonyId: row.id, row } });
  const shareText = "I just founded a colony on C0LONY. Come and raid me, if you dare.";
  const share = () => window.open(xIntent(shareText, `${SITE_URL}/colony?addr=${session.address}`), "_blank", "noopener");

  let gate: React.ReactNode = null;
  if (demo) gate = null;
  else if (!session.configured) gate = <Card><p style={{ margin: 0 }}>Sign-in opens soon. Raids unlock once you can found a colony.</p></Card>;
  else if (!session.ready) gate = <Underway label="Opening your colony" />;
  else if (!session.signedIn)
    gate = (
      <Card>
        <p style={{ margin: "0 0 12px" }}>Sign in to see who is in range of your colony.</p>
        <Button variant="paper" onClick={() => void session.login()}>Sign in</Button>
      </Card>
    );
  else if (!profile) gate = <Underway label="Reading your colony" />;
  else if (!myId)
    gate = (
      <Card>
        <p style={{ margin: "0 0 12px" }}>You have no colony this season. Found one, then come back to raid.</p>
        <Link href="/" className="c0-btn c0-btn--paper" style={{ textDecoration: "none" }}>Found a colony</Link>
      </Card>
    );
  else if (!alive) gate = <div className="c0-blocked">Your colony can&apos;t raid right now. Feed or revive your queen on the Colony tab.</div>;

  return (
    <Screen title="RAIDS" tab="raids">
      {gate}
      {gate === null && cfg ? (
        <>
          {banners.map((r) => <IncomingBanner key={String(r.id)} raid={r} guardWindow={guardWindow} />)}
          {tracked.map(({ r, role }) => (
            <RaidTrack key={String(r.id)} raid={r} role={role} guardWindow={guardWindow} revealWindow={revealWindow} onClosed={(id) => setClosed((c) => [...c, id])} />
          ))}
          {closed.map((id) => (
            <Panel key={String(id)} rule className="c0-rtrack">
              <Tracker at="home" />
              <Link href={`/report?raid=${id}`}><Hand size={17}>Raid is home · read the report ›</Hand></Link>
            </Panel>
          ))}
          <div className="c0-sect">
            <h2>Neighbours</h2>
            <span>sorted by sugar · {ordered.length} nearby</span>
          </div>
          {!colonies ? (
            <Underway label="Finding neighbours" />
          ) : ordered.length === 0 ? (
            <Card>
              <p style={{ margin: "0 0 12px", lineHeight: 1.4 }}>No colonies nearby yet. Share your colony and the first neighbours will show up here.</p>
              <Button variant="dark" onClick={share}>Share on X</Button>
            </Card>
          ) : (
            <div className="c0-rows">
              {ordered.map((row) => (
                <NeighbourItem
                  key={String(row.id)}
                  row={row}
                  ctx={{ me: myAddr!, cooldownLeft, collectFirst, marchingOn }}
                  onRaid={openRaid}
                  onProfile={(w) => router.push(`/colony?addr=${w}`)}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
      {profile && myId ? (
        <LaunchSheet open={!!sheet} mode={sheet?.mode ?? "raid"} target={sheet?.target ?? null} me={profile} cooldownLeft={cooldownLeft} onClose={() => setSheet(null)} />
      ) : null}
    </Screen>
  );
}
