/** Pixel sketch for the report page: an ant running off with a sugar cube. */
export function RaidSketch() {
  const ink = "var(--c0-ink)";
  const r = (x: number, y: number, w: number, h: number, fill = ink) => <rect key={`${x}-${y}-${w}-${h}`} x={x} y={y} width={w} height={h} fill={fill} />;
  return (
    <svg width="96" height="54" viewBox="0 0 96 54" shapeRendering="crispEdges" role="img" aria-label="Sketch: a raider ant running off with a sugar cube">
      {r(60, 0, 24, 6)}{r(60, 6, 6, 6)}{r(66, 6, 12, 6, "#FFFFFF")}{r(78, 6, 6, 6)}
      {r(60, 12, 24, 6)}{r(24, 12, 6, 6)}{r(30, 18, 6, 6)}{r(12, 24, 36, 12)}{r(48, 24, 12, 6)}
      {r(6, 30, 12, 6)}{r(18, 36, 36, 6)}{r(12, 36, 6, 6)}
      {r(6, 42, 6, 12)}{r(24, 42, 6, 12)}{r(42, 42, 6, 12)}{r(48, 36, 6, 6)}
    </svg>
  );
}
