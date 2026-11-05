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
let hum: { stop: () => void } | null = null; // the running ambience
let noiseBuf: AudioBuffer | null = null;
// A cue that came in while audio was asleep (before the first tap, or after the phone paused the page while the
// player was in their wallet app). It plays as soon as audio wakes, if that is within a few seconds.
let pending: { cue: Cue; at: number } | null = null;
const PENDING_MS = 15_000;

/** The audio context, created on first use. It may still be asleep: check `ctx.state` before scheduling. */
function context(): AudioContext | null {
  if (!enabled || typeof window === "undefined") return null;
  if (ctx?.state === "closed") ctx = null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 1; // cues are mixed soft; full gain keeps them audible on laptop speakers without clipping
    master.connect(ctx.destination);
    noiseBuf = null;
    hum = null; // a closed context took its hum with it
    ctx.onstatechange = () => {
      if (ctx?.state !== "running") return;
      if (pending && Date.now() - pending.at < PENDING_MS) {
        const cue = pending.cue;
        pending = null;
        play(cue);
      }
      pending = null;
      if (ambienceWanted > 0) startAmbience();
    };
  }
  return ctx;
}

/** Wakes audio. Browsers allow this after the player's first tap; phones also put it to sleep in the background. */
function wake() {
  const c = context();
  if (c && c.state !== "running") void c.resume().catch(() => {});
}

/** A running context, or null (and a wake attempt) if audio is asleep or muted. */
function audio(): AudioContext | null {
  const c = context();
  if (!c) return null;
  if (c.state === "running") return c;
  wake();
  return null;
}

/** Called inside a tap or key press: the one moment every browser lets audio start. Plays one silent sample,
 * which older iPhones need before they will play anything else. */
function unlock() {
  const c = context();
  if (!c) return;
  if (c.state !== "running") void c.resume().catch(() => {});
  try {
    const s = c.createBufferSource();
    s.buffer = c.createBuffer(1, 1, c.sampleRate);
    s.connect(c.destination);
    s.start(0);
  } catch { /* nothing to unlock */ }
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
  if (!c) {
    if (enabled && cue !== "click") pending = { cue, at: Date.now() };
    return;
  }
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

// ---- ambience: the colony underground, on every screen. A warm two-note drone, air moving through the tunnels,
// a slow music-box note now and then, and ants pattering left and right. Everything sits in the mid range so it
// carries on laptop and phone speakers, and stays well under the action cues.

const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33]; // A minor pentatonic, two octaves

function startAmbience() {
  const c = audio();
  if (!c || hum || document.hidden) return;
  const now = c.currentTime;
  const bus = c.createGain();
  bus.gain.setValueAtTime(0.0001, now);
  bus.gain.exponentialRampToValueAtTime(0.55, now + 3); // about 5 dB under the action cues
  bus.connect(master!);

  // Drone: A and E, slightly detuned triangles through a lowpass that slowly opens and closes.
  const droneF = c.createBiquadFilter();
  droneF.type = "lowpass";
  droneF.frequency.value = 700;
  droneF.Q.value = 0.8;
  const droneG = c.createGain();
  droneG.gain.value = 0.035;
  droneF.connect(droneG).connect(bus);
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.05;
  const lfoDepth = c.createGain();
  lfoDepth.gain.value = 300;
  lfo.connect(lfoDepth).connect(droneF.frequency);
  const oscs = [110, 110.6, 164.8].map((f) => {
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    o.connect(droneF);
    return o;
  });

  // Air in the tunnels: soft band of noise that breathes in and out.
  const air = c.createBufferSource();
  air.buffer = noise(c);
  air.loop = true;
  const airF = c.createBiquadFilter();
  airF.type = "bandpass";
  airF.frequency.value = 600;
  airF.Q.value = 0.6;
  const airG = c.createGain();
  airG.gain.value = 0.018;
  const breath = c.createOscillator();
  breath.frequency.value = 0.08;
  const breathDepth = c.createGain();
  breathDepth.gain.value = 0.012;
  breath.connect(breathDepth).connect(airG.gain);
  air.connect(airF).connect(airG).connect(bus);

  for (const n of [...oscs, lfo, breath]) n.start(now);
  air.start(now);

  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));

  // A music-box note every few seconds, sometimes answered by a second.
  const pluck = (freq: number, at: number, vol: number) => {
    const o = c.createOscillator();
    const o2 = c.createOscillator();
    const g = c.createGain();
    const p = c.createStereoPanner();
    o.type = "sine";
    o2.type = "triangle";
    o.frequency.value = freq;
    o2.frequency.value = freq * 2;
    p.pan.value = Math.random() * 1.2 - 0.6;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 2.2);
    o.connect(g);
    o2.connect(g);
    g.connect(p).connect(bus);
    o.start(at);
    o2.start(at);
    o.stop(at + 2.3);
    o2.stop(at + 2.3);
  };
  const note = () => {
    if (!hum || c.state !== "running") return later(note, 3000);
    const i = Math.floor(Math.random() * SCALE.length);
    pluck(SCALE[i], c.currentTime, 0.03);
    if (Math.random() < 0.35) pluck(SCALE[Math.min(SCALE.length - 1, i + 2)], c.currentTime + 0.45, 0.022);
    later(note, 2500 + Math.random() * 4500);
  };
  const step = () => {
    if (hum && c.state === "running") {
      const pan = Math.random() * 1.6 - 0.8;
      const steps = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < steps; i++) hiss(c, c.currentTime + i * 0.07, 0.02, 0.014 + Math.random() * 0.01, "bandpass", 4000 + Math.random() * 2000, pan);
    }
    later(step, 700 + Math.random() * 1800);
  };
  later(note, 1500);
  later(step, 900);

  hum = {
    stop: () => {
      timers.forEach(clearTimeout);
      const t = c.currentTime;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setTargetAtTime(0.0001, t, 0.3);
      setTimeout(() => {
        for (const n of [...oscs, lfo, breath, air]) try { n.stop(); } catch { /* already stopped */ }
        bus.disconnect();
      }, 1500);
    },
  };
}

function stopAmbience() {
  hum?.stop();
  hum = null;
}

/** Screens ask for the ambience while they are open; the app shell asks for it on every screen. */
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
    wake();
    if (ambienceWanted > 0) startAmbience();
  }
}

/** Every tap or key unlocks or re-wakes audio, starts the ambience if a screen wants it, and clicks on controls.
 * Coming back to the tab also tries to wake it (desktop browsers allow that once the player has tapped before). */
export function installSoundListeners(): () => void {
  wantAmbience(true); // the colony is heard on every screen, from the first tap
  const onPress = () => {
    unlock();
    if (ambienceWanted > 0 && ctx?.state === "running") startAmbience();
  };
  const onClick = (e: MouseEvent) => {
    onPress();
    const el = e.target instanceof Element ? e.target.closest("button, a[href], [role='button'], summary, input[type='range']") : null;
    if (el && !(el as HTMLButtonElement).disabled) play("click");
  };
  const onBack = () => {
    if (document.hidden) {
      stopAmbience();
      return;
    }
    if (ctx) wake();
    if (ambienceWanted > 0 && ctx?.state === "running") startAmbience();
  };
  const opts = { capture: true, passive: true } as const;
  document.addEventListener("pointerdown", onPress, opts);
  document.addEventListener("touchend", onPress, opts);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onPress, true);
  document.addEventListener("visibilitychange", onBack);
  window.addEventListener("pageshow", onBack);
  window.addEventListener("focus", onBack);
  return () => {
    wantAmbience(false);
    document.removeEventListener("pointerdown", onPress, opts);
    document.removeEventListener("touchend", onPress, opts);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onPress, true);
    document.removeEventListener("visibilitychange", onBack);
    window.removeEventListener("pageshow", onBack);
    window.removeEventListener("focus", onBack);
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
