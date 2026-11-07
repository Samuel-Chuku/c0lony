"use client";
// The header bell: how many things are waiting on the player, and a list that takes them to each one.
import Link from "next/link";
import { useState } from "react";
import { Modal, PixelIcon, ResIcon } from "../ui";
import { useColonyView } from "../screens/colony/data";
import { displayName, fmtDuration } from "../lib/format";
import { useXProfile } from "../lib/useXProfile";
import { useSession } from "../lib/session";
import { useTodos, type Todo } from "../lib/todos";

function Raider({ raid }: { raid: NonNullable<Todo["raid"]> }) {
  // Plain text, not a profile link: these rows are links themselves.
  const owner = useColonyView(raid.raider).data?.data.owner.toLowerCase();
  const x = useXProfile(owner);
  return <b>{owner ? displayName(owner, x?.xHandle) : "A neighbour"}</b>;
}

function Row({ t, onGo }: { t: Todo; onGo: () => void }) {
  let icon = <PixelIcon name="raids" />;
  let text: React.ReactNode;
  if (t.kind === "guard") text = <><Raider raid={t.raid!} /> is marching on you. Guard within {fmtDuration(t.left ?? 0)}</>;
  else if (t.kind === "close") text = <>A raid ended without a roll. Close it to raid again</>;
  else if (t.kind === "revive") { icon = <ResIcon name="queen" size={20} />; text = <>Your queen is starving. Revive her before the colony falls</>; }
  else if (t.kind === "feed") { icon = <ResIcon name="queen" size={20} />; text = <>The queen can be fed</>; }
  else { icon = <PixelIcon name="pantry" />; text = <>The pantry has {t.trips} {t.trips === 1 ? "trip" : "trips"} to claim</>; }
  return (
    <li>
      <Link href={t.href} className={t.kind === "guard" || t.kind === "close" ? "c0-todo c0-todo--raid" : "c0-todo"} onClick={onGo}>
        <span className="c0-todo__icon" aria-hidden="true">{icon}</span>
        <span className="c0-todo__text">{text}</span>
        <span className="c0-todo__go" aria-hidden="true">›</span>
      </Link>
    </li>
  );
}

export function TodoBell() {
  const session = useSession();
  const todos = useTodos(session.address);
  const [open, setOpen] = useState(false);
  if (!session.signedIn) return null;
  const n = todos.length;
  return (
    <>
      <button
        type="button"
        className="c0-header__sound c0-bell"
        aria-label={n ? `${n} ${n === 1 ? "thing needs" : "things need"} you` : "Nothing needs you"}
        data-tip={n ? `${n} to do` : "All done"}
        onClick={() => setOpen(true)}
      >
        <PixelIcon name="bell" />
        {n ? <b className="c0-bell__count" aria-hidden="true">{n}</b> : null}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="TO DO" kicker={n ? `${n} waiting on you` : "all caught up"}>
        {n ? (
          <ul className="c0-todos">{todos.map((t) => <Row key={t.id} t={t} onGo={() => setOpen(false)} />)}</ul>
        ) : (
          <p style={{ margin: 0 }}>Nothing needs you right now. The bell counts raids to guard, a hungry queen and a full pantry.</p>
        )}
      </Modal>
    </>
  );
}

/** A red strip on every screen while a raid on the player is unguarded; it goes once they guard. */
export function RaidStrip() {
  const session = useSession();
  const todos = useTodos(session.address).filter((t) => t.kind === "guard");
  if (!todos.length) return null;
  const t = todos[0];
  return (
    <Link href="/?tab=raids" className="c0-raidstrip">
      <span><Raider raid={t.raid!} /> is marching on you · not guarded · {fmtDuration(t.left ?? 0)} left</span>
      <span className="c0-raidstrip__go">Guard ›</span>
    </Link>
  );
}
