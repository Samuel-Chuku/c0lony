import type { ReactNode } from "react";
import { Avatar, type AvatarProps } from "./Avatar";
import { Card } from "./Card";
import { cx } from "./cx";

export type FeedRowProps = {
  avatar: Omit<AvatarProps, "size">;
  kind: string;
  kindTone: "raid" | "sub";
  timeAgo: string;
  children: ReactNode;
  own?: boolean;
  shareHref?: string;
  onOpenProfile: () => void;
  /** Short side-column row: small avatar, tighter padding, no share link. */
  compact?: boolean;
};

export function FeedRow({ avatar, kind, kindTone, timeAgo, children, own, shareHref, onOpenProfile, compact }: FeedRowProps) {
  return (
    <Card className={cx("c0-frow", compact && "c0-frow--compact", own && "c0-card--clay")}>
      <button type="button" className="c0-linkbtn" onClick={onOpenProfile} aria-label="Open profile">
        <Avatar {...avatar} size={compact ? 32 : 40} />
      </button>
      <div className="c0-frow__col">
        <div className="c0-frow__top">
          <span className={cx("c0-frow__kind", kindTone === "raid" && "c0-frow__kind--raid")}>{kind}</span>
          <span className="c0-frow__time">{timeAgo}</span>
        </div>
        <div className="c0-frow__text">{children}</div>
        {own && shareHref && !compact ? <a className="c0-frow__share" href={shareHref} target="_blank" rel="noreferrer">Share on X ›</a> : null}
      </div>
    </Card>
  );
}
