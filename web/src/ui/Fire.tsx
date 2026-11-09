// A small pixel flame that flickers between two frames (CSS steps; still under reduced motion).
export function Fire({ size = 24 }: { size?: number }) {
  const px = (x: number, y: number, c: string) => <rect key={`${x}-${y}-${c}`} x={x} y={y} width="1" height="1" fill={c} />;
  const ink = "var(--c0-ink)";
  const hi = "var(--c0-paper-hi)";
  // 10x10 grid. Frame A leans left, frame B leans right; the base is shared.
  const base = [
    [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6],
    [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7],
    [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8], [8, 8],
    [2, 9], [3, 9], [4, 9], [5, 9], [6, 9], [7, 9],
  ];
  const a = [[3, 1], [3, 2], [4, 2], [3, 3], [4, 3], [5, 3], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5]];
  const b = [[6, 1], [5, 2], [6, 2], [4, 3], [5, 3], [6, 3], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5]];
  const core = [[4, 7], [5, 7], [4, 8], [5, 8], [3, 8], [6, 8]];
  return (
    <svg className="c0-fire" width={size} height={size} viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden="true">
      <g className="c0-fire__a">{a.map(([x, y]) => px(x, y, ink))}</g>
      <g className="c0-fire__b">{b.map(([x, y]) => px(x, y, ink))}</g>
      {base.map(([x, y]) => px(x, y, ink))}
      {core.map(([x, y]) => px(x, y, hi))}
      {[[4, 6], [5, 6]].map(([x, y]) => px(x, y, hi))}
    </svg>
  );
}
