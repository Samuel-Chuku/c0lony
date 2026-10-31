import type { ReactNode } from "react";
import { cx } from "./cx";
import { Panel } from "./Panel";
import { PixelIcon, type IconName } from "./PixelIcon";

export function StatTile({ icon, value, caption }: { icon: IconName; value: ReactNode; caption: string }) {
  return (
    <Panel className="c0-stat">
      <PixelIcon name={icon} />
      <span className="c0-stat__value">{value}</span>
      <span className="c0-stat__cap">{caption}</span>
    </Panel>
  );
}

export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("c0-statrow", className)}>{children}</div>;
}
