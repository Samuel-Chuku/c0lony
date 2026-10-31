import type { ReactNode } from "react";
import { Avatar, type AvatarProps } from "./Avatar";
import { Button } from "./Button";
import { Card } from "./Card";
import { Hand } from "./Hand";

export type NeighbourAction =
  | { kind: "raid"; onClick: () => void; busy?: string }
  | { kind: "cooldown"; time: string }
  | { kind: "avenge"; onClick: () => void };

export type NeighbourRowProps = {
  avatar: Omit<AvatarProps, "size">;
  handle: string;
  line: ReactNode;
  note?: ReactNode;
  isRaider?: boolean;
  onOpenProfile: () => void;
  action: NeighbourAction;
};

export function NeighbourRow({ avatar, handle, line, note, isRaider, onOpenProfile, action }: NeighbourRowProps) {
  return (
    <Card className={`c0-nrow${isRaider ? " c0-card--red" : ""}`}>
      <button type="button" className="c0-linkbtn c0-nrow__main" onClick={onOpenProfile} aria-label={`Open profile of ${handle}`}>
        <Avatar {...avatar} size={40} />
        <span className="c0-nrow__col">
          <span className="c0-nrow__handle">{handle}</span>
          <span className="c0-nrow__line">{line}</span>
          {note ? <Hand size={15} className={isRaider ? "c0-nrow__note c0-nrow__note--raider" : "c0-nrow__note"}>{note}</Hand> : null}
        </span>
      </button>
      {action.kind === "raid" ? (
        <Button variant="raid" size="compact" icon="raids" onClick={action.onClick} busy={action.busy}>Raid</Button>
      ) : action.kind === "avenge" ? (
        <Button variant="raid" size="compact" icon="raids" onClick={action.onClick}>Avenge</Button>
      ) : (
        <div className="c0-cooldown"><span>cooldown</span><span className="c0-cooldown__time">{action.time}</span></div>
      )}
    </Card>
  );
}
