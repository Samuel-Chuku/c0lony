import type { ReactNode } from "react";
import { Avatar } from "./Avatar";
import { PixelIcon } from "./PixelIcon";

export type HeaderProps = {
  title: ReactNode;
  sub?: ReactNode;
  wifBalance?: string;
  avatar: { src?: string | null; address?: string };
  onOpenMenu: () => void;
  back?: { label?: string; onClick: () => void };
};

export function Header({ title, sub, wifBalance, avatar, onOpenMenu, back }: HeaderProps) {
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
        <span className="c0-header__wif"><PixelIcon name="wif" />{wifBalance}</span>
      ) : null}
      <button type="button" className="c0-header__avatar" aria-label="Open menu and profile" onClick={onOpenMenu}>
        <Avatar src={avatar.src} address={avatar.address} alt="Your avatar" />
      </button>
    </header>
  );
}
