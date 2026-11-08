"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// TypeX Sound FX Engine — Pure Web Audio API, Zero Dependencies
// ---------------------------------------------------------------------------

let sharedAudioCtx: AudioContext | null = null;
let masterCompressor: DynamicsCompressorNode | null = null;
let masterGain: GainNode | null = null;

function getAudioNodes(): { ctx: AudioContext; destination: AudioNode } | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) return null;
    sharedAudioCtx = new AudioCtxClass();
    masterCompressor = null;
    masterGain = null;
  }
  // Resume suspended context (browsers require resumption on user interaction)
  if (sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume().catch(() => {});
  }

  if (!masterGain || !masterCompressor) {
    masterGain = sharedAudioCtx.createGain();
    masterGain.gain.setValueAtTime(1.0, sharedAudioCtx.currentTime);

    masterCompressor = sharedAudioCtx.createDynamicsCompressor();
    masterCompressor.threshold.setValueAtTime(-6, sharedAudioCtx.currentTime);
    masterCompressor.knee.setValueAtTime(4, sharedAudioCtx.currentTime);
    masterCompressor.ratio.setValueAtTime(3.5, sharedAudioCtx.currentTime);
    masterCompressor.attack.setValueAtTime(0.002, sharedAudioCtx.currentTime);
    masterCompressor.release.setValueAtTime(0.04, sharedAudioCtx.currentTime);

    masterGain.connect(masterCompressor);
    masterCompressor.connect(sharedAudioCtx.destination);
  }

  return { ctx: sharedAudioCtx, destination: masterGain };
}

// ---------------------------------------------------------------------------
// Sound preference store.
// Reading localStorage inside a useState initializer meant the server rendered
// "muted / VolumeX" while the client rendered "enabled / Volume2", which is a
// hydration mismatch React cannot patch up. As an external store read through
// useSyncExternalStore, the server snapshot is a constant and React re-reads
// the stored value after hydration instead of during it.
// ---------------------------------------------------------------------------

const SOUND_STORAGE_KEY = "typex_sound";

// Mirrors the value when localStorage is unavailable (private mode, blocked storage).
let soundMemoryFallback = true;

const soundListeners = new Set<() => void>();

const subscribeSound = (onChange: () => void) => {
  soundListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    soundListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
};

const getSoundSnapshot = (): boolean => {
  try {
    const stored = localStorage.getItem(SOUND_STORAGE_KEY);
    if (stored !== null) return stored !== "false";
  } catch {
    // fall through to the in-memory value
  }
  return soundMemoryFallback;
};

// Server render and first client (hydration) render share this constant.
const getSoundServerSnapshot = (): boolean => true;

const setSoundPreference = (enabled: boolean) => {
  soundMemoryFallback = enabled;
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // non-fatal: the choice only lives in memory for this tab
  }
  soundListeners.forEach((listener) => listener());
};

export function useSoundEngine() {
  const soundEnabled = useSyncExternalStore(
    subscribeSound,
    getSoundSnapshot,
    getSoundServerSnapshot
  );

  const enabledRef = useRef(soundEnabled);
  useEffect(() => {
    enabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const toggleSound = useCallback(() => {
    setSoundPreference(!getSoundSnapshot());
  }, []);


  // -------------------------------------------------------------------------
  // playClick — tactile mechanical keypress sound
  // Produces an authentic, punchy mechanical switch click with rich tactile
  // leaf snap, housing clack, and deep bottom-out thock.
  // -------------------------------------------------------------------------
  const playClick = useCallback(() => {
    if (!enabledRef.current) return;
    const nodes = getAudioNodes();
    if (!nodes) return;
    const { ctx, destination } = nodes;

    const t = ctx.currentTime;
    // Subtle acoustic pitch variation per stroke for organic physical switch feel
    const jitter = 1 + (Math.random() - 0.5) * 0.12;

    // 1. Switch tactile leaf snap / transient pop (crisp mechanical click)
    const oscClick = ctx.createOscillator();
    const gainClick = ctx.createGain();
    oscClick.type = "triangle";
    oscClick.frequency.setValueAtTime(2600 * jitter, t);
    oscClick.frequency.exponentialRampToValueAtTime(650, t + 0.02);

    gainClick.gain.setValueAtTime(0.55, t);
    gainClick.gain.exponentialRampToValueAtTime(0.001, t + 0.024);

    oscClick.connect(gainClick);
    gainClick.connect(destination);
    oscClick.start(t);
    oscClick.stop(t + 0.026);

    // 2. Keycap & switch housing tactile clack (mid-range body resonance)
    const oscClack = ctx.createOscillator();
    const gainClack = ctx.createGain();
    oscClack.type = "triangle";
    oscClack.frequency.setValueAtTime(780 * jitter, t);
    oscClack.frequency.exponentialRampToValueAtTime(290, t + 0.035);

    gainClack.gain.setValueAtTime(0.45, t);
    gainClack.gain.exponentialRampToValueAtTime(0.001, t + 0.038);

    oscClack.connect(gainClack);
    gainClack.connect(destination);
    oscClack.start(t);
    oscClack.stop(t + 0.04);

    // 3. Solid chassis bottom-out thock (deep acoustic presence)
    const oscThock = ctx.createOscillator();
    const gainThock = ctx.createGain();
    oscThock.type = "sine";
    oscThock.frequency.setValueAtTime(240 * jitter, t);
    oscThock.frequency.exponentialRampToValueAtTime(95, t + 0.045);

    gainThock.gain.setValueAtTime(0.38, t);
    gainThock.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    oscThock.connect(gainThock);
    gainThock.connect(destination);
    oscThock.start(t);
    oscThock.stop(t + 0.052);
  }, []);

  // -------------------------------------------------------------------------
  // playDelete — mechanical backspace / delete key sound
  // Emulates a stabilized 2u keycap with a heavier, deeper hollow clack
  // and distinct stabilizer snap.
  // -------------------------------------------------------------------------
  const playDelete = useCallback(() => {
    if (!enabledRef.current) return;
    const nodes = getAudioNodes();
    if (!nodes) return;
    const { ctx, destination } = nodes;

    const t = ctx.currentTime;

    // 1. Stabilizer wire tick / sharp mechanical transient
    const oscSnap = ctx.createOscillator();
    const gainSnap = ctx.createGain();
    oscSnap.type = "triangle";
    oscSnap.frequency.setValueAtTime(1900, t);
    oscSnap.frequency.exponentialRampToValueAtTime(420, t + 0.022);

    gainSnap.gain.setValueAtTime(0.55, t);
    gainSnap.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

    oscSnap.connect(gainSnap);
    gainSnap.connect(destination);
    oscSnap.start(t);
    oscSnap.stop(t + 0.028);

    // 2. Heavy hollow keycap clack
    const oscBody = ctx.createOscillator();
    const gainBody = ctx.createGain();
    oscBody.type = "triangle";
    oscBody.frequency.setValueAtTime(540, t);
    oscBody.frequency.exponentialRampToValueAtTime(160, t + 0.045);

    gainBody.gain.setValueAtTime(0.50, t);
    gainBody.gain.exponentialRampToValueAtTime(0.001, t + 0.048);

    oscBody.connect(gainBody);
    gainBody.connect(destination);
    oscBody.start(t);
    oscBody.stop(t + 0.052);

    // 3. Deeper chassis thud
    const oscThud = ctx.createOscillator();
    const gainThud = ctx.createGain();
    oscThud.type = "sine";
    oscThud.frequency.setValueAtTime(160, t);
    oscThud.frequency.exponentialRampToValueAtTime(65, t + 0.06);

    gainThud.gain.setValueAtTime(0.42, t);
    gainThud.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

    oscThud.connect(gainThud);
    gainThud.connect(destination);
    oscThud.start(t);
    oscThud.stop(t + 0.07);
  }, []);

  // -------------------------------------------------------------------------
  // playError — distinct audible discordant mechanical error keystroke
  // Produces a punchy warning buzz + mechanical strike that cuts through clearly
  // -------------------------------------------------------------------------
  const playError = useCallback(() => {
    if (!enabledRef.current) return;
    const nodes = getAudioNodes();
    if (!nodes) return;
    const { ctx, destination } = nodes;

    const t = ctx.currentTime;

    // 1. Sharp mechanical strike transient
    const oscClick = ctx.createOscillator();
    const gainClick = ctx.createGain();
    oscClick.type = "triangle";
    oscClick.frequency.setValueAtTime(1500, t);
    oscClick.frequency.exponentialRampToValueAtTime(300, t + 0.03);

    gainClick.gain.setValueAtTime(0.48, t);
    gainClick.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

    oscClick.connect(gainClick);
    gainClick.connect(destination);
    oscClick.start(t);
    oscClick.stop(t + 0.038);

    // 2. Dissonant dual-tone chord (minor 2nd interval: 185 Hz & 196 Hz)
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(850, t);

    const oscDissonant1 = ctx.createOscillator();
    const oscDissonant2 = ctx.createOscillator();
    const gainDissonant = ctx.createGain();

    oscDissonant1.type = "sawtooth";
    oscDissonant1.frequency.setValueAtTime(185, t);
    oscDissonant1.frequency.exponentialRampToValueAtTime(75, t + 0.11);

    oscDissonant2.type = "sawtooth";
    oscDissonant2.frequency.setValueAtTime(196, t);
    oscDissonant2.frequency.exponentialRampToValueAtTime(80, t + 0.11);

    gainDissonant.gain.setValueAtTime(0.46, t);
    gainDissonant.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    oscDissonant1.connect(filter);
    oscDissonant2.connect(filter);
    filter.connect(gainDissonant);
    gainDissonant.connect(destination);

    oscDissonant1.start(t);
    oscDissonant2.start(t);
    oscDissonant1.stop(t + 0.13);
    oscDissonant2.stop(t + 0.13);
  }, []);

  // -------------------------------------------------------------------------
  // playWordComplete — affirmative chime & spacebar thock on word completion
  // -------------------------------------------------------------------------
  const playWordComplete = useCallback(() => {
    if (!enabledRef.current) return;
    const nodes = getAudioNodes();
    if (!nodes) return;
    const { ctx, destination } = nodes;

    const t = ctx.currentTime;

    // Spacebar thock
    const oscThock = ctx.createOscillator();
    const gainThock = ctx.createGain();
    oscThock.type = "sine";
    oscThock.frequency.setValueAtTime(170, t);
    oscThock.frequency.exponentialRampToValueAtTime(75, t + 0.045);

    gainThock.gain.setValueAtTime(0.38, t);
    gainThock.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    oscThock.connect(gainThock);
    gainThock.connect(destination);
    oscThock.start(t);
    oscThock.stop(t + 0.052);

    // Harmonic affirmative chime
    const oscChime = ctx.createOscillator();
    const gainChime = ctx.createGain();
    oscChime.type = "sine";
    oscChime.frequency.setValueAtTime(880, t);
    oscChime.frequency.exponentialRampToValueAtTime(1320, t + 0.06);

    gainChime.gain.setValueAtTime(0.30, t);
    gainChime.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    oscChime.connect(gainChime);
    gainChime.connect(destination);
    oscChime.start(t);
    oscChime.stop(t + 0.085);
  }, []);

  return {
    soundEnabled,
    toggleSound,
    playClick,
    playDelete,
    playError,
    playWordComplete,
  };
}
