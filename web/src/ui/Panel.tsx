import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type PanelProps = HTMLAttributes<HTMLDivElement> & { rule?: boolean };

export function Panel({ rule, className, ...rest }: PanelProps) {
  return <div className={cx("c0-panel", rule && "c0-panel--rule", className)} {...rest} />;
}
