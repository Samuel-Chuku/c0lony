import type { ReactNode } from "react";
import { cx } from "./cx";

export function Hand({ size = 16, children, className }: { size?: 15 | 16 | 17 | 18 | 19; children: ReactNode; className?: string }) {
  return <span className={cx("c0-hand", `c0-hand--${size}`, className)}>{children}</span>;
}
