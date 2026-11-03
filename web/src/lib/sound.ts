"use client";
// Game sounds, made in the browser with Web Audio: no audio files to download, everything short and soft.
// Cues for clicks and for every action that lands, plus the colony's ambience: a low underground hum and ants
// pattering through the tunnels. Browsers only allow sound after the player's first tap or key, so the audio
// starts then. The mute switch lives in the header (and Settings); the choice is remembered per device.

export type Cue =
  | "click" | "tend" | "feed" | "coins" | "build" | "assign" | "speed" | "found" | "raid" | "guard" | "shield"
  | "reveal" | "win" | "lose" | "fail" | "done";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let ambienceWanted = 0; // screens that want the colony ambience, counted
let hum: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let patter: ReturnType<typeof setTimeout> | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (!enabled || typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuf = buf);
}

/** One enveloped oscillator note. `to` slides the pitch. */
function tone(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType, vol: number, to?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** A burst of filtered noise: rustles, thuds, footsteps. */
function hiss(c: AudioContext, at: number, dur: number, vol: number, filter: BiquadFilterType, freq: number, pan = 0) {
  const s = c.createBufferSource();
  s.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  const p = c.createStereoPanner();
  p.pan.value = pan;
  s.connect(f).connect(g).connect(p).connect(master!);
  s.start(at, Math.random());
  s.stop(at + dur + 0.02);
}

const arp = (c: AudioContext, t: number, notes: number[], step: number, type: OscillatorType, vol: number, last = 0.18) =>
  notes.forEach((n, i) => tone(c, n, t + i * step, i === notes.length - 1 ? last : step * 1.6, type, vol));

export function play(cue: Cue) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.01;
  switch (cue) {
    case "click": tone(c, 900, t, 0.035, "square", 0.025); break;
    case "tend": hiss(c, t, 0.22, 0.12, "bandpass", 2800); tone(c, 660, t + 0.1, 0.08, "triangle", 0.06); tone(c, 880, t + 0.17, 0.12, "triangle", 0.06); break;
    case "feed": arp(c, t, [523, 659, 784, 1047], 0.08, "triangle", 0.09, 0.4); break;
    case "coins": tone(c, 1319, t, 0.07, "square", 0.04); tone(c, 1760, t + 0.07, 0.16, "square", 0.04); break;
    case "build": hiss(c, t, 0.14, 0.2, "lowpass", 500); tone(c, 140, t, 0.2, "sine", 0.22, 60); hiss(c, t + 0.16, 0.1, 0.12, "lowpass", 700); break;
    case "assign": tone(c, 520, t, 0.05, "square", 0.03); tone(c, 780, t + 0.07, 0.06, "square", 0.03); break;
    case "speed": hiss(c, t, 0.3, 0.1, "highpass", 1500); tone(c, 400, t, 0.3, "sine", 0.06, 1200); break;
    case "found": arp(c, t, [392, 523, 659, 784, 1047], 0.09, "square", 0.05, 0.5); break;
    case "raid": tone(c, 150, t, 0.22, "sine", 0.3, 50); tone(c, 150, t + 0.24, 0.22, "sine", 0.3, 50); hiss(c, t + 0.24, 0.12, 0.08, "highpass", 2000); break;
    case "guard":
    case "shield": tone(c, 1200, t, 0.35, "triangle", 0.06); tone(c, 1810, t, 0.3, "triangle", 0.04); tone(c, 600, t, 0.12, "square", 0.03); break;
    case "reveal": tone(c, 300, t, 0.32, "sine", 0.1, 900); break;
    case "win": arp(c, t, [523, 659, 784, 1047], 0.1, "square", 0.05, 0.45); break;
    case "lose": arp(c, t, [392, 330, 262], 0.16, "triangle", 0.09, 0.4); break;
    case "fail": tone(c, 110, t, 0.18, "square", 0.04); break;
    case "done": tone(c, 784, t, 0.08, "triangle", 0.07); tone(c, 1047, t + 0.08, 0.16, "triangle", 0.07); break;
  }
}

// ---- ambience: a low hum, and an ant's footsteps every so often, left or right in the tunnels

function startAmbience() {
  const c = audio();
  if (!c || hum || document.hidden) return;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 180;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 2);
  src.connect(f).connect(gain).connect(master!);
  src.start();
  hum = { src, gain };
  const step = () => {
    const a = audio();
    if (a && hum) {
      const pan = Math.random() * 1.6 - 0.8;
      const steps = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < steps; i++) hiss(a, a.currentTime + i * 0.07, 0.02, 0.012 + Math.random() * 0.01, "bandpass", 5000 + Math.random() * 2000, pan);
    }
    patter = setTimeout(step, 600 + Math.random() * 1600);
  };
  patter = setTimeout(step, 800);
}

function stopAmbience() {
  if (patter) clearTimeout(patter);
  patter = null;
  if (hum && ctx) {
    const h = hum;
    h.gain.gain.cancelScheduledValues(ctx.currentTime);
    h.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
    setTimeout(() => h.src.stop(), 800);
  }
  hum = null;
}

/** The Colony screen asks for ambience while it is on screen. Starts after the first tap if needed. */
export function wantAmbience(on: boolean) {
  ambienceWanted = Math.max(0, ambienceWanted + (on ? 1 : -1));
  if (ambienceWanted > 0 && ctx) startAmbience();
  if (ambienceWanted === 0) stopAmbience();
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (!on) {
    stopAmbience();
    void ctx?.suspend();
  } else if (ctx) {
    void ctx.resume();
    if (ambienceWanted > 0) startAmbience();
  }
}

/** First tap or key anywhere: unlocks audio, starts the ambience if a screen wants it, and clicks on controls. */
export function installSoundListeners(): () => void {
  const onClick = (e: MouseEvent) => {
    const el = e.target instanceof Element ? e.target.closest("button, a[href], [role='button'], summary, input[type='range']") : null;
    if (!audio()) return;
    if (ambienceWanted > 0) startAmbience();
    if (el && !(el as HTMLButtonElement).disabled) play("click");
  };
  const onKey = () => {
    if (audio() && ambienceWanted > 0) startAmbience();
  };
  const onVis = () => {
    if (document.hidden) stopAmbience();
    else if (ambienceWanted > 0 && ctx) startAmbience();
  };
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("visibilitychange", onVis);
  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("visibilitychange", onVis);
  };
}

/** The sound for a landed transaction, read from its events. */
export function cueForEvents(names: string[], raidWon: boolean | null): Cue {
  const has = (n: string) => names.includes(n);
  if (has("RaidSettled")) return raidWon ? "win" : "lose";
  if (has("ColonyFounded")) return "found";
  if (has("RaidLaunched")) return "raid";
  if (has("Guarded")) return "guard";
  if (has("Shielded")) return "shield";
  if (has("Revealed") || has("RaidCollected")) return "reveal";
  if (has("QueenFed") || has("Revived")) return "feed";
  if (has("SpedUp")) return "speed";
  if (has("Built")) return "build";
  if (has("WorkersAssigned")) return "assign";
  if (has("Tended")) return "tend";
  if (has("Claimed") || has("Paid")) return "coins";
  return "done";
}
