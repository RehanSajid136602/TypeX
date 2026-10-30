"use client";

import React, { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { AnimatePresence } from "framer-motion";
import {
  TestMode,
  TimeOption,
  WordsOption,
  DictionaryTier,
  DICTIONARY_TIERS,
  ErrorBehavior,
  ThemeName,
  TelemetryResult,
  LearnTrack,
  MasteryDeltaReport,
  MasteryStatus,
  LineCountOption,
} from "@/types/typing";
import { Header } from "@/components/Header";
import { ConfigBar } from "@/components/ConfigBar";
import { TypingArena } from "@/components/TypingArena";
import { ResultsCard } from "@/components/ResultsCard";
import { MasteryStrip } from "@/components/MasteryStrip";
import { KeyboardHUD } from "@/components/KeyboardHUD";
import { MasteryDeltaView } from "@/components/MasteryDeltaView";
import { Footer } from "@/components/Footer";
import { authenticatedFetch } from "@/utils/apiSecurity";
import { useSoundEngine } from "@/hooks/useSoundEngine";
import { useProfile } from "@/context/ProfileContext";
import { FirstRunModal } from "@/components/FirstRunModal";

// ── Persisted dictionary tier ────────────────────────────────────────────────
// localStorage is an external store, so it is read through useSyncExternalStore
// rather than a hydration-time useState initializer: the server snapshot stays
// "english_1k" and React re-reads the stored value after hydration, which avoids
// a hydration mismatch on the active tier pill.
const TIER_STORAGE_KEY = "typex_tier";

const isDictionaryTier = (value: string | null): value is DictionaryTier =>
  value !== null && (DICTIONARY_TIERS as readonly string[]).includes(value);

const tierListeners = new Set<() => void>();

const subscribeTier = (onChange: () => void) => {
  tierListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    tierListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
};

const getTierSnapshot = (): DictionaryTier => {
  try {
    const stored = localStorage.getItem(TIER_STORAGE_KEY);
    if (isDictionaryTier(stored)) return stored;
  } catch {
    // localStorage can be unavailable (private mode / blocked storage)
  }
  return "english_1k";
};

const getServerTierSnapshot = (): DictionaryTier => "english_1k";

const persistTier = (next: DictionaryTier) => {
  try {
    localStorage.setItem(TIER_STORAGE_KEY, next);
  } catch {
    // non-fatal: the choice simply will not be remembered
  }
  tierListeners.forEach((listener) => listener());
};

// Mastery profile loader, shared by the mount effect and the manual refreshes.
// Kept outside the component so callers do not need it in their dependency lists.
async function requestMasteryStatus(signal?: AbortSignal): Promise<MasteryStatus | null> {
  try {
    const res = await fetch("/api/learn/status", { signal });
    if (!res.ok) return null;
    return (await res.json()) as MasteryStatus;
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "AbortError")) {
      console.warn("Could not fetch mastery status", err);
    }
    return null;
  }
}

export default function Home() {
  const [theme, setTheme] = useState<ThemeName>("obsidian");
  const [mode, setMode] = useState<TestMode>("time");
  const [timeOption, setTimeOption] = useState<TimeOption>(30);
  const [wordsOption, setWordsOption] = useState<WordsOption>(50);
  const [lineCount, setLineCount] = useState<LineCountOption>(() => {
    if (typeof window === "undefined") return 3;
    const saved = localStorage.getItem("typex_line_count");
    if (saved === "2" || saved === "3" || saved === "4") {
      return parseInt(saved, 10) as LineCountOption;
    }
    return 3;
  });
  const tier = useSyncExternalStore(subscribeTier, getTierSnapshot, getServerTierSnapshot);
  const [errorBehavior, setErrorBehavior] = useState<ErrorBehavior>("free");
  const [sessionNonce, setSessionNonce] = useState<number>(0);

  const triggerFreshSession = useCallback(() => {
    setSessionNonce((n) => n + 1);
    setTestResults(null);
    setMasteryDelta(null);
    setErrorSeconds([]);
    setIsFocusMode(false);
  }, []);

  const handleLineCountChange = useCallback((lines: LineCountOption) => {
    setLineCount(lines);
    if (typeof window !== "undefined") {
      localStorage.setItem("typex_line_count", lines.toString());
    }
  }, []);

  // Phase 1-4: Neuro-Motor Mastery Engine states
  const [learnTrack, setLearnTrack] = useState<LearnTrack>("phonetic_unlock");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [showKeyboard, setShowKeyboard] = useState<boolean>(true);
  const [masteryStatus, setMasteryStatus] = useState<MasteryStatus | null>(null);
  const [masteryDelta, setMasteryDelta] = useState<MasteryDeltaReport | null>(null);
  const [nextChar, setNextChar] = useState<string>("");
  const [prevChar, setPrevChar] = useState<string>("");
  const [isHeatmapMode, setIsHeatmapMode] = useState<boolean>(false);

  const [testResults, setTestResults] = useState<TelemetryResult | null>(null);
  const [errorSeconds, setErrorSeconds] = useState<number[]>([]);

  // Focus mode states
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);
  const [isMouseActive, setIsMouseActive] = useState<boolean>(false);
  const mouseTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sound engine
  const { soundEnabled, toggleSound, playClick, playError, playWordComplete } = useSoundEngine();

  // Apply theme class to document body
  useEffect(() => {
    document.body.classList.remove("theme-obsidian", "theme-tokyo", "theme-nordic");
    document.body.classList.add(`theme-${theme}`);
  }, [theme]);

  // Selecting a tier also persists it for the next session
  const handleTierChange = useCallback((next: DictionaryTier) => {
    persistTier(next);
    setIsFocusMode(false);
  }, []);

  // Refresh the Mastery Profile from the C++ backend on demand
  const fetchMasteryStatus = useCallback(async () => {
    const data = await requestMasteryStatus();
    if (data) setMasteryStatus(data);
  }, []);

  // Initial load. The state update lands in a promise callback instead of
  // synchronously inside the effect body, and the request is aborted on unmount.
  useEffect(() => {
    const controller = new AbortController();
    requestMasteryStatus(controller.signal).then((data) => {
      if (data && !controller.signal.aborted) setMasteryStatus(data);
    });
    return () => controller.abort();
  }, []);

  // Mouse activity listener for Focus Mode reveal
  useEffect(() => {
    const handleMouseMove = () => {
      setIsMouseActive(true);
      if (mouseTimerRef.current) {
        clearTimeout(mouseTimerRef.current);
      }
      mouseTimerRef.current = setTimeout(() => {
        setIsMouseActive(false);
      }, 1500);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (mouseTimerRef.current) clearTimeout(mouseTimerRef.current);
    };
  }, []);

  const { activeProfile, isGuest, firstRunNeeded, createProfile, setGuestMode } = useProfile();
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleTestFinish = useCallback(async (results: TelemetryResult, errors: number[]) => {
    setTestResults(results);
    setErrorSeconds(errors);
    setIsFocusMode(false);

    // Save test if an active profile exists and not guest mode
    if (!isGuest && activeProfile) {
      try {
        const payload = {
          profileId: activeProfile.id,
          mode: mode,
          config: JSON.stringify({
            duration: timeOption,
            words: wordsOption,
            tier: tier,
            errorBehavior: errorBehavior,
            learnTrack: mode === "learn" ? learnTrack : undefined,
          }),
          durationMs: Math.round(results.durationSeconds * 1000),
          netWpm: results.netWpm,
          rawWpm: results.rawWpm,
          accuracy: results.accuracy,
          consistency: results.consistency,
          correctChars: results.correctChars,
          incorrectChars: results.incorrectChars,
          extraChars: results.extraChars,
          uncorrectedErrors: results.uncorrectedErrors,
          correctedErrors: results.correctedErrors || 0,
          totalKeystrokes: results.totalKeystrokes,
          perSecondWpm: results.perSecondWpm || [],
          keystrokesLog: results.keystrokesLog || [],
          wordResults: results.wordResults || [],
          startedAt: results.startedAt || (Date.now() - Math.round(results.durationSeconds * 1000)),
          tzOffsetMin: new Date().getTimezoneOffset(),
        };

        const res = await authenticatedFetch("/api/accounts/tests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          // retry once after 1 second in background
          setTimeout(async () => {
            try {
              const retryRes = await authenticatedFetch("/api/accounts/tests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              if (!retryRes.ok) {
                setSaveError("Failed to save test result to profile");
              }
            } catch {
              setSaveError("Failed to save test result to profile");
            }
          }, 1000);
        } else {
          setSaveError(null);
        }
      } catch {
        setSaveError("Failed to save test result to profile");
      }
    }
  }, [activeProfile, isGuest, mode, timeOption, wordsOption, tier, errorBehavior, learnTrack]);

  const handleLearnFinish = useCallback((delta: MasteryDeltaReport) => {
    setMasteryDelta(delta);
    setIsFocusMode(false);
    fetchMasteryStatus();
  }, [fetchMasteryStatus]);

  const handleRestart = useCallback(() => {
    setSessionNonce((n) => n + 1);
    setTestResults(null);
    setMasteryDelta(null);
    setErrorSeconds([]);
    setIsFocusMode(false);
    fetchMasteryStatus();
  }, [fetchMasteryStatus]);

  const handleActivity = useCallback(() => {
    setIsMouseActive(false);
  }, []);

  const showFocusFade = isFocusMode && !isMouseActive && !testResults && !masteryDelta;

  return (
    <main className="min-h-screen flex flex-col justify-between relative bg-[var(--bg-color)] transition-colors duration-300">
      {/* Top Header */}
      <Header
        theme={theme}
        onThemeChange={setTheme}
        isFocusMode={showFocusFade}
        soundEnabled={soundEnabled}
        onSoundToggle={toggleSound}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col justify-center items-center py-6 w-full z-10">
        <AnimatePresence mode="wait">
          {masteryDelta ? (
            <MasteryDeltaView
              key="mastery-delta-view"
              delta={masteryDelta}
              fingerStats={masteryStatus?.fingerStats}
              onContinue={handleRestart}
            />
          ) : testResults ? (
            <ResultsCard
              key="results-view"
              results={testResults}
              mode={mode}
              timeOption={timeOption}
              wordsOption={wordsOption}
              tier={tier}
              errorSeconds={errorSeconds}
              onRestart={handleRestart}
            />
          ) : (
            <div key="typing-session" className="w-full flex flex-col items-center">
              <ConfigBar
                mode={mode}
                timeOption={timeOption}
                wordsOption={wordsOption}
                tier={tier}
                errorBehavior={errorBehavior}
                learnTrack={learnTrack}
                lineCount={lineCount}
                showKeyboard={showKeyboard}
                isFocusMode={showFocusFade}
                onModeChange={(m) => {
                  setMode(m);
                  triggerFreshSession();
                }}
                onTimeOptionChange={(t) => {
                  setTimeOption(t);
                  triggerFreshSession();
                }}
                onWordsOptionChange={(w) => {
                  setWordsOption(w);
                  triggerFreshSession();
                }}
                onTierChange={(t) => {
                  handleTierChange(t);
                  triggerFreshSession();
                }}
                onErrorBehaviorChange={setErrorBehavior}
                onLearnTrackChange={(t) => {
                  setLearnTrack(t);
                  triggerFreshSession();
                }}
                onLineCountChange={handleLineCountChange}
                onToggleKeyboard={() => setShowKeyboard((prev) => !prev)}
              />

              {mode === "learn" && (
                <MasteryStrip
                  keyStatuses={masteryStatus?.keyStatuses || []}
                  activeTarget={masteryStatus?.trackActiveTarget?.[learnTrack] || "s"}
                  focusKey={focusKey}
                  onSelectFocusKey={(k) => {
                    setFocusKey((prev) => (prev === k ? null : k));
                    handleRestart();
                  }}
                  isFocusMode={showFocusFade}
                />
              )}

              <TypingArena
                // Remounting on a configuration change resets every counter in
                // the arena, which is the React-recommended alternative to
                // calling a state-resetting function from an effect.
                key={`arena-${sessionNonce}-${mode}-${timeOption}-${wordsOption}-${tier}-${learnTrack}-${focusKey ?? "auto"}-${lineCount}`}
                mode={mode}
                timeOption={timeOption}
                wordsOption={wordsOption}
                lineCount={lineCount}
                tier={tier}
                errorBehavior={errorBehavior}
                learnTrack={learnTrack}
                focusKey={focusKey}
                onLearnFinish={handleLearnFinish}
                onFinish={handleTestFinish}
                onActivity={handleActivity}
                isFocusMode={showFocusFade}
                setIsFocusMode={setIsFocusMode}
                onKeyClick={playClick}
                onKeyError={playError}
                onWordComplete={playWordComplete}
                onNextCharChange={(nc, pc) => {
                  setNextChar(nc);
                  setPrevChar(pc);
                }}
              />

              <KeyboardHUD
                targetChar={nextChar}
                prevChar={prevChar}
                keyStatuses={masteryStatus?.keyStatuses}
                isHeatmapMode={isHeatmapMode}
                onToggleHeatmap={() => setIsHeatmapMode((prev) => !prev)}
                visible={showKeyboard || mode === "learn"}
              />
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Save Error notice */}
      {saveError && (
        <div className="fixed bottom-16 right-6 z-50 bg-red-500/20 border border-red-500/40 text-red-300 px-4 py-2 rounded-lg text-xs backdrop-blur-md shadow-xl flex items-center gap-2">
          <span>⚠️ {saveError}</span>
          <button onClick={() => setSaveError(null)} className="text-red-400 hover:text-white font-bold ml-2">✕</button>
        </div>
      )}

      {/* First Run Modal */}
      <FirstRunModal
        isOpen={firstRunNeeded}
        onClose={() => {}}
      />
    </main>
  );
}
