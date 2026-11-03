"use client";
// The pantry: forage trips that came home while the player was away wait here, up to two of each kind.
// Claiming is the same Tend transaction, so it also brings in whatever trails and farms have made.
import type { ReactNode } from "react";
import { Button, Modal, ResIcon } from "../../ui";
import { RES, fmtDuration, fmtRes } from "../../lib/format";
import type { useAction } from "../../lib/tx";
import { PANTRY_TRIPS, type Waiting } from "./data";

type Props = { open: boolean; onClose: () => void; w: Waiting; tend: ReturnType<typeof useAction>; onClaim: () => void };

function Shelf({ kind, trips, per, next }: { kind: "leaf" | "sugar"; trips: number; per: number; next: number | null }) {
  const full = trips >= PANTRY_TRIPS;
  let note: ReactNode = null;
  if (full) note = "full · new trips are lost until you claim";
  else if (next !== null) note = `next trip in ${fmtDuration(next)}`;
  return (
    <li className={full ? "c0-shelf c0-shelf--full" : "c0-shelf"}>
      <ResIcon name={kind} size={24} label={kind === "leaf" ? "leaves" : "sugar"} />
      <div className="c0-shelf__text">
        <div className="c0-shelf__amt">+{trips * per} <span className="c0-shelf__trips">{trips} of {PANTRY_TRIPS} trips</span></div>
        {note ? <div className="c0-shelf__note">{note}</div> : null}
      </div>
    </li>
  );
}

export function PantrySheet({ open, onClose, w, tend, onClaim }: Props) {
  const trips = w.leafTrips + w.sugarTrips;
  const full = w.leafTrips >= PANTRY_TRIPS && w.sugarTrips >= PANTRY_TRIPS;
  const extra = w.built.leaves >= RES || w.built.sugar >= RES;
  return (
    <Modal open={open} onClose={onClose} title="Pantry" kicker={full ? "full" : `${trips} ${trips === 1 ? "trip" : "trips"} waiting`}>
      <div className="c0-pantry">
        <ul className="c0-pantry__shelves">
          <Shelf kind="leaf" trips={w.leafTrips} per={w.trip.leaves} next={w.leafNext} />
          <Shelf kind="sugar" trips={w.sugarTrips} per={w.trip.sugar} next={w.sugarNext} />
        </ul>
        {extra ? (
          <div className="c0-pantry__also">
            Also collects your trails and farms:
            {w.built.leaves >= RES ? <> +{fmtRes(w.built.leaves)} <ResIcon name="leaf" size={16} label="leaves" /></> : null}
            {w.built.sugar >= RES ? <> +{fmtRes(w.built.sugar)} <ResIcon name="sugar" size={16} label="sugar" /></> : null}
          </div>
        ) : null}
        <Button
          variant="paper"
          fullWidth
          busy={tend.busy ? "Claiming…" : undefined}
          disabledReason={w.nothing ? "Nothing in the pantry yet" : undefined}
          onClick={onClaim}
        >
          Claim from pantry
        </Button>
        {tend.error ? <div className="c0-blocked" role="alert">{tend.error}</div> : null}
      </div>
    </Modal>
  );
}
