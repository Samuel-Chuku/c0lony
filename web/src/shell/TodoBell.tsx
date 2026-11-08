"use client";
// The header bell: how many things are waiting on the player, and a list that takes them to each one.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PixelIcon, ResIcon } from "../ui";
import { useColonyView } from "../screens/colony/data";
import { displayName, fmtDuration } from "../lib/format";
import { useXProfile } from "../lib/useXProfile";
import { useSession } from "../lib/session";
import { useTodos, type Todo } from "../lib/todos";

function Raider({ raid }: { raid: NonNullable<Todo["raid"]> }) {
  // Plain text, not a profile link: these rows are links themselves.
  const owner = useColonyView(raid.raider).data?.data.owner.toLowerCase();
  const x = useXProfile(owner);
  return <b>{owner ? displayName(owner, x) : "A neighbour"}</b>;
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
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const bell = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => setAt(null);

  // A small panel that drops from the bell (not a centred dialog). Closes on Escape, a tap outside, or a pick.
  useEffect(() => {
    if (!at) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); bell.current?.focus(); } };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !bell.current?.contains(t)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    panel.current?.querySelector<HTMLElement>("a")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [at]);

  if (!session.signedIn) return null;
  const n = todos.length;
  const toggle = () => {
    if (at) return close();
    const r = bell.current!.getBoundingClientRect();
    // Hang under the bell, right edges lined up, but never past either side of the screen.
    const vw = window.innerWidth;
    const width = Math.min(320, vw - 16);
    const right = Math.min(Math.max(8, vw - r.right - 8), vw - width - 8);
    setAt({ top: r.bottom + 6, right });
  };
  return (
    <>
      <button
        ref={bell}
        type="button"
        className="c0-header__sound c0-bell"
        aria-label={n ? `${n} ${n === 1 ? "thing needs" : "things need"} you` : "Nothing needs you"}
        aria-expanded={!!at}
        aria-haspopup="dialog"
        data-tip={n ? `${n} to do` : "All done"}
        onClick={toggle}
      >
        <PixelIcon name="bell" />
        {n ? <b className="c0-bell__count" aria-hidden="true">{n}</b> : null}
      </button>
      {at ? (
        <div ref={panel} className="c0-bellpop" role="dialog" aria-label="To do" style={{ top: at.top, right: at.right }}>
          <div className="c0-bellpop__head">
            <span>TO DO</span>
            <span className="c0-bellpop__sub">{n ? `${n} waiting` : "all caught up"}</span>
          </div>
          {n ? (
            <ul className="c0-todos">{todos.map((t) => <Row key={t.id} t={t} onGo={close} />)}</ul>
          ) : (
            <p className="c0-bellpop__empty">Nothing needs you right now. Raids to guard, a hungry queen and a full pantry show up here.</p>
          )}
        </div>
      ) : null}
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
      <span className="c0-raidstrip__go">Guard <span aria-hidden="true">›</span></span>
    </Link>
  );
}
