"use client";
// The Build sheet: three buildings (each with a confirm step that shows exactly what it costs and gives), and
// "Put ants to work": pick a trail or farm, then set how many ants work there. Saving is one transaction and
// can be redone at any time. A building can be bought several at once: the contract builds one per call, so the
// app sends them one after another (no pop-ups in the built-in wallet; a browser wallet asks once per build).
import { useEffect, useRef, useState } from "react";
import type { Hash } from "viem";
import { BottomSheet, Button, ResIcon, Slider, Stepper, type ResIconName } from "../../ui";
import { RES, fmtRes } from "../../lib/format";
import { FORAGE_FREE_CAP, PER_ANT_PER_DAY, PER_ANT_PER_HOUR, WORKERS_PER_BUILDING, buildCosts, useGameConfig, type Profile } from "../../lib/game";
import { forageTrip } from "./data";
import { txUrl } from "../../lib/chain";
import { assignResult, builtResult, type BuildTally } from "../../lib/outcomes";
import { eventsOf, useAction } from "../../lib/tx";
import { colonyGameAbi } from "../../lib/abi";
import { publicClient } from "../../lib/chain";
import { GAME } from "../../lib/game";
import { invalidate } from "../../lib/store";
import "./colony.css";

const units = (n: number) => BigInt(n) * RES;
const perHour = (ants: number) => {
  const v = ants * PER_ANT_PER_HOUR;
  return v >= 10 ? v.toFixed(1) : v.toFixed(2);
};

type Cost = { leaves?: number; sugar?: number };
type Action = ReturnType<typeof useAction>;
type Kind = "chamber" | "trail" | "farm";
/** Most of one building bought in one go. */
const MAX_BATCH = 10;
/** Where a run of several builds has got to. `stopped` = it failed part way, after `done` landed. */
type Progress = { kind: Kind; done: number; total: number; stopped?: boolean };

type RowProps = {
  icon: ResIconName;
  count: number;
  name: string;
  effect: string;
  /** What `n` more of this building give, for the confirm step: "room for 5 more ants". */
  gives: (n: number) => string;
  /** Ants working in buildings of this kind, for trails and farms. */
  working?: { ants: number; room: number };
  /** The output line at the foot of the card, for trails and farms. */
  makes?: "leaf" | "sugar";
  /** What the i-th extra building costs (0 = the next one). Chambers and farms get dearer as they add up. */
  costAt: (i: number) => Cost;
  verb: string;
  busyVerb: string;
  have: { leaves: bigint; sugar: bigint };
  action: Action;
  progress: Progress | null;
  onConfirm: (n: number) => void;
};

const sumCosts = (costAt: (i: number) => Cost, n: number): Cost => {
  let leaves = 0;
  let sugar = 0;
  for (let i = 0; i < n; i++) {
    const c = costAt(i);
    leaves += c.leaves ?? 0;
    sugar += c.sugar ?? 0;
  }
  return { leaves: leaves || undefined, sugar: sugar || undefined };
};

function CostChip({ kind, n, minus }: { kind: "leaf" | "sugar"; n: number; minus?: boolean }) {
  return (
    <span className="c0-cost">
      <ResIcon name={kind} size={16} label={kind === "leaf" ? "leaves" : "sugar"} />
      <b>{minus ? `−${n}` : n}</b>
    </span>
  );
}

function UpgradeRow({ icon, count, name, effect, gives, working, makes, costAt, verb, busyVerb, have, action, progress, onConfirm }: RowProps) {
  const [confirming, setConfirming] = useState(false);
  const [n, setN] = useState(1);
  const cost = costAt(0);
  // How many the colony can pay for right now, each one priced as it would be at that point.
  let affordable = 0;
  for (let i = 1; i <= MAX_BATCH; i++) {
    const t = sumCosts(costAt, i);
    if (units(t.leaves ?? 0) > have.leaves || units(t.sugar ?? 0) > have.sugar) break;
    affordable = i;
  }
  const count_ = Math.max(1, Math.min(n, affordable));
  const total = sumCosts(costAt, count_);
  const busyLabel = progress && progress.total > 1 && !progress.stopped ? `${busyVerb.replace("…", "")} ${progress.done + 1} of ${progress.total}…` : busyVerb;
  const missL = cost.leaves ? Math.max(0, Math.ceil(Number(units(cost.leaves) - have.leaves) / Number(RES))) : 0;
  const missS = cost.sugar ? Math.max(0, Math.ceil(Number(units(cost.sugar) - have.sugar) / Number(RES))) : 0;
  const short = missL > 0 || missS > 0;

  // Close the confirm step once the building lands.
  useEffect(() => {
    if (action.hash) setConfirming(false);
  }, [action.hash]);
  useEffect(() => {
    if (!confirming) setN(1);
  }, [confirming]);

  const missing = (
    <>
      Need {missL > 0 ? <>{missL} more <ResIcon name="leaf" size={14} label="leaves" /></> : null}
      {missL > 0 && missS > 0 ? " and " : null}
      {missS > 0 ? <>{missS} more <ResIcon name="sugar" size={14} label="sugar" /></> : null}
    </>
  );
  return (
    <li className="c0-urow">
      <div className="c0-urow__main">
        <span className="c0-urow__tile">
          <ResIcon name={icon} size={32} />
          <b className="c0-urow__count" aria-label={`${count} built`}>{count}</b>
        </span>
        <div className="c0-urow__text">
          <div className="c0-urow__name">{name}</div>
          <div className="c0-urow__gives">{effect}</div>
          {working && count > 0 ? <div className="c0-urow__working">{working.ants} ants working · room for {working.room}</div> : null}
        </div>
        <div className="c0-urow__buy">
          <div className="c0-urow__chips" aria-label="Cost">
            <span className="c0-urow__costcap">Cost:</span>
            {cost.leaves ? <CostChip kind="leaf" n={cost.leaves} /> : null}
            {cost.sugar ? <CostChip kind="sugar" n={cost.sugar} /> : null}
          </div>
          {!confirming ? (
            <Button
              variant="paper"
              size="compact"
              disabledReason={short ? <span className="c0-sr">{missing}</span> : undefined}
              onClick={() => setConfirming(true)}
            >
              {verb}
            </Button>
          ) : null}
          {short ? <div className="c0-urow__need" role="note">{missing}</div> : null}
        </div>
      </div>
      {confirming && !short ? (
        <div className="c0-confirm" role="group" aria-label={`Confirm ${name.toLowerCase()}`}>
          {affordable > 1 ? (
            <div className="c0-confirm__line">
              <span className="c0-confirm__cap">How many</span>
              <Stepper value={count_} min={1} max={affordable} onChange={setN} label={`How many ${name.toLowerCase()}s`} decLabel="One fewer" incLabel="One more" />
              <span className="c0-confirm__cap">you can pay for {affordable}{affordable === MAX_BATCH ? " (most at once)" : ""}</span>
            </div>
          ) : null}
          <div className="c0-confirm__line">
            <span className="c0-confirm__cap">Spend</span>
            {total.leaves ? <CostChip kind="leaf" n={total.leaves} minus /> : null}
            {total.sugar ? <CostChip kind="sugar" n={total.sugar} minus /> : null}
            <span className="c0-confirm__cap">Get</span>
            <b className="c0-confirm__get">+{count_} {count_ === 1 ? name.toLowerCase() : `${name.toLowerCase()}s`}</b>
          </div>
          <div className="c0-confirm__gives">{gives(count_)}</div>
          {count_ > 1 ? <div className="c0-confirm__gives">Sent as {count_} transactions, one after another. A browser wallet asks to confirm each one.</div> : null}
          <div className="c0-confirm__btns">
            <Button variant="paper" size="compact" busy={action.busy ? busyLabel : undefined} onClick={() => onConfirm(count_)}>
              {count_ === 1 ? `Confirm ${name.toLowerCase()}` : `Confirm ${count_} ${name.toLowerCase()}s`}
            </Button>
            <button type="button" className="c0-linkbtn c0-confirm__cancel" onClick={() => setConfirming(false)} disabled={action.busy}>Cancel</button>
          </div>
        </div>
      ) : null}
      {makes ? (
        <div className="c0-urow__makes">
          <b>+{PER_ANT_PER_DAY}</b>
          <ResIcon name={makes} size={16} label={makes === "leaf" ? "leaves" : "sugar"} />
          a day per assigned ant · {perHour(1)}/h
        </div>
      ) : null}
      {action.error ? (
        <div className="c0-blocked" role="alert">
          {action.error}
          {progress?.stopped ? ` · ${progress.done} of ${progress.total} were built before it stopped` : null}
        </div>
      ) : null}
    </li>
  );
}

/** Live earnings for the ants on a slider: "+0.92 leaves an hour · 22 a day". */
function Rate({ kind, ants }: { kind: "leaf" | "sugar"; ants: number }) {
  return (
    <div className="c0-rate" aria-live="polite">
      <ResIcon name={kind} size={16} label={kind === "leaf" ? "leaves" : "sugar"} />
      <b>+{perHour(ants)}</b> an hour · {ants * PER_ANT_PER_DAY} a day
    </div>
  );
}

type Job = "trail" | "farm";
const JOBS: Record<Job, { icon: ResIconName; name: string; plural: string; makes: "leaf" | "sugar" }> = {
  trail: { icon: "trail", name: "leafcutter trail", plural: "leafcutter trails", makes: "leaf" },
  farm: { icon: "farm", name: "aphid farm", plural: "aphid farms", makes: "sugar" },
};

export function BuildSheet({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: Profile }) {
  const cfg = useGameConfig().data;
  const tally = useRef<BuildTally | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const dig = useAction("Digging", { success: builtResult("nest chamber", "nest chambers", () => tally.current) });
  const trail = useAction("Building", { success: builtResult("leafcutter trail", "leafcutter trails", () => tally.current) });
  const farm = useAction("Building", { success: builtResult("aphid farm", "aphid farms", () => tally.current) });

  /** Build `n` of one kind: one transaction each, sent one after another, stopping at the first that fails. */
  const buildMany = async (kind: Kind, action: Action, functionName: "digChamber" | "buildTrail" | "buildFarm", n: number) => {
    tally.current = { built: 0, leaves: 0n, sugar: 0n };
    setProgress({ kind, done: 0, total: n });
    const hash = await action.run(async (client) => {
      let last: Hash | null = null;
      for (let i = 0; i < n; i++) {
        setProgress({ kind, done: i, total: n });
        try {
          const { request } = await publicClient.simulateContract({ account: client.account.address, address: GAME, abi: colonyGameAbi, functionName });
          last = await client.writeContract(request as never);
          const receipt = await publicClient.waitForTransactionReceipt({ hash: last });
          if (receipt.status !== "success") throw new Error("reverted");
          const e = eventsOf(receipt, "Built")[0];
          const t = tally.current!;
          t.built += 1;
          if (e) {
            t.leaves += BigInt(String(e.leavesCost ?? 0));
            t.sugar += BigInt(String(e.sugarCost ?? 0));
          }
        } catch (err) {
          if (i > 0) {
            setProgress({ kind, done: i, total: n, stopped: true });
            void invalidate(); // the ones that landed changed the colony
          }
          throw err;
        }
      }
      return last!;
    });
    if (hash) setProgress(null);
  };
  const progressOf = (k: Kind) => (progress?.kind === k ? progress : null);
  const assign = useAction("Saving", { success: assignResult });
  const [trailW, setTrailW] = useState(profile.trailWorkers);
  const [farmW, setFarmW] = useState(profile.farmWorkers);
  const [job, setJob] = useState<Job | null>(null);

  // Start from the chain's numbers each time the sheet opens or they change underneath us.
  useEffect(() => {
    if (open) {
      setTrailW(profile.trailWorkers);
      setFarmW(profile.farmWorkers);
    }
  }, [open, profile.trailWorkers, profile.farmWorkers]);
  useEffect(() => {
    if (!open) {
      setJob(null);
      setProgress(null);
    }
  }, [open]);

  const costs = cfg ? buildCosts(cfg, profile.chambers, profile.ants, profile.farms) : null;
  const raiding = profile.soldiersOut;
  const free = profile.ants - raiding - trailW - farmW;
  const trip = forageTrip(Math.max(0, free));
  const unchanged = trailW === profile.trailWorkers && farmW === profile.farmWorkers;
  const built: Record<Job, number> = { trail: profile.trails, farm: profile.farms };
  const working: Record<Job, number> = { trail: trailW, farm: farmW };
  const setWorking: Record<Job, (n: number) => void> = { trail: setTrailW, farm: setFarmW };
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

  /** Why the slider for `j` can't go higher, in words that match what is actually going on. */
  const limitNote = (j: Job): string | null => {
    const room = built[j] * WORKERS_PER_BUILDING;
    const other: Job = j === "trail" ? "farm" : "trail";
    if (working[j] >= room) return `All ${room} places are filled. Build another ${JOBS[j].name} for more room.`;
    if (free > 0) return null;
    if (working[other] > 0) return `No free ants left. Move some off your ${JOBS[other].plural} first.`;
    if (raiding > 0) return `Your other ants are out on a raid. They can work once they are home.`;
    return "No free ants left.";
  };

  const saveReason = free < 0
    ? `Only ${Math.max(0, profile.ants - raiding)} ants are home. Move some off a trail or farm`
    : unchanged
      ? "Move a slider to save"
      : undefined;

  const editor = (j: Job) => {
    const room = built[j] * WORKERS_PER_BUILDING;
    const max = Math.min(room, working[j] + Math.max(0, free));
    const note = limitNote(j);
    return (
      <div className="c0-jobedit">
        <div className="c0-assign__row">
          <div>
            <div className="c0-assign__label">On {JOBS[j].plural}</div>
            <div className="c0-assign__hint">{built[j]} {plural(built[j], JOBS[j].name, JOBS[j].plural)} · room for {room} ants</div>
          </div>
          <Stepper value={working[j]} min={0} max={max} onChange={setWorking[j]} label={`Ants on ${JOBS[j].plural}`} decLabel={`Fewer ants on ${JOBS[j].plural}`} incLabel={`More ants on ${JOBS[j].plural}`} />
        </div>
        <Slider value={working[j]} max={max} onChange={setWorking[j]} label={`Ants on ${JOBS[j].plural}`} />
        <Rate kind={JOBS[j].makes} ants={working[j]} />
        {note ? <div className="c0-assign__limit" role="note">{note}</div> : null}
      </div>
    );
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Build" meta={
        <span className="c0-sheet__have">
          {fmtRes(profile.leaves)} <ResIcon name="leaf" size={16} label="leaves" /> · {fmtRes(profile.sugar)} <ResIcon name="sugar" size={16} label="sugar" />
        </span>
      }>
      <div className="c0-build">
        {!costs ? null : (
          <ul className="c0-build__list">
            <UpgradeRow
              icon="chamber"
              count={profile.chambers}
              name="Nest chamber"
              effect={`Houses 5 ants · ${profile.ants}/${profile.chambers * 5} used`}
              gives={(n) => `room for ${5 * n} more ants · new ants hatch into empty room when you feed`}
              costAt={(i) => ({ leaves: buildCosts(cfg!, profile.chambers + i, profile.ants, profile.farms).chamber })}
              verb="Dig"
              busyVerb="Digging…"
              have={profile}
              action={dig}
              progress={progressOf("chamber")}
              onConfirm={(n) => void buildMany("chamber", dig, "digChamber", n)}
            />
            <UpgradeRow
              icon="trail"
              count={profile.trails}
              name="Leafcutter trail"
              effect="Ants cut leaves all day"
              gives={(n) => `room for ${WORKERS_PER_BUILDING * n} more ants to cut leaves`}
              working={{ ants: profile.trailWorkers, room: profile.trails * WORKERS_PER_BUILDING }}
              makes="leaf"
              costAt={() => ({ leaves: costs.trail })}
              verb="Build"
              busyVerb="Building…"
              have={profile}
              action={trail}
              progress={progressOf("trail")}
              onConfirm={(n) => void buildMany("trail", trail, "buildTrail", n)}
            />
            <UpgradeRow
              icon="farm"
              count={profile.farms}
              name="Aphid farm"
              effect="Ants herd aphids for sugar"
              gives={(n) => `room for ${WORKERS_PER_BUILDING * n} more ants to make sugar`}
              working={{ ants: profile.farmWorkers, room: profile.farms * WORKERS_PER_BUILDING }}
              makes="sugar"
              costAt={(i) => {
                const c = buildCosts(cfg!, profile.chambers, profile.ants, profile.farms + i);
                return { leaves: c.farm, sugar: c.farmSugar || undefined };
              }}
              verb="Build"
              busyVerb="Building…"
              have={profile}
              action={farm}
              progress={progressOf("farm")}
              onConfirm={(n) => void buildMany("farm", farm, "buildFarm", n)}
            />
          </ul>
        )}

        <div className="c0-assign__head">
          <h3 className="c0-assign__title">Put ants to work</h3>
          <span className="c0-urow__gives">pick a job, then set how many</span>
        </div>
        <div className="c0-jobs" role="group" aria-label="Jobs">
          {(["trail", "farm"] as Job[]).map((j) => (
            <button
              key={j}
              type="button"
              className="c0-job"
              aria-pressed={job === j}
              onClick={() => setJob(job === j ? null : j)}
            >
              <ResIcon name={JOBS[j].icon} size={24} />
              <span className="c0-job__name">{j === "trail" ? "Leaf trail" : "Aphid farm"}</span>
              <span className="c0-job__count">{built[j] === 0 ? "not built" : `${working[j]} ants`}</span>
            </button>
          ))}
        </div>
        {job === null ? null : built[job] === 0 ? (
          <div className="c0-blocked" role="note">
            You haven&apos;t built {job === "farm" ? "an" : "a"} {JOBS[job].name} yet, so no ants can work there. Build one above, then come back to put ants on it.
          </div>
        ) : (
          editor(job)
        )}

        <div className="c0-assign__row c0-assign__row--free">
          <div>
            <div className="c0-assign__label">{Math.max(0, free)} free at home{raiding > 0 ? ` · ${raiding} out raiding` : ""}</div>
            <div className="c0-assign__hint">
              free ants forage and march on raids · each forage trip brings {trip.leaves} leaves and {trip.sugar} sugar
              {free > FORAGE_FREE_CAP ? ` (only ${FORAGE_FREE_CAP} free ants count)` : ""}
            </div>
          </div>
        </div>
        {profile.trails === 0 && profile.farms === 0 ? null : (
          <Button
            variant="paper"
            fullWidth
            busy={assign.busy ? "Saving…" : undefined}
            disabledReason={saveReason}
            error={assign.error}
            onClick={() => void assign.run({ functionName: "assignWorkers", args: [trailW, farmW] })}
          >
            Save · {trailW} on trails, {farmW} on farms
          </Button>
        )}
        {assign.hash && !assign.error ? (
          <div className="c0-saved">Saved · <a href={txUrl(assign.hash)} target="_blank" rel="noreferrer">view transaction</a></div>
        ) : null}
      </div>
    </BottomSheet>
  );
}
