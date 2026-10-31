export type StepperProps = {
  value: number; min: number; max: number; onChange: (value: number) => void;
  label: string; decLabel: string; incLabel: string;
};

export function Stepper({ value, min, max, onChange, label, decLabel, incLabel }: StepperProps) {
  return (
    <div className="c0-stepper" role="group" aria-label={label}>
      <button type="button" className="c0-stepper__btn" aria-label={decLabel} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <output className="c0-stepper__val" aria-label={label}>{value}</output>
      <button type="button" className="c0-stepper__btn" aria-label={incLabel} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}
