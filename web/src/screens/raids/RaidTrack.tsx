"use client";
import { Button, Hand, Panel } from "../../ui";
import { RaidStatus, useNow, type Raid } from "../../lib/game";
import { useFeed } from "../../lib/api";
import { fmtDuration } from "../../lib/format";
import { collect, drandSignature, reveal, settle } from "../../lib/raids";
import { useSession } from "../../lib/session";
import { useQuery } from "../../lib/store";
import { collectResult, revealResult, settleResult } from "../../lib/outcomes";
import { useAction } from "../../lib/tx";
import { Tracker } from "./Tracker";
import { SETTLE_TIMEOUT, stepOf, useColonyView, useWho } from "./shared";

type Props = {
  raid: Raid;
  role: "raider" | "defender";
  guardWindow: number;
  revealWindow: number;
  /** Called when this raid was settled or collected from here, so the screen can offer the report. */
  onClosed: (raidId: bigint) => void;
};

/** Is the drand signature for this round published yet? Polls every 10 seconds until it is. */
function useRoundReady(round: bigint | null) {
  return useQuery(round && round > 0n ? `drand:${round}` : null, async () => (await drandSignature(round!)) !== null, 10_000).data === true;
}

const AUTO_REVEAL_GRACE = 15 * 60;

/** One of my open raids (as raider or defender) on the Sealed, Marching, Roll, Home tracker. */
export function RaidTrack({ raid, role, guardWindow, revealWindow, onClosed }: Props) {
  const session = useSession();
  const now = useNow();
  const otherId = role === "raider" ? raid.defender : raid.raider;
  const other = useWho(useColonyView(otherId).data?.data.owner.toLowerCase());
  const feed = useFeed("raids", session.address, 50).data;
  const revealAct = useAction("Revealing", { success: revealResult() });
  const settleAct = useAction("Settling", { success: (r) => settleResult(r, session.address) });
  const collectAct = useAction("Collecting", { success: collectResult });

  const step = stepOf(raid, now, guardWindow);
  const windowEnd = Number(raid.launchedAt) + guardWindow;
  const revealBy = windowEnd + revealWindow;
  const revealed = raid.status === RaidStatus.Revealed;
  const ready = useRoundReady(revealed ? raid.round : null);
  const revealRow = feed?.find((e) => e.type === "revealed" && e.data.raidId === String(raid.id));
  const roundTime = Number(revealRow?.data.roundTime ?? 0);
  const expired = revealed && roundTime > 0 && now >= roundTime + SETTLE_TIMEOUT;
  const missedReveal = raid.status === RaidStatus.Sealed && now >= revealBy;
  // The keeper opens the timelocked target and reveals a few minutes after the window; after that, offer it by hand.
  const keeperDue = now < windowEnd + AUTO_REVEAL_GRACE;

  const title = role === "raider" ? `Your raid on ${other.name}` : `${other.name}'s raid on you`;
  let timeText = "";
  if (step === "sealed") timeText = `guard window · ${fmtDuration(windowEnd - now)}`;
  else if (step === "marching") timeText = missedReveal ? "reveal window closed" : keeperDue ? "revealing itself" : role === "raider" ? `reveal within ${fmtDuration(revealBy - now)}` : "waiting for their roll";
  else if (step === "roll") timeText = ready ? "result lands in about a minute" : roundTime > now ? `rolling in ${fmtDuration(roundTime - now)}` : "rolling";

  // How far through the current stage the raid is, for the moving rail.
  const SETTLE_AFTER = 60; // the keeper settles about a minute after the round is published
  let progress = 0;
  if (step === "sealed") progress = (now - Number(raid.launchedAt)) / guardWindow;
  else if (step === "marching") progress = missedReveal ? 1 : (now - windowEnd) / revealWindow;
  else if (step === "roll") {
    const from = revealRow?.ts ?? 0;
    const to = roundTime + SETTLE_AFTER;
    progress = from > 0 && to > from ? Math.min(0.95, (now - from) / (to - from)) : 0.5;
  }

  const done = async (run: Promise<unknown>) => {
    if (await run) onClosed(raid.id);
  };

  return (
    <Panel rule className="c0-rtrack" aria-label={title}>
      <div className="c0-rtrack__top">
        <h2 className="c0-rtrack__title">{title}</h2>
        <span className="c0-rtrack__time">{timeText}</span>
      </div>
      <Tracker at={step} progress={progress} />
      <div className="c0-rtrack__acts">
        {step === "marching" && role === "raider" && !missedReveal && !keeperDue ? (
          <Button variant="raid" size="compact" busy={revealAct.busy ? "Revealing…" : undefined} error={revealAct.error} onClick={() => void revealAct.run(reveal(raid.id, raid.commitment))}>
            Reveal
          </Button>
        ) : null}
        {step === "roll" && ready && !expired ? (
          <Button variant="paper" size="compact" busy={settleAct.busy ? "Settling…" : undefined} error={settleAct.error} onClick={() => void done(settleAct.run(settle(raid.id, raid.round)))}>
            Settle
          </Button>
        ) : null}
        {missedReveal || expired ? (
          <Button variant="paper" size="compact" busy={collectAct.busy ? "Collecting…" : undefined} error={collectAct.error} onClick={() => void done(collectAct.run(collect(raid.id)))}>
            Collect
          </Button>
        ) : null}
      </div>
      {step === "marching" && role === "raider" && !missedReveal && !keeperDue ? (
        <Hand size={15}>it has not revealed itself yet · you can reveal it by hand</Hand>
      ) : null}
      {step === "roll" && !ready ? (
        <Hand size={15}>the roll comes from a public drand round, so nobody can pick it</Hand>
      ) : null}
      {step === "roll" && ready ? (
        <Hand size={15}>anyone can settle this · the treasury refunds the gas</Hand>
      ) : null}
    </Panel>
  );
}
