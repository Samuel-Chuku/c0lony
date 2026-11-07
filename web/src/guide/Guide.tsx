"use client";
// The one-minute guide: six short reels, narrated by the queen, that show how C0LONY plays. Used on the landing
// site and in the app (same component, no game data needed). Each reel has a small animated scene drawn from the
// game's own parts, a line from the queen that types itself out, and optional typing blips.
import "./guide.css";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BrandName, ResIcon, useDialog } from "../ui";

type Reel = { kicker: string; title: ReactNode; body: ReactNode; queen: string; scene: ReactNode };

const Coin = ({ children }: { children: ReactNode }) => (
  <span className="g-wif"><ResIcon name="wif" size={16} />{children}</span>
);

const REELS: Reel[] = [
  {
    kicker: "THE GAME",
    title: "Grow a colony. Keep her fed.",
    body: <><BrandName /> is an ant colony that lives onchain, on Robinhood Chain. You play it with <Coin>$WIF</Coin>.</>,
    queen: "Welcome, little digger. This is my colony, and soon one will be yours. Let me show you around.",
    scene: <SceneWorld />,
  },
  {
    kicker: "FEED",
    title: "Feed her every 72 hours.",
    body: <>Feeding costs WIF. Each feeding hatches new ants from spare sugar and adds to your score. Miss 72 hours and she starves.</>,
    queen: "I get hungry every three days. Feed me and the colony grows. Forget me and it falls.",
    scene: <SceneFeed />,
  },
  {
    kicker: "TEND AND BUILD",
    title: "Leaves and sugar keep it running.",
    body: <>Tend to bring in what the foragers found. Spend leaves on chambers for more ants, trails for leaves and farms for sugar.</>,
    queen: "Ants on trails and farms work while you sleep. Come back once a day and tend.",
    scene: <SceneTend />,
  },
  {
    kicker: "RAIDS",
    title: "Raid in secret. Guard on a guess.",
    body: <>Pick leaves or sugar and seal it. Your neighbour gets 4 hours to guard one. Guess right and the raid fails.</>,
    queen: "Send your free ants at a neighbour. Nobody sees your target until the seal opens. Raids never touch WIF.",
    scene: <SceneRaid />,
  },
  {
    kicker: "FAIR ROLLS",
    title: "Nobody picks the roll. Not even us.",
    body: <>Every raid is rolled by drand, a public randomness beacon. The contract checks the beacon's signature itself.</>,
    queen: "The roll comes from the sky, not from us. Every raid report links to its round, so you can check it.",
    scene: <SceneDrand />,
  },
  {
    kicker: "THE POT",
    title: "Spend WIF. Win WIF.",
    body: <>Of every WIF spent, 70% goes to the season pot, 20% is burned and 10% keeps the game running. Colonies alive at the end share the pot by score.</>,
    queen: "Finish the season with a living colony and a high score, and take your share of the pot. Off you go.",
    scene: <ScenePot />,
  },
];

const TYPE_MS = 28;
const reduced = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("c0-reduce-motion"));

/** Soft square-wave blips while the queen talks. Only after the viewer turns sound on (a tap). */
function useBlips() {
  const ctx = useRef<AudioContext | null>(null);
  const [on, setOn] = useState(false);
  const toggle = useCallback(() => {
    setOn((v) => {
      const next = !v;
      if (next && !ctx.current) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) ctx.current = new Ctor();
      }
      void ctx.current?.resume();
      return next;
    });
  }, []);
  const blip = useCallback(() => {
    const c = ctx.current;
    if (!on || !c || c.state !== "running") return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square";
    o.frequency.value = 420 + Math.random() * 160;
    g.gain.setValueAtTime(0.025, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.05);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.06);
  }, [on]);
  useEffect(() => () => void ctx.current?.close(), []);
  return { on, toggle, blip };
}

export function Guide({ open, onClose, playHref, playLabel = "Start playing" }: {
  open: boolean; onClose: () => void; playHref?: string; playLabel?: string;
}) {
  const ref = useDialog<HTMLDivElement>(open, onClose);
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState(0);
  const sound = useBlips();
  const reel = REELS[i];
  const last = i === REELS.length - 1;
  const done = typed >= reel.queen.length;

  useEffect(() => { if (open) setI(0); }, [open]);

  // Type the queen's line; a blip every other letter.
  useEffect(() => {
    if (!open) return;
    if (reduced()) { setTyped(reel.queen.length); return; }
    setTyped(0);
    let n = 0;
    const t = setInterval(() => {
      n++;
      setTyped(n);
      if (n % 2 === 0 && reel.queen[n - 1] !== " ") sound.blip();
      if (n >= reel.queen.length) clearInterval(t);
    }, TYPE_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i]);

  const next = useCallback(() => (done ? (last ? onClose() : setI((v) => v + 1)) : setTyped(reel.queen.length)), [done, last, onClose, reel]);
  const back = useCallback(() => setI((v) => Math.max(0, v - 1)), []);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open, next, back]);

  // Swipe left or right on the reel.
  const touch = useRef<number | null>(null);

  if (!open) return null;
  return (
    <div className="c0-dialog-root g-root">
      <div className="c0-dim" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        className="g-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="g-title"
        tabIndex={-1}
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (dx < -50) next();
          else if (dx > 50) back();
        }}
      >
        <div className="g-top">
          <span className="g-count">REEL {i + 1} OF {REELS.length}</span>
          <button type="button" className={`g-chip${sound.on ? " g-chip--on" : ""}`} aria-pressed={sound.on} onClick={sound.toggle}>
            {sound.on ? "Sound on" : "Tap for sound"}
          </button>
          <button type="button" className="g-chip" onClick={onClose}>Skip ×</button>
        </div>

        <div className="g-film">
          <div className="g-frame" key={i}>
            <span className="g-kicker">{reel.kicker}</span>
            <h2 className="g-title" id="g-title">{reel.title}</h2>
            <p className="g-body">{reel.body}</p>
            <div className="g-scene" aria-hidden="true">{reel.scene}</div>
            <div className="g-talk">
              <span className="g-portrait" aria-hidden="true"><ResIcon name="queen" size={56} /></span>
              <p className="g-bubble">
                <b>THE QUEEN:</b> <span className="g-said">{reel.queen.slice(0, typed)}</span>
                <span className="g-unsaid" aria-hidden="true">{reel.queen.slice(typed)}</span>
                {!done ? <span className="g-caret" aria-hidden="true">_</span> : null}
              </p>
            </div>
          </div>
        </div>

        <ol className="g-dots" aria-label="Reels">
          {REELS.map((r, n) => (
            <li key={r.kicker}>
              <button
                type="button"
                className={`g-dot${n === i ? " g-dot--now" : n < i ? " g-dot--seen" : ""}`}
                aria-label={`Reel ${n + 1}: ${r.kicker.toLowerCase()}`}
                aria-current={n === i ? "step" : undefined}
                onClick={() => setI(n)}
              />
            </li>
          ))}
        </ol>

        <div className="g-nav">
          <button type="button" className="c0-btn c0-btn--dark g-navbtn" onClick={back} disabled={i === 0}>‹ Back</button>
          {last && done && playHref ? (
            <a className="c0-btn c0-btn--paper g-navbtn" href={playHref} onClick={onClose}>{playLabel} ›</a>
          ) : (
            <button type="button" className={`c0-btn c0-btn--paper g-navbtn${done ? " g-ready" : ""}`} onClick={next}>
              {done ? (last ? "Done" : "Next ›") : "Show all"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- scenes */

function SceneWorld() {
  return (
    <div className="g-s g-s--world">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/world.svg" alt="" className="g-world" />
      <span className="g-walker g-walker--a"><ResIcon name="ant" size={20} /></span>
      <span className="g-walker g-walker--b"><ResIcon name="ant" size={20} /></span>
    </div>
  );
}

function SceneFeed() {
  return (
    <div className="g-s g-s--feed">
      <span className="g-queen"><ResIcon name="queen" size={88} /></span>
      <div className="g-feedcol">
        <div className="g-meter"><span className="g-meter__fill" /></div>
        <div className="g-meterlbl"><span>fed</span><span className="g-hours" /></div>
        <span className="g-fakebtn g-fakebtn--wif">Feed her · <ResIcon name="wif" size={16} /> WIF</span>
      </div>
    </div>
  );
}

function SceneTend() {
  return (
    <div className="g-s g-s--tend">
      <div className="g-stock">
        <span><ResIcon name="leaf" size={28} /><b className="g-count-up g-count-up--leaf" /></span>
        <span><ResIcon name="sugar" size={28} /><b className="g-count-up g-count-up--sugar" /></span>
      </div>
      <div className="g-builds">
        {(["chamber", "trail", "farm"] as const).map((b, n) => (
          <span key={b} className="g-build" style={{ animationDelay: `${0.6 + n * 0.5}s` }}>
            <ResIcon name={b} size={32} />
            <small>{b}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

function SceneRaid() {
  return (
    <div className="g-s g-s--raid">
      <div className="g-seal">
        <span className="g-seal__env">SEALED</span>
        <span className="g-seal__opts">
          <ResIcon name="leaf" size={24} />
          <span className="g-q">?</span>
          <ResIcon name="sugar" size={24} />
        </span>
      </div>
      <div className="g-march">
        <span className="g-march__ants">
          <ResIcon name="ant" size={20} /><ResIcon name="ant" size={20} /><ResIcon name="ant" size={20} />
        </span>
        <span className="g-march__home"><ResIcon name="chamber" size={32} /></span>
      </div>
      <ol className="g-steps">
        {["Seal", "Guard 4h", "Reveal", "Roll"].map((s, n) => (
          <li key={s} style={{ animationDelay: `${n * 0.9}s` }}>{s}</li>
        ))}
      </ol>
    </div>
  );
}

function SceneDrand() {
  return (
    <div className="g-s g-s--drand">
      <div className="g-round">drand round <b className="g-roundno" /></div>
      <div className="g-sig"><span className="g-sig__roll">0x8f3a91c2e7b04d5a 0x1b7e4c90a2f3d68e 0x5d02ee71b9c4a813 0xc49a07f3e1d25b6c 0x8f3a91c2e7b04d5a</span></div>
      <div className="g-stamp">VERIFIED ONCHAIN</div>
    </div>
  );
}

function ScenePot() {
  return (
    <div className="g-s g-s--pot">
      <div className="g-split">
        <span className="g-split__pot">70% pot</span>
        <span className="g-split__burn">20%</span>
        <span className="g-split__tre">10%</span>
      </div>
      <div className="g-splitkey"><span>season pot</span><span>burned</span><span>treasury</span></div>
      <div className="g-podium">
        <span className="g-pod g-pod--2"><ResIcon name="queen" size={28} /><b>2</b></span>
        <span className="g-pod g-pod--1"><ResIcon name="wif" size={28} /><b>1</b></span>
        <span className="g-pod g-pod--3"><ResIcon name="queen" size={28} /><b>3</b></span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- opener */

export const GUIDE_SEEN_KEY = "c0lony:guide-seen";

/** Open state for the guide: opens itself once per device (when `auto`), and on ?guide=1. */
export function useGuide(auto: boolean) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let seen = true;
    try { seen = localStorage.getItem(GUIDE_SEEN_KEY) === "1"; } catch {}
    const asked = new URLSearchParams(window.location.search).get("guide") === "1";
    if (asked || (auto && !seen)) setOpen(true);
  }, [auto]);
  const close = useCallback(() => {
    setOpen(false);
    try { localStorage.setItem(GUIDE_SEEN_KEY, "1"); } catch {}
    const u = new URL(window.location.href);
    if (u.searchParams.has("guide")) {
      u.searchParams.delete("guide");
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
    }
  }, []);
  return { open, show: useCallback(() => setOpen(true), []), close };
}
