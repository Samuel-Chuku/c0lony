"use client";
// Bottom sheet "Build": three upgrades and the Assign ants steppers.
import { useEffect, useState } from "react";
import { BottomSheet, Button, ResIcon, Stepper, type ResIconName } from "../../ui";
import { RES, fmtRes } from "../../lib/format";
import { buildCosts, type Profile } from "../../lib/game";
import { txUrl } from "../../lib/chain";
import { assignResult, builtResult } from "../../lib/outcomes";
import { useAction } from "../../lib/tx";
import "./colony.css";

const units = (n: number) => BigInt(n) * RES;

type Cost = { leaves?: number; sugar?: number };

type RowProps = {
  icon: ResIconName;
  count: number;
  name: string;
  effect: string;
  cost: Cost;
  verb: string;
  busyVerb: string;
  have: { leaves: bigint; sugar: bigint };
  busy: boolean;
  error: string | null;
  onClick: () => void;
};

function Chip({ kind, n }: { kind: "leaf" | "sugar"; n: number }) {
  return (
    <span className="c0-cost">
      <ResIcon name={kind} size={16} />
      <b>{n}</b>
    </span>
  );
}

function UpgradeRow({ icon, count, name, effect, cost, verb, busyVerb, have, busy, error, onClick }: RowProps) {
  const missL = cost.leaves ? Math.max(0, Math.ceil(Number(units(cost.leaves) - have.leaves) / Number(RES))) : 0;
  const missS = cost.sugar ? Math.max(0, Math.ceil(Number(units(cost.sugar) - have.sugar) / Number(RES))) : 0;
  const short = missL > 0 || missS > 0;
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
        </div>
        <div className="c0-urow__buy">
          <div className="c0-urow__chips" aria-label="Cost">
            {cost.leaves ? <Chip kind="leaf" n={cost.leaves} /> : null}
            {cost.sugar ? <Chip kind="sugar" n={cost.sugar} /> : null}
          </div>
          <Button
            variant="paper"
            size="compact"
            busy={busy ? busyVerb : undefined}
            disabledReason={short ? <span className="c0-sr">{missing}</span> : undefined}
            onClick={onClick}
          >
            {verb}
          </Button>
        </div>
      </div>
      {short ? <div className="c0-urow__need" role="note">{missing}</div> : null}
      {error ? <div className="c0-blocked" role="alert">{error}</div> : null}
    </li>
  );
}

export function BuildSheet({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: Profile }) {
  const dig = useAction("Digging", { success: builtResult("nest chamber", "nest chambers") });
  const trail = useAction("Building", { success: builtResult("leafcutter trail", "leafcutter trails") });
  const farm = useAction("Building", { success: builtResult("aphid farm", "aphid farms") });
  const assign = useAction("Saving", { success: assignResult });
  const [trailW, setTrailW] = useState(profile.trailWorkers);
  const [farmW, setFarmW] = useState(profile.farmWorkers);

  // Start from the chain's numbers each time the sheet opens or they change underneath us.
  useEffect(() => {
    if (open) {
      setTrailW(profile.trailWorkers);
      setFarmW(profile.farmWorkers);
    }
  }, [open, profile.trailWorkers, profile.farmWorkers]);

  const costs = buildCosts(profile.chambers, profile.ants);
  const free = profile.ants - profile.soldiersOut - trailW - farmW;
  const trailMax = Math.min(profile.trails * 100, trailW + Math.max(0, free));
  const farmMax = Math.min(profile.farms * 100, farmW + Math.max(0, free));
  const unchanged = trailW === profile.trailWorkers && farmW === profile.farmWorkers;
  const noJobs = profile.trails === 0 && profile.farms === 0;
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

  const saveReason = free < 0
    ? "Only " + Math.max(0, profile.ants - profile.soldiersOut) + " ants are free. Take some off trails or farms"
    : unchanged
      ? "Change a number to save"
      : undefined;

  return (
    <BottomSheet open={open} onClose={onClose} title="Build" meta={`${fmtRes(profile.leaves)} leaves · ${fmtRes(profile.sugar)} sugar`}>
      <div className="c0-build">
        <ul className="c0-build__list">
          <UpgradeRow
            icon="chamber"
            count={profile.chambers}
            name="Nest chamber"
            effect={`Houses 5 ants each · room for ${profile.chambers * 5} now, ${profile.ants} used`}
            cost={{ leaves: costs.chamber }}
            verb="Dig"
            busyVerb="Digging…"
            have={profile}
            busy={dig.busy}
            error={dig.error}
            onClick={() => void dig.run({ functionName: "digChamber" })}
          />
          <UpgradeRow
            icon="trail"
            count={profile.trails}
            name="Leafcutter trail"
            effect={`Each holds up to 100 ants cutting leaves`}
            cost={{ leaves: costs.trail }}
            verb="Build"
            busyVerb="Building…"
            have={profile}
            busy={trail.busy}
            error={trail.error}
            onClick={() => void trail.run({ functionName: "buildTrail" })}
          />
          <UpgradeRow
            icon="farm"
            count={profile.farms}
            name="Aphid farm"
            effect={`Each holds up to 100 ants herding aphids for sugar`}
            cost={{ leaves: costs.farm, sugar: costs.farm }}
            verb="Build"
            busyVerb="Building…"
            have={profile}
            busy={farm.busy}
            error={farm.error}
            onClick={() => void farm.run({ functionName: "buildFarm" })}
          />
        </ul>

        <div className="c0-assign__head">
          <h3 className="c0-assign__title">Assign ants</h3>
          <span className="c0-urow__gives">free · collects first</span>
        </div>
        {noJobs ? (
          <>
            <div className="c0-blocked" role="note">Build a leafcutter trail or an aphid farm first. Each one gives up to 100 ants a job.</div>
            <div className="c0-assign__row">
              <div>
                <div className="c0-assign__label">Free ants</div>
                <div className="c0-assign__hint">can raid and guard</div>
              </div>
              <output className="c0-assign__free" style={{ width: "auto" }} aria-label="Free ants">{Math.max(0, free)}</output>
            </div>
          </>
        ) : (
          <>
            {profile.trails > 0 ? (
              <div className="c0-assign__row">
                <div>
                  <div className="c0-assign__label">On trails</div>
                  <div className="c0-assign__hint">up to {profile.trails * 100} across {profile.trails} {plural(profile.trails, "trail", "trails")}</div>
                  {trailW >= trailMax ? <div className="c0-assign__limit">{trailW >= profile.trails * 100 ? "Trails are full. Build another for more room" : "No free ants left. Take some off a farm"}</div> : null}
                </div>
                <Stepper value={trailW} min={0} max={trailMax} onChange={setTrailW} label="Ants on trails" decLabel="Fewer ants on trails" incLabel="More ants on trails" />
              </div>
            ) : null}
            {profile.farms > 0 ? (
              <div className="c0-assign__row">
                <div>
                  <div className="c0-assign__label">On farms</div>
                  <div className="c0-assign__hint">up to {profile.farms * 100} across {profile.farms} {plural(profile.farms, "farm", "farms")}</div>
                  {farmW >= farmMax ? <div className="c0-assign__limit">{farmW >= profile.farms * 100 ? "Farms are full. Build another for more room" : "No free ants left. Take some off a trail"}</div> : null}
                </div>
                <Stepper value={farmW} min={0} max={farmMax} onChange={setFarmW} label="Ants on farms" decLabel="Fewer ants on farms" incLabel="More ants on farms" />
              </div>
            ) : null}
            <div className="c0-assign__row">
              <div>
                <div className="c0-assign__label">{Math.max(0, free)} free</div>
                <div className="c0-assign__hint">can raid and guard</div>
              </div>
            </div>
          </>
        )}
        {noJobs ? null : <Button
          variant="paper"
          fullWidth
          busy={assign.busy ? "Saving…" : undefined}
          disabledReason={noJobs ? "Build a trail or farm first" : saveReason}
          error={assign.error}
          onClick={() => void assign.run({ functionName: "assignWorkers", args: [trailW, farmW] })}
        >
          Save assignments
        </Button>}
        {assign.hash && !assign.error ? (
          <div className="c0-saved">Saved · <a href={txUrl(assign.hash)} target="_blank" rel="noreferrer">view transaction</a></div>
        ) : null}
      </div>
    </BottomSheet>
  );
}
