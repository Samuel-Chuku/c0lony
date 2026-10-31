import { cx } from "./cx";

export type MeterProps = { value: number; max: number; label: string; kind?: "queen" | "paper" | "underway"; className?: string };

export function Meter({ value, max, label, kind = "paper", className }: MeterProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className={cx("c0-meter", `c0-meter--${kind}`, className)}
      role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}
    >
      <div className="c0-meter__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
