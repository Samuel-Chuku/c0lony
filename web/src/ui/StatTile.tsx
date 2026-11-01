import type { ReactNode } from "react";
import { cx } from "./cx";
import { Panel } from "./Panel";
import { PixelIcon, type IconName } from "./PixelIcon";
import { ResIcon, type ResIconName } from "./ResIcon";

export function StatTile({ icon, res, value, caption }: { icon?: IconName; res?: ResIconName; value: ReactNode; caption: string }) {
  return (
    <Panel className="c0-stat">
      {res ? <ResIcon name={res} size={24} /> : icon ? <PixelIcon name={icon} /> : null}
      <span className="c0-stat__value">{value}</span>
      <span className="c0-stat__cap">{caption}</span>
    </Panel>
  );
}

export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("c0-statrow", className)}>{children}</div>;
}
