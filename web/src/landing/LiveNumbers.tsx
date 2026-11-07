"use client";
import type { ReactNode } from "react";
import { DEPLOYED, useColonies, useNow, useSeason } from "../lib/game";
import { fmtDuration, fmtInt, fmtWif } from "../lib/format";
import { NETWORK_NAME } from "../config";
import { Panel, ResIcon, Underway } from "../ui";

// Numbers read live from the chain through the same hooks the game uses. No wallet needed.
function Tile({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Panel rule className="l-tile">
      <span className="l-tile__cap">{caption}</span>
      <span className="l-tile__val">{children}</span>
    </Panel>
  );
}

function Reading() {
  return (
    <span className="l-tile__loading">
      <Underway label="Reading the chain…" />
    </span>
  );
}

function Numbers() {
  const season = useSeason();
  const colonies = useColonies();
  const now = useNow(30_000);
  const s = season.data;
  const left = s ? s.end - now : 0;
  const failed = !s && !!season.error;
  return (
    <div className="l-live" aria-live="polite">
      <ul className="l-tiles">
        <li>
          <Tile caption={s ? `SEASON ${s.season} POT` : "SEASON POT"}>
            {s ? (
              <span className="l-gold">
                <ResIcon name="wif" size={30} /> {fmtWif(s.pot)} <small>WIF</small>
              </span>
            ) : failed ? (
              <span className="l-na">·</span>
            ) : (
              <Reading />
            )}
          </Tile>
        </li>
        <li>
          <Tile caption="COLONIES THIS SEASON">
            {colonies.data ? (
              <span className="l-with-icon">
                <ResIcon name="ant" size={24} /> {fmtInt(colonies.data.length)}
              </span>
            ) : colonies.error ? (
              <span className="l-na">·</span>
            ) : (
              <Reading />
            )}
          </Tile>
        </li>
        <li>
          <Tile caption="TIME LEFT">
            {s ? (left > 0 ? fmtDuration(left) : "Season over") : failed ? <span className="l-na">·</span> : <Reading />}
          </Tile>
        </li>
      </ul>
      <p className="l-live__note">
        {failed
          ? "Couldn't reach the chain just now. The numbers will show when it answers."
          : `Read live from ${NETWORK_NAME === "testnet" ? "Robinhood Chain testnet (test WIF)" : "Robinhood Chain"}, no wallet needed.`}
      </p>
    </div>
  );
}

export function LiveNumbers() {
  if (!DEPLOYED) {
    return (
      <p className="l-live__note" role="status">
        The game contracts are not live on this network yet. Live numbers appear here at launch.
      </p>
    );
  }
  return <Numbers />;
}
