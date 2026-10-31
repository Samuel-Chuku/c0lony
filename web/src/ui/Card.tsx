import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type CardProps = HTMLAttributes<HTMLDivElement> & { dense?: boolean };

export function Card({ dense, className, ...rest }: CardProps) {
  return <div className={cx("c0-card", dense && "c0-card--dense", className)} {...rest} />;
}
