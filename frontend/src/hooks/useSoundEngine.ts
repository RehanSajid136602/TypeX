"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// TypeX Sound FX Engine — Pure Web Audio API, Zero Dependencies
// ---------------------------------------------------------------------------

let sharedAudioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) return null;
    sharedAudioCtx = new AudioCtxClass();
  }
  // Resume suspended context (browsers require resumption on user interaction)
  if (sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
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
  // Produces a crisp, satisfying switch click audible on laptop speakers
  // -------------------------------------------------------------------------
  const playClick = useCallback(() => {
    if (!enabledRef.current) return;
    const ctx = getAudioCtx();
    if (!ctx) return;

    const t = ctx.currentTime;

    // High transient switch click (crisp pop)
    const oscHigh = ctx.createOscillator();
    const gainHigh = ctx.createGain();
    oscHigh.type = "triangle";
    oscHigh.frequency.setValueAtTime(1400, t);
    oscHigh.frequency.exponentialRampToValueAtTime(450, t + 0.025);

    gainHigh.gain.setValueAtTime(0.18, t);
    gainHigh.gain.exponentialRampToValueAtTime(0.001, t + 0.028);

    oscHigh.connect(gainHigh);
    gainHigh.connect(ctx.destination);
    oscHigh.start(t);
    oscHigh.stop(t + 0.03);

    // Warm bottom-out thock
    const oscLow = ctx.createOscillator();
    const gainLow = ctx.createGain();
    oscLow.type = "sine";
    oscLow.frequency.setValueAtTime(320, t);
    oscLow.frequency.exponentialRampToValueAtTime(110, t + 0.035);

    gainLow.gain.setValueAtTime(0.12, t);
    gainLow.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    oscLow.connect(gainLow);
    gainLow.connect(ctx.destination);
    oscLow.start(t);
    oscLow.stop(t + 0.045);
  }, []);

  // -------------------------------------------------------------------------
  // playError — low dull thud for mistyped characters
  // -------------------------------------------------------------------------
  const playError = useCallback(() => {
    if (!enabledRef.current) return;
    const ctx = getAudioCtx();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.1);

    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.13);
  }, []);

  // -------------------------------------------------------------------------
  // playSuccess — subtle affirmative chime on word completion
  // -------------------------------------------------------------------------
  const playWordComplete = useCallback(() => {
    if (!enabledRef.current) return;
    const ctx = getAudioCtx();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.05);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  }, []);

  return { soundEnabled, toggleSound, playClick, playError, playWordComplete };
}
