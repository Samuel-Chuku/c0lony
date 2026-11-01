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
/**
 * The queen as a drawn figure (owner's call, 2026-11-01: she reads better than as pixels), resting in her chamber.
 * Full colour while fed; muted when she is hungry; grey and still when the colony has fallen.
 */
function QueenFigure({ glow }: { glow: string }) {
  const tone =
    glow === "collapsed"
      ? { body: "#4A3020", abdomen: "#4A3020", band: "#33231A", crown: "#6B4A33", eye: "#6B4A33" }
      : glow === "low"
        ? { body: "#5A3A1C", abdomen: "#6B4A33", band: "#45301D", crown: "#B08A3A", eye: "#E9D8B4" }
        : { body: "#3A2010", abdomen: "#5A3418", band: "#2A160A", crown: "#F2C04E", eye: "#FBF3DE" };
  const INK = "#0B0704";
  return (
    <g className={glow === "collapsed" ? "c0-world-queen" : "c0-world-queen c0-world-queen--alive"} transform="translate(150 212)" shapeRendering="geometricPrecision">
      {/* legs */}
      <path d="M28 26 20 38M34 27l-2 13M40 26l8 12M30 22 18 14M38 22l10-9" stroke={INK} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* abdomen with bands */}
      <ellipse cx="62" cy="24" rx="22" ry="13" fill={tone.abdomen} stroke={INK} strokeWidth="2.5" />
      <path d="M54 12c-3 8-3 16 0 24M63 11c-3 9-3 17 0 26M72 13c-2 7-2 15 0 22" stroke={tone.band} strokeWidth="3" fill="none" />
      {/* thorax and head */}
      <ellipse cx="35" cy="22" rx="8" ry="6.5" fill={tone.body} stroke={INK} strokeWidth="2.5" />
      <ellipse cx="20" cy="18" rx="8.5" ry="7.5" fill={tone.body} stroke={INK} strokeWidth="2.5" />
      <circle cx="16.5" cy="16" r="2" fill={tone.eye} />
      {/* antennae */}
      <path d="M15 11c-4-6-9-7-12-5M19 10c-1-6-4-9-7-9" stroke={INK} strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* crown */}
      <path d="M12 9 14 1l4 4 3-5 3 5 4-4 1 8Z" fill={tone.crown} stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
    </g>
  );
}

export function ColonyWorld({ fedUntil, now, collapsed = false, invite = false, state = "live", counts, onOpenBuild }: ColonyWorldProps) {
  const glow = state !== "live" ? "collapsed" : invite ? "full" : queenGlow(fedUntil, now, collapsed);
  const glowLayer = useMemo(() => {
    const colours = GLOW_COLOURS[glow];
    const queen = QUEEN_COLOURS[glow];
    return [
      ...(["3", "2", "1"] as GlowKey[]).map((k) => <Runs key={k} runs={cellsToRuns(glowCells[k], colours[k])} />),
      // The pixel silhouette is filled with the chamber's glow, and the drawn queen sits on top.
      <Runs key="body" runs={cellsToRuns(queenBodyCells, colours["2"])} />,
      <Runs key="bands" runs={cellsToRuns(queenBandCells, colours["2"])} />,
    ];
  }, [glow]);

  const live = state === "live" && glow !== "collapsed";
  // Days of food left as three pips on the QUEEN sign (one per 24 h of her 72 h). Under 12 h none are left and
  // the pips turn to the Blocked hatch, stepping with the chamber outline.
  const left = fedUntil === null ? 0 : fedUntil - now;
  const pips = state !== "live" || invite || glow === "collapsed" ? null : left <= 12 * 3600 ? 0 : Math.min(3, Math.ceil(left / 86400));
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
        <QueenFigure glow={glow} />
        {live && antsLayer}
      </svg>
      {SIGNS.map((s) => (
        <div key={s.name} className="c0-world-sign" aria-hidden="true" style={{ left: s.name === "queen" && pips !== null ? s.left - 24 : s.left, top: s.top }}>
          {s.text}
          {s.name === "queen" && pips !== null ? (
            <span className={`c0-world-pips${pips === 0 ? " c0-world-pips--hungry" : ""}`}>
              {[0, 1, 2].map((i) => (
                <span key={i} className={i < pips ? "c0-world-pip c0-world-pip--fed" : "c0-world-pip"} />
              ))}
            </span>
          ) : null}
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
