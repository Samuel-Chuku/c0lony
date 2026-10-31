import type { ReactNode } from "react";

export type SwitchProps = { id: string; label: ReactNode; checked: boolean; onChange: (checked: boolean) => void; hint?: ReactNode };

export function Switch({ id, label, checked, onChange, hint }: SwitchProps) {
  return (
    <div className="c0-switch">
      <label htmlFor={id} className="c0-switch__label">
        {label}
        {hint ? <span className="c0-switch__hint">{hint}</span> : null}
      </label>
      <input id={id} type="checkbox" role="switch" className="c0-switch__input" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}
