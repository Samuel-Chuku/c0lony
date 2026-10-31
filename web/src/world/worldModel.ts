// Turns public/world.json into merged pixel runs once, at module load. The art itself is never edited here:
// the queen chamber (keys 1, 2, 3) and its outline are split out so their colours can follow the queen's
// fed-until time, and the ants in the tunnels are lifted into their own sprites so they can move.
import world from "../../public/world.json";

export const CELL = world.cell; // 6px
export const WORLD_W = world.width * CELL; // 390
export const WORLD_H = world.height * CELL; // 300
export const WORLD_CROP_TOP = 14; // shown 280px tall with the top 14px cropped

export type Run = { x: number; y: number; w: number; fill: string };
export type Cell = { x: number; y: number };
export type Ant = { x: number; y: number; cells: Cell[]; axis: "x" | "y" };
export type GlowKey = "1" | "2" | "3";
export type ChamberName = keyof typeof world.chambers;

const rows: string[] = world.rows;
const palette = world.palette as Record<string, string>;
const chambers = world.chambers;

function inEllipse(x: number, y: number, name: ChamberName, scale: number): boolean {
  const c = chambers[name];
  const dx = (x + 0.5 - c.cx) / c.rx;
  const dy = (y + 0.5 - c.cy) / c.ry;
  return dx * dx + dy * dy <= scale;
}

function insideAnyChamber(x: number, y: number): boolean {
  return (Object.keys(chambers) as ChamberName[]).some((n) => inEllipse(x, y, n, 1));
}

// ---- ants: 8-connected clusters of `A` outside the chambers
const grid = rows.map((r) => r.split(""));
const seen = new Set<string>();
const ants: Ant[] = [];
for (let y = 0; y < world.height; y++) {
  for (let x = 0; x < world.width; x++) {
    if (grid[y][x] !== "A" || seen.has(`${x},${y}`) || insideAnyChamber(x, y)) continue;
    const stack: Cell[] = [{ x, y }];
    const cells: Cell[] = [];
    seen.add(`${x},${y}`);
    while (stack.length) {
      const p = stack.pop()!;
      cells.push(p);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = p.x + dx;
          const ny = p.y + dy;
          if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue;
          if (grid[ny][nx] !== "A" || seen.has(`${nx},${ny}`)) continue;
          seen.add(`${nx},${ny}`);
          stack.push({ x: nx, y: ny });
        }
      }
    }
    const minX = Math.min(...cells.map((c) => c.x));
    const minY = Math.min(...cells.map((c) => c.y));
    const maxY = Math.max(...cells.map((c) => c.y));
    // A vertical shaft runs through the ant if there is tunnel directly above and below it.
    const vertical = cells.some((c) => grid[minY - 1]?.[c.x] === "T") && cells.some((c) => grid[maxY + 1]?.[c.x] === "T");
    ants.push({ x: minX, y: minY, cells: cells.map((c) => ({ x: c.x - minX, y: c.y - minY })), axis: vertical ? "y" : "x" });
  }
}

// Under each ant, continue the background along its tunnel: from above for a shaft, from the left otherwise.
const base = grid.map((r) => [...r]);
for (const ant of ants) {
  for (const c of ant.cells) {
    const x = ant.x + c.x;
    const y = ant.y + c.y;
    let fill = "T";
    if (ant.axis === "y") {
      for (let yy = y - 1; yy >= 0; yy--) if (grid[yy][x] !== "A") { fill = grid[yy][x]; break; }
    } else {
      for (let xx = x - 1; xx >= 0; xx--) if (grid[y][xx] !== "A") { fill = grid[y][xx]; break; }
    }
    base[y][x] = fill;
  }
}

// ---- queen chamber: glow cells and the outline that pulses when she is hungry
const glow: Record<GlowKey, Cell[]> = { "1": [], "2": [], "3": [] };
const outline: Cell[] = [];
for (let y = 0; y < world.height; y++) {
  for (let x = 0; x < world.width; x++) {
    const k = base[y][x];
    if (k === "1" || k === "2" || k === "3") glow[k].push({ x, y });
    else if (k === "k" && inEllipse(x, y, "queen", 1.9)) outline.push({ x, y });
  }
}
const lifted = new Set<string>([...outline.map((c) => `${c.x},${c.y}`)]);

function mergeRows(keep: (k: string, x: number, y: number) => boolean, colour: (k: string) => string): Run[] {
  const out: Run[] = [];
  for (let y = 0; y < world.height; y++) {
    let x = 0;
    while (x < world.width) {
      const k = base[y][x];
      if (!keep(k, x, y)) { x++; continue; }
      const fill = colour(k);
      let w = 1;
      while (x + w < world.width && keep(base[y][x + w], x + w, y) && colour(base[y][x + w]) === fill) w++;
      out.push({ x, y, w, fill });
      x += w;
    }
  }
  return out;
}

/** Everything except the queen's glow and outline. */
export const staticRuns: Run[] = mergeRows(
  (k, x, y) => k !== "1" && k !== "2" && k !== "3" && !lifted.has(`${x},${y}`),
  (k) => palette[k],
);

function cellsToRuns(cells: Cell[], fill: string): Run[] {
  const set = new Set(cells.map((c) => `${c.x},${c.y}`));
  return mergeRows((_, x, y) => set.has(`${x},${y}`), () => fill);
}

export const glowCells = glow;
export const outlineCells = outline;
export const antSprites = ants;
export const antColour = palette.A;
export const chamberBoxes = (Object.keys(chambers) as ChamberName[]).map((name) => {
  const c = chambers[name];
  return {
    name,
    left: Math.round((c.cx - c.rx) * CELL),
    top: Math.round((c.cy - c.ry) * CELL) - WORLD_CROP_TOP,
    width: Math.round(2 * c.rx * CELL),
    height: Math.round(2 * c.ry * CELL),
  };
});
export { cellsToRuns };

// ---- the glow table (components.md, "The colony world")
export type Glow = "full" | "high" | "mid" | "low" | "collapsed";

export const GLOW_COLOURS: Record<Glow, Record<GlowKey, string>> = {
  full: { "1": "#F2C04E", "2": "#D99A35", "3": "#9A6226" },
  high: { "1": "#D99A35", "2": "#9A6226", "3": "#6B4A33" },
  mid: { "1": "#9A6226", "2": "#6B4A33", "3": "#45301D" },
  low: { "1": "#6B4A33", "2": "#45301D", "3": "#33231A" },
  collapsed: { "1": "#24180F", "2": "#24180F", "3": "#24180F" },
};

const HOUR = 3600;

/** Glow step from the queen's fed-until time (unix seconds). No fed-until or a collapsed colony = collapsed. */
export function queenGlow(fedUntil: number | null, now: number, collapsed = false): Glow {
  if (collapsed || fedUntil === null) return "collapsed";
  const left = fedUntil - now;
  if (left > 48 * HOUR) return "full";
  if (left > 24 * HOUR) return "high";
  if (left > 12 * HOUR) return "mid";
  return "low";
}
