import type { ReactNode } from "react";

export function BlockedStrip({ children }: { children: ReactNode }) {
  return <div className="c0-blocked">{children}</div>;
}

export function Underway({ label }: { label: string }) {
  return (
    <div className="c0-underway" role="status">
      <div className="c0-underway__bar" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
