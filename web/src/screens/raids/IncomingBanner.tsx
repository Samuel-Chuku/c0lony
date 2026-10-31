"use client";
import { useState } from "react";
import { Button } from "../../ui";
import { Resource, useNow, type Raid } from "../../lib/game";
import { fmtDuration } from "../../lib/format";
import { guard } from "../../lib/raids";
import { useAction } from "../../lib/tx";
import { ShieldButton } from "./ShieldButton";
import { useColonyView, useWho } from "./shared";

/** A sealed raid against me, still inside its guard window: Guard leaves or sugar, or Shield. */
export function IncomingBanner({ raid, guardWindow }: { raid: Raid; guardWindow: number }) {
  const now = useNow();
  const raiderOwner = useColonyView(raid.raider).data?.data.owner.toLowerCase();
  const who = useWho(raiderOwner);
  const action = useAction("Guarding");
  const [which, setWhich] = useState<number>(0);
  const left = Number(raid.launchedAt) + guardWindow - now;
  const guarded = raid.guard === Resource.Leaves ? "leaves" : raid.guard === Resource.Sugar ? "sugar" : null;

  const pick = (res: number) => {
    setWhich(res);
    void action.run(guard(raid.id, res));
  };

  return (
    <section className="c0-banner" aria-label={`${who.name} is marching on you`}>
      <div className="c0-banner__top">
        <h2 className="c0-banner__title">{who.name} is marching on you</h2>
        <span className="c0-banner__time">{fmtDuration(left)}</span>
      </div>
      {guarded ? (
        <p style={{ margin: 0, fontSize: 13 }}>You guarded {guarded}. If they aim there, they lose half their soldiers.</p>
      ) : (
        <div className="c0-banner__btns">
          <Button variant="paper" size="compact" icon="leaf" busy={action.busy && which === Resource.Leaves ? "Guarding…" : undefined} disabled={action.busy} onClick={() => pick(Resource.Leaves)}>
            Guard leaves
          </Button>
          <Button variant="paper" size="compact" icon="sugar" busy={action.busy && which === Resource.Sugar ? "Guarding…" : undefined} disabled={action.busy} onClick={() => pick(Resource.Sugar)}>
            Guard sugar
          </Button>
        </div>
      )}
      {action.error ? <div className="c0-blocked" role="alert">{action.error}</div> : null}
      <ShieldButton full />
    </section>
  );
}
