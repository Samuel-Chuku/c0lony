"use client";
// Bottom sheet "Build": three upgrades and the Assign ants steppers.
import { useEffect, useState } from "react";
import { BottomSheet, Button, PixelIcon, Stepper, type IconName } from "../../ui";
import { RES, fmtRes } from "../../lib/format";
import { buildCosts, type Profile } from "../../lib/game";
import { txUrl } from "../../lib/chain";
import { useAction } from "../../lib/tx";
import "./colony.css";

const units = (n: number) => BigInt(n) * RES;

function shortfall(have: bigint, cost: number, what: string): string | null {
  const miss = units(cost) - have;
  return miss > 0n ? `${(miss + RES - 1n) / RES} more ${what}` : null;
}

type RowProps = {
  icon: IconName;
  name: string;
  gives: string;
  cost: string;
  verb: string;
  busyVerb: string;
  short: string | null;
  busy: boolean;
  error: string | null;
  onClick: () => void;
};

function UpgradeRow({ icon, name, gives, cost, verb, busyVerb, short, busy, error, onClick }: RowProps) {
  return (
    <li className="c0-urow">
      <div className="c0-urow__main">
        <span className="c0-urow__icon"><PixelIcon name={icon} /></span>
        <div className="c0-urow__text">
          <div className="c0-urow__name">{name}</div>
          <div className="c0-urow__gives">{gives}</div>
          <div className="c0-urow__cost">{cost}</div>
        </div>
        <Button
          variant="paper"
          size="compact"
          busy={busy ? busyVerb : undefined}
          disabledReason={short ? <span className="c0-sr">Need {short}</span> : undefined}
          onClick={onClick}
        >
          {verb}
        </Button>
      </div>
      {short ? <div className="c0-urow__gives" role="note">Need {short}</div> : null}
      {error ? <div className="c0-blocked" role="alert">{error}</div> : null}
    </li>
  );
}

export function BuildSheet({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: Profile }) {
  const dig = useAction("Digging");
  const trail = useAction("Building");
  const farm = useAction("Building");
  const assign = useAction("Saving");
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
            name="Nest chamber"
            gives={`houses 5 ants · you have ${profile.chambers}`}
            cost={`${costs.chamber} leaves`}
            verb="Dig"
            busyVerb="Digging…"
            short={shortfall(profile.leaves, costs.chamber, "leaves")}
            busy={dig.busy}
            error={dig.error}
            onClick={() => void dig.run({ functionName: "digChamber" })}
          />
          <UpgradeRow
            icon="leaf"
            name="Leafcutter trail"
            gives={`ants cut leaves nonstop · you have ${profile.trails}`}
            cost={`${costs.trail} leaves`}
            verb="Build"
            busyVerb="Building…"
            short={shortfall(profile.leaves, costs.trail, "leaves")}
            busy={trail.busy}
            error={trail.error}
            onClick={() => void trail.run({ functionName: "buildTrail" })}
          />
          <UpgradeRow
            icon="sugar"
            name="Aphid farm"
            gives={`ants herd aphids for sugar · you have ${profile.farms}`}
            cost={`${costs.farm} leaves + ${costs.farm} sugar`}
            verb="Build"
            busyVerb="Building…"
            short={[shortfall(profile.leaves, costs.farm, "leaves"), shortfall(profile.sugar, costs.farm, "sugar")].filter(Boolean).join(" and ") || null}
            busy={farm.busy}
            error={farm.error}
            onClick={() => void farm.run({ functionName: "buildFarm" })}
          />
        </ul>

        <div className="c0-assign__head">
          <h3 className="c0-assign__title">Assign ants</h3>
          <span className="c0-urow__gives">free · collects first</span>
        </div>
        <div className="c0-assign__row">
          <div>
            <div className="c0-assign__label">On trails</div>
            <div className="c0-assign__hint">up to {profile.trails * 100} across your {profile.trails} {plural(profile.trails, "trail", "trails")}</div>
          </div>
          <Stepper value={trailW} min={0} max={trailMax} onChange={setTrailW} label="Ants on trails" decLabel="Fewer ants on trails" incLabel="More ants on trails" />
        </div>
        <div className="c0-assign__row">
          <div>
            <div className="c0-assign__label">On farms</div>
            <div className="c0-assign__hint">up to {profile.farms * 100} on your {plural(profile.farms, "farm", "farms")}</div>
          </div>
          <Stepper value={farmW} min={0} max={farmMax} onChange={setFarmW} label="Ants on farms" decLabel="Fewer ants on farms" incLabel="More ants on farms" />
        </div>
        <div className="c0-assign__row">
          <div>
            <div className="c0-assign__label">Free</div>
            <div className="c0-assign__hint">can raid and guard</div>
          </div>
          <output className="c0-assign__free" aria-label="Free ants">{Math.max(0, free)}</output>
        </div>
        <Button
          variant="paper"
          fullWidth
          busy={assign.busy ? "Saving…" : undefined}
          disabledReason={saveReason}
          error={assign.error}
          onClick={() => void assign.run({ functionName: "assignWorkers", args: [trailW, farmW] })}
        >
          Save assignments
        </Button>
        {assign.hash && !assign.error ? (
          <div className="c0-saved">Saved · <a href={txUrl(assign.hash)} target="_blank" rel="noreferrer">view transaction</a></div>
        ) : null}
      </div>
    </BottomSheet>
  );
}
