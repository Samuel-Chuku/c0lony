import { cx } from "./cx";

type Props = {
  value: number;
  min?: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  className?: string;
};

/** A square slab slider with its range printed under each end. Pairs with a Stepper for single steps. */
export function Slider({ value, min = 0, max, onChange, label, className }: Props) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className={cx("c0-slider", className)}>
      <input
        type="range"
        className="c0-slider__input"
        min={min}
        max={Math.max(min, max)}
        step={1}
        value={value}
        disabled={max <= min}
        aria-label={label}
        style={{ ["--c0-fill" as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="c0-slider__ends" aria-hidden="true">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
