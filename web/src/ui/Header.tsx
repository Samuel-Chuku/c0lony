import type { ReactNode } from "react";
import { Avatar } from "./Avatar";
import { ResIcon } from "./ResIcon";

export type HeaderProps = {
  title: ReactNode;
  sub?: ReactNode;
  wifBalance?: string;
  avatar: { src?: string | null; address?: string };
  onOpenMenu: () => void;
  back?: { label?: string; onClick: () => void };
  /** Extra header control between the balance and the avatar (the sound toggle). */
  extra?: ReactNode;
};

export function Header({ title, sub, wifBalance, avatar, onOpenMenu, back, extra }: HeaderProps) {
  return (
    <header className="c0-header">
      {back ? (
        <button type="button" className="c0-header__back" onClick={back.onClick}>‹ {back.label ?? "Back"}</button>
      ) : (
        <h1 className="c0-header__title">
          {title}
          {sub ? <span className="c0-header__sub">{sub}</span> : null}
        </h1>
      )}
      {wifBalance ? (
        <span className="c0-header__wif"><ResIcon name="wif" size={20} />{wifBalance}</span>
      ) : null}
      {extra}
      <button type="button" className="c0-header__avatar" aria-label="Open menu and profile" onClick={onOpenMenu} data-shortcut="m" data-tip="Menu · M">
        <Avatar src={avatar.src} address={avatar.address} alt="Your avatar" />
      </button>
    </header>
  );
}
