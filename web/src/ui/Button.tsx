import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { PixelIcon, type IconName } from "./PixelIcon";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant: "wif" | "raid" | "paper" | "dark";
  size?: "default" | "compact" | "hero";
  icon?: IconName;
  /** Verb in progress, e.g. "Feeding…". Shows the dither state and disables the button. */
  busy?: string;
  /** Why the button is disabled. Shows the hatch fill and one line under it. */
  disabledReason?: ReactNode;
  /** Failed transaction line, shown as a Blocked strip under the button. */
  error?: ReactNode;
  fullWidth?: boolean;
  children?: ReactNode;
};

export function Button({
  variant, size = "default", icon, busy, disabledReason, error, fullWidth, className, children, disabled, type = "button", ...rest
}: ButtonProps) {
  const isBusy = busy !== undefined;
  const blocked = !isBusy && disabledReason !== undefined && disabledReason !== null;
  return (
    <div className={cx("c0-btn-wrap", fullWidth && "c0-btn-wrap--full")}>
      <button
        type={type}
        className={cx(
          "c0-btn", `c0-btn--${variant}`, size !== "default" && `c0-btn--${size}`,
          fullWidth && "c0-btn--full", isBusy && "c0-btn--busy", blocked && "c0-btn--blocked", className,
        )}
        disabled={disabled || isBusy || blocked}
        aria-busy={isBusy || undefined}
        {...rest}
      >
        {icon && !isBusy ? <PixelIcon name={icon} /> : null}
        {isBusy ? busy : children}
      </button>
      {blocked ? <span className="c0-btn-note">{disabledReason}</span> : null}
      {error ? <div className="c0-blocked" role="alert">{error}</div> : null}
    </div>
  );
}
