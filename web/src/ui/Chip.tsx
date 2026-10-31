import type { ReactNode } from "react";

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="c0-chip" aria-pressed={selected} onClick={onClick}>{children}</button>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="c0-chiprow" role="group">{children}</div>;
}
