import type { CSSProperties } from "react";
import { cx } from "./cx";

export const ICON_NAMES = [
  "ant-head", "ant", "board", "book", "chamber", "colony", "gear", "invite",
  "leaf", "live", "raids", "shield", "sugar", "swap", "trophy", "wif",
] as const;
export type IconName = (typeof ICON_NAMES)[number];

export type PixelIconProps = { name: IconName; size?: 20 | 30; label?: string; className?: string };

export function PixelIcon({ name, size = 20, label, className }: PixelIconProps) {
  const style = { "--c0-icon": `url(/icons/${name}.svg)` } as CSSProperties;
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return <span className={cx("c0-icon", `c0-icon--${size}`, className)} style={style} {...a11y} />;
}
