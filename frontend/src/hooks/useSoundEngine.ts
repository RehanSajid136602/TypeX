"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// TypeX Sound FX Engine — Pure Web Audio API, Zero Dependencies
// Switch Profiles: Clicky | Thocky | Soft
// Continuous Volume Slider: 0 - 100 (0 = Muted)
// ---------------------------------------------------------------------------

export type SwitchProfile = "clicky" | "thocky" | "soft";

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
    const vol = getVolumeSnapshot();
    masterGain.gain.setValueAtTime(vol / 100, sharedAudioCtx.currentTime);

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
// External Stores for Volume and Profile
// ---------------------------------------------------------------------------

const VOLUME_STORAGE_KEY = "typex_volume";
const PROFILE_STORAGE_KEY = "typex_sound_profile";

let volumeMemoryFallback = 80;
let profileMemoryFallback: SwitchProfile = "clicky";

const soundListeners = new Set<() => void>();

const subscribeSound = (onChange: () => void) => {
  soundListeners.add(onChange);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onChange);
  }
  return () => {
    soundListeners.delete(onChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onChange);
    }
  };
};

export const getVolumeSnapshot = (): number => {
  if (typeof window === "undefined") return 80;
  try {
    const stored = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (stored !== null) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) return parsed;
    }
    // Backward compatibility with typex_sound bool flag
    const legacySound = localStorage.getItem("typex_sound");
    if (legacySound === "false") return 0;
  } catch {
    // fall through
  }
  return volumeMemoryFallback;
};

export const getProfileSnapshot = (): SwitchProfile => {
  if (typeof window === "undefined") return "clicky";
  try {
    const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (stored === "clicky" || stored === "thocky" || stored === "soft") {
      return stored as SwitchProfile;
    }
  } catch {
    // fall through
  }
  return profileMemoryFallback;
};

const getVolumeServerSnapshot = (): number => 80;
const getProfileServerSnapshot = (): SwitchProfile => "clicky";

export const setSoundVolume = (vol: number) => {
  const clamped = Math.max(0, Math.min(100, Math.round(vol)));
  volumeMemoryFallback = clamped;
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, clamped.toString());
    localStorage.setItem("typex_sound", clamped > 0 ? "true" : "false");
  } catch {}

  if (masterGain && sharedAudioCtx && sharedAudioCtx.state !== "closed") {
    masterGain.gain.setValueAtTime(clamped / 100, sharedAudioCtx.currentTime);
  }

  soundListeners.forEach((l) => l());
};

export const setSwitchProfile = (profile: SwitchProfile) => {
  profileMemoryFallback = profile;
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, profile);
  } catch {}
  soundListeners.forEach((l) => l());
};

export function useSoundEngine() {
  const volume = useSyncExternalStore(
    subscribeSound,
    getVolumeSnapshot,
    getVolumeServerSnapshot
  );

  const switchProfile = useSyncExternalStore(
    subscribeSound,
    getProfileSnapshot,
    getProfileServerSnapshot
  );

  const soundEnabled = volume > 0;
  const volumeRef = useRef(volume);
  const profileRef = useRef(switchProfile);

  useEffect(() => {
    volumeRef.current = volume;
    if (masterGain && sharedAudioCtx && sharedAudioCtx.state !== "closed") {
      masterGain.gain.setValueAtTime(volume / 100, sharedAudioCtx.currentTime);
    }
  }, [volume]);

  useEffect(() => {
    profileRef.current = switchProfile;
  }, [switchProfile]);

  const toggleSound = useCallback(() => {
    if (volumeRef.current > 0) {
      setSoundVolume(0);
    } else {
      setSoundVolume(80);
    }
  }, []);

  // -------------------------------------------------------------------------
  // playClick — parameter presets for Clicky / Thocky / Soft mechanical switches
  // -------------------------------------------------------------------------
  const playClick = useCallback((profileOverride?: SwitchProfile) => {
    const currentVol = volumeRef.current;
    if (currentVol <= 0) return;
    const nodes = getAudioNodes();
    if (!nodes) return;
    const { ctx, destination } = nodes;

    const t = ctx.currentTime;
    const jitter = 1 + (Math.random() - 0.5) * 0.12;
    const profile = profileOverride || profileRef.current;

    if (profile === "clicky") {
      // 1. Crisp switch leaf snap
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

      // 2. Housing clack
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

      // 3. Solid bottom-out thock
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
    } else if (profile === "thocky") {
      // 1. Muffled tactile transient
      const oscClick = ctx.createOscillator();
      const gainClick = ctx.createGain();
      oscClick.type = "triangle";
      oscClick.frequency.setValueAtTime(1200 * jitter, t);
      oscClick.frequency.exponentialRampToValueAtTime(380, t + 0.018);

      gainClick.gain.setValueAtTime(0.30, t);
      gainClick.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

      oscClick.connect(gainClick);
      gainClick.connect(destination);
      oscClick.start(t);
      oscClick.stop(t + 0.022);

      // 2. Deep body resonance
      const oscClack = ctx.createOscillator();
      const gainClack = ctx.createGain();
      oscClack.type = "sine";
      oscClack.frequency.setValueAtTime(460 * jitter, t);
      oscClack.frequency.exponentialRampToValueAtTime(180, t + 0.035);

      gainClack.gain.setValueAtTime(0.55, t);
      gainClack.gain.exponentialRampToValueAtTime(0.001, t + 0.038);

      oscClack.connect(gainClack);
      gainClack.connect(destination);
      oscClack.start(t);
      oscClack.stop(t + 0.04);

      // 3. Heavy lubricated bottom-out thock
      const oscThock = ctx.createOscillator();
      const gainThock = ctx.createGain();
      oscThock.type = "sine";
      oscThock.frequency.setValueAtTime(190 * jitter, t);
      oscThock.frequency.exponentialRampToValueAtTime(70, t + 0.058);

      gainThock.gain.setValueAtTime(0.65, t);
      gainThock.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

      oscThock.connect(gainThock);
      gainThock.connect(destination);
      oscThock.start(t);
      oscThock.stop(t + 0.065);
    } else {
      // profile === "soft" (Silent / dampened switch)
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(750, t);
      filter.connect(destination);

      // 1. Soft transient pop
      const oscClick = ctx.createOscillator();
      const gainClick = ctx.createGain();
      oscClick.type = "triangle";
      oscClick.frequency.setValueAtTime(600 * jitter, t);
      oscClick.frequency.exponentialRampToValueAtTime(200, t + 0.025);

      gainClick.gain.setValueAtTime(0.28, t);
      gainClick.gain.exponentialRampToValueAtTime(0.001, t + 0.028);

      oscClick.connect(gainClick);
      gainClick.connect(filter);
      oscClick.start(t);
      oscClick.stop(t + 0.03);

      // 2. Muted bottom-out pad
      const oscThock = ctx.createOscillator();
      const gainThock = ctx.createGain();
      oscThock.type = "sine";
      oscThock.frequency.setValueAtTime(140 * jitter, t);
      oscThock.frequency.exponentialRampToValueAtTime(55, t + 0.04);

      gainThock.gain.setValueAtTime(0.25, t);
      gainThock.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

      oscThock.connect(gainThock);
      gainThock.connect(filter);
      oscThock.start(t);
      oscThock.stop(t + 0.048);
    }
  }, []);

  // -------------------------------------------------------------------------
  // playSampleStroke — Audition keystroke when selecting a profile
  // -------------------------------------------------------------------------
  const playSampleStroke = useCallback((profile: SwitchProfile) => {
    const nodes = getAudioNodes();
    if (!nodes) return;
    const { ctx, destination } = nodes;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const t = ctx.currentTime;
    const currentVol = volumeRef.current;
    // If volume is muted or 0, audition with gentle default gain so user hears the switch character
    const effectiveGain = currentVol > 0 ? currentVol / 100 : 0.6;

    const sampleGain = ctx.createGain();
    sampleGain.gain.setValueAtTime(effectiveGain, t);
    sampleGain.connect(destination);

    // Call synthesis directly into sampleGain
    if (profile === "clicky") {
      const oscClick = ctx.createOscillator();
      const gainClick = ctx.createGain();
      oscClick.type = "triangle";
      oscClick.frequency.setValueAtTime(2600, t);
      oscClick.frequency.exponentialRampToValueAtTime(650, t + 0.02);
      gainClick.gain.setValueAtTime(0.55, t);
      gainClick.gain.exponentialRampToValueAtTime(0.001, t + 0.024);
      oscClick.connect(gainClick);
      gainClick.connect(sampleGain);
      oscClick.start(t);
      oscClick.stop(t + 0.026);

      const oscClack = ctx.createOscillator();
      const gainClack = ctx.createGain();
      oscClack.type = "triangle";
      oscClack.frequency.setValueAtTime(780, t);
      oscClack.frequency.exponentialRampToValueAtTime(290, t + 0.035);
      gainClack.gain.setValueAtTime(0.45, t);
      gainClack.gain.exponentialRampToValueAtTime(0.001, t + 0.038);
      oscClack.connect(gainClack);
      gainClack.connect(sampleGain);
      oscClack.start(t);
      oscClack.stop(t + 0.04);
    } else if (profile === "thocky") {
      const oscClick = ctx.createOscillator();
      const gainClick = ctx.createGain();
      oscClick.type = "triangle";
      oscClick.frequency.setValueAtTime(1200, t);
      oscClick.frequency.exponentialRampToValueAtTime(380, t + 0.018);
      gainClick.gain.setValueAtTime(0.30, t);
      gainClick.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
      oscClick.connect(gainClick);
      gainClick.connect(sampleGain);
      oscClick.start(t);
      oscClick.stop(t + 0.022);

      const oscThock = ctx.createOscillator();
      const gainThock = ctx.createGain();
      oscThock.type = "sine";
      oscThock.frequency.setValueAtTime(190, t);
      oscThock.frequency.exponentialRampToValueAtTime(70, t + 0.058);
      gainThock.gain.setValueAtTime(0.65, t);
      gainThock.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      oscThock.connect(gainThock);
      gainThock.connect(sampleGain);
      oscThock.start(t);
      oscThock.stop(t + 0.065);
    } else {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(750, t);
      filter.connect(sampleGain);

      const oscClick = ctx.createOscillator();
      const gainClick = ctx.createGain();
      oscClick.type = "triangle";
      oscClick.frequency.setValueAtTime(600, t);
      oscClick.frequency.exponentialRampToValueAtTime(200, t + 0.025);
      gainClick.gain.setValueAtTime(0.28, t);
      gainClick.gain.exponentialRampToValueAtTime(0.001, t + 0.028);
      oscClick.connect(gainClick);
      gainClick.connect(filter);
      oscClick.start(t);
      oscClick.stop(t + 0.03);

      const oscThock = ctx.createOscillator();
      const gainThock = ctx.createGain();
      oscThock.type = "sine";
      oscThock.frequency.setValueAtTime(140, t);
      oscThock.frequency.exponentialRampToValueAtTime(55, t + 0.04);
      gainThock.gain.setValueAtTime(0.25, t);
      gainThock.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      oscThock.connect(gainThock);
      gainThock.connect(filter);
      oscThock.start(t);
      oscThock.stop(t + 0.048);
    }
  }, []);

  // -------------------------------------------------------------------------
  // playDelete — mechanical backspace
  // -------------------------------------------------------------------------
  const playDelete = useCallback(() => {
    if (volumeRef.current <= 0) return;
    const nodes = getAudioNodes();
    if (!nodes) return;
    const { ctx, destination } = nodes;

    const t = ctx.currentTime;
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
  }, []);

  // -------------------------------------------------------------------------
  // playError — distinct discordant warning strike
  // -------------------------------------------------------------------------
  const playError = useCallback(() => {
    if (volumeRef.current <= 0) return;
    const nodes = getAudioNodes();
    if (!nodes) return;
    const { ctx, destination } = nodes;

    const t = ctx.currentTime;

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

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(850, t);

    const oscD1 = ctx.createOscillator();
    const oscD2 = ctx.createOscillator();
    const gainD = ctx.createGain();

    oscD1.type = "sawtooth";
    oscD1.frequency.setValueAtTime(185, t);
    oscD1.frequency.exponentialRampToValueAtTime(75, t + 0.11);

    oscD2.type = "sawtooth";
    oscD2.frequency.setValueAtTime(196, t);
    oscD2.frequency.exponentialRampToValueAtTime(80, t + 0.11);

    gainD.gain.setValueAtTime(0.46, t);
    gainD.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    oscD1.connect(filter);
    oscD2.connect(filter);
    filter.connect(gainD);
    gainD.connect(destination);

    oscD1.start(t);
    oscD2.start(t);
    oscD1.stop(t + 0.13);
    oscD2.stop(t + 0.13);
  }, []);

  // -------------------------------------------------------------------------
  // playWordComplete — affirmative chime on word completion
  // -------------------------------------------------------------------------
  const playWordComplete = useCallback(() => {
    if (volumeRef.current <= 0) return;
    const nodes = getAudioNodes();
    if (!nodes) return;
    const { ctx, destination } = nodes;

    const t = ctx.currentTime;

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
    volume,
    switchProfile,
    setVolume: setSoundVolume,
    setSwitchProfile,
    toggleSound,
    playClick,
    playSampleStroke,
    playDelete,
    playError,
    playWordComplete,
  };
}
