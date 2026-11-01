"use client";
import { useMemo } from "react";
import "./world.css";
import {
  CELL,
  WORLD_CROP_TOP,
  WORLD_H,
  WORLD_W,
  GLOW_COLOURS,
  antColour,
  antSprites,
  cellsToRuns,
  chamberBoxes,
  glowCells,
  outlineCells,
  queenBandCells,
  queenBodyCells,
  QUEEN_COLOURS,
  queenGlow,
  staticRuns,
  type ChamberName,
  type GlowKey,
  type Run,
} from "./worldModel";

export type WorldState = "live" | "loading" | "error";
export type ColonyWorldProps = {
  /** Queen fed-until time, unix seconds. null = no colony. */
  fedUntil: number | null;
  /** Current time, unix seconds. */
  now: number;
  collapsed?: boolean;
  /** No colony to show yet (signed out, or not founded): the colony is drawn alive and glowing, as an invitation. */
  invite?: boolean;
  state?: WorldState;
  counts?: { chambers: number; trails: number; farms: number; ants: number };
  onOpenBuild?: () => void;
};

const SIGNS: { name: ChamberName; text: string; left: number; top: number }[] = [
  { name: "store", text: "STORE", left: 46, top: 82 },
  { name: "nursery", text: "NURSERY", left: 276, top: 82 },
  { name: "queen", text: "QUEEN", left: 160, top: 252 },
  { name: "farm", text: "APHIDS", left: 300, top: 252 },
];

function Runs({ runs, className }: { runs: Run[]; className?: string }) {
  return (
    <g className={className}>
      {runs.map((r) => (
        <rect key={`${r.x},${r.y}`} x={r.x * CELL} y={r.y * CELL} width={r.w * CELL} height={CELL} fill={r.fill} />
      ))}
    </g>
  );
}

const staticLayer = <Runs runs={staticRuns} />;
const outlineRuns = cellsToRuns(outlineCells, "currentColor");
const antsLayer = (
  <g fill={antColour}>
    {antSprites.map((a, i) => (
      <g
        key={i}
        className={`c0-world-ant c0-world-ant-${a.axis}`}
        style={{ animationDelay: `calc(var(--c0-ant-tick) * -${(i * 3) % 4})` }}
      >
        {a.cells.map((c) => (
          <rect key={`${c.x},${c.y}`} x={(a.x + c.x) * CELL} y={(a.y + c.y) * CELL} width={CELL} height={CELL} />
        ))}
      </g>
    ))}
  </g>
);

function chamberLabel(name: ChamberName, counts?: ColonyWorldProps["counts"]): string {
  switch (name) {
    case "store":
      return counts ? `Nest chambers, ${counts.chambers}. Open build` : "Nest chambers. Open build";
    case "nursery":
      return counts ? `Nursery, ${counts.ants} ants. Open build` : "Nursery. Open build";
    case "queen":
      return "Queen's chamber. Open build";
    case "farm":
      return counts ? `Aphid farms, ${counts.farms}. Open build` : "Aphid farms. Open build";
  }
}

/**
 * The colony in cross-section, drawn from world.json at a 6px cell. The queen's chamber glows by her real
 * fed-until time and dims in steps; ants shuffle along the tunnels (not under reduced motion). Tapping any
 * chamber opens the Build sheet.
 */
export function ColonyWorld({ fedUntil, now, collapsed = false, invite = false, state = "live", counts, onOpenBuild }: ColonyWorldProps) {
  const glow = state !== "live" ? "collapsed" : invite ? "full" : queenGlow(fedUntil, now, collapsed);
  const glowLayer = useMemo(() => {
    const colours = GLOW_COLOURS[glow];
    const queen = QUEEN_COLOURS[glow];
    return [
      ...(["3", "2", "1"] as GlowKey[]).map((k) => <Runs key={k} runs={cellsToRuns(glowCells[k], colours[k])} />),
      <Runs key="body" runs={cellsToRuns(queenBodyCells, queen.body)} />,
      <Runs key="bands" runs={cellsToRuns(queenBandCells, queen.bands)} />,
    ];
  }, [glow]);

  const live = state === "live" && glow !== "collapsed";
  const description =
    state === "loading"
      ? "Your colony, loading"
      : glow === "collapsed"
        ? "Your colony underground, with a dark queen chamber"
        : "Your colony underground: chambers, nursery, the queen's chamber and the aphid farm";

  return (
    <div className="c0-world-frame">
    <div className="c0-world" data-glow={glow}>
      <svg
        className="c0-world-art c0-pixel"
        width={WORLD_W}
        height={WORLD_H}
        viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}
        role="img"
        aria-label={description}
      >
        {staticLayer}
        {glowLayer}
        <Runs runs={outlineRuns} className={glow === "low" ? "c0-world-outline c0-world-outline-pulse" : "c0-world-outline"} />
        {live && antsLayer}
      </svg>
      {SIGNS.map((s) => (
        <div key={s.name} className="c0-world-sign" aria-hidden="true" style={{ left: s.left, top: s.top }}>
          {s.text}
        </div>
      ))}
      {state === "live" &&
        onOpenBuild &&
        chamberBoxes.map((b) => (
          <button
            key={b.name}
            type="button"
            className="c0-world-chamber"
            style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
            aria-label={chamberLabel(b.name, counts)}
            onClick={onOpenBuild}
          />
        ))}
      {state !== "live" && (
        <p className="c0-world-note" role="status">
          {state === "loading" ? "Reading your colony..." : "Couldn't reach the chain. Pull down to retry."}
        </p>
      )}
    </div>
    </div>
  );
}
