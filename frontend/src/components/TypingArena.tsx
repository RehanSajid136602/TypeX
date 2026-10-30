"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TestMode,
  TimeOption,
  WordsOption,
  DictionaryTier,
  ErrorBehavior,
  TelemetryPayload,
  TelemetryResult,
  WordResult,
  LearnTrack,
  LearnKeystroke,
  MasteryDeltaReport,
  LineCountOption,
} from "@/types/typing";
import { RotateCcw, MousePointerClick } from "lucide-react";
import { LiveSparkline } from "./LiveSparkline";

import { sampleClientWords } from "@/utils/monkeytypeWordlists";

interface WordBatch {
  words: string[];
  activeTarget?: string;
}

// Word source for the arena. Kept outside the component so effects can await it
// and apply the result inside a promise callback, rather than dispatching state
// synchronously from the effect body.
async function requestWordBatch(params: {
  mode: TestMode;
  tier: DictionaryTier;
  learnTrack?: LearnTrack;
  focusKey?: string | null;
  count: number;
  recent?: string[];
}): Promise<WordBatch> {
  const { mode, tier, learnTrack, focusKey, count, recent } = params;

  try {
    if (mode === "learn") {
      const url = `/api/learn/lesson?track=${learnTrack || "phonetic_unlock"}&count=25${
        focusKey ? `&focusKey=${encodeURIComponent(focusKey)}` : ""
      }&_t=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("Learn API error");
      const data = await res.json();
      if (data && Array.isArray(data.words) && data.words.length > 0) {
        return { words: data.words, activeTarget: data.activeTarget || "s" };
      }
    }

    const recentParam = recent && recent.length > 0 ? `&excludeRecent=${encodeURIComponent(recent.join(","))}` : "";
    const res = await fetch(`/api/words?tier=${tier}&count=${count}${recentParam}&_t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    if (data && Array.isArray(data.words) && data.words.length > 0) {
      return { words: data.words };
    }
  } catch (err) {
    console.warn("Backend /api/words unavailable, sampling authentic client-side corpus:", err);
  }

  // Fallback to client-side authentic Monkeytype words with rank-decay and zero repeats
  return {
    words: sampleClientWords(tier, count, recent),
  };
}

// Memoized individual word component for 0 layout shift and maximum typing performance
interface WordElementProps {
  word: string;
  wIdx: number;
  isCurrent: boolean;
  isPast: boolean;
  typedVal: string;
}

export const WordElement = React.memo<WordElementProps>(
  ({ word, wIdx, isCurrent, isPast, typedVal }) => {
    return (
      <div
        data-word-idx={wIdx}
        className="relative flex items-center whitespace-nowrap"
      >
        {/* Target word characters */}
        {word.split("").map((targetChar, cIdx) => {
          let charStyle: React.CSSProperties = {
            color: "var(--untyped-color)",
            opacity: "var(--untyped-opacity, 0.65)" as unknown as number,
          };
          let borderClass = "";

          if (isCurrent && cIdx >= typedVal.length) {
            charStyle = {
              color: "var(--untyped-active, var(--untyped-color))",
              opacity: 0.90,
            };
          }

          if (isPast && cIdx >= typedVal.length) {
            charStyle = {
              color: "var(--untyped-color)",
              opacity: 0.45,
            };
          }

          if (cIdx < typedVal.length) {
            const typedChar = typedVal[cIdx];
            if (typedChar === targetChar) {
              charStyle = {
                color: "var(--typed-color)",
                opacity: 1.0,
              };
            } else {
              charStyle = {
                color: "var(--error-color)",
                opacity: 1.0,
              };
              borderClass = "border-b-[2px] border-[var(--error-color)] pb-[1px]";
            }
          }

          return (
            <span
              key={cIdx}
              data-char-idx={cIdx}
              style={charStyle}
              className={`inline-block transition-colors duration-75 ${borderClass}`}
            >
              {targetChar}
            </span>
          );
        })}

        {/* Extra characters typed beyond word length */}
        {typedVal.length > word.length &&
          typedVal
            .slice(word.length)
            .split("")
            .map((extraChar, eIdx) => (
              <span
                key={`extra-${eIdx}`}
                data-char-idx={word.length + eIdx}
                style={{ color: "var(--error-color)", opacity: 0.8 }}
                className="inline-block border-b-[2px] border-[var(--error-color)] pb-[1px]"
              >
                {extraChar}
              </span>
            ))}
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.word === next.word &&
      prev.isCurrent === next.isCurrent &&
      prev.isPast === next.isPast &&
      prev.typedVal === next.typedVal
    );
  }
);
WordElement.displayName = "WordElement";

interface TypingArenaProps {
  mode: TestMode;
  timeOption: TimeOption;
  wordsOption: WordsOption;
  lineCount?: LineCountOption;
  tier: DictionaryTier;
  errorBehavior: ErrorBehavior;
  learnTrack?: LearnTrack;
  focusKey?: string | null;
  onLearnFinish?: (delta: MasteryDeltaReport) => void;
  onFinish: (result: TelemetryResult, errorSeconds: number[]) => void;
  onActivity: () => void;
  isFocusMode: boolean;
  setIsFocusMode: (val: boolean) => void;
  // Sound FX callbacks
  onKeyClick: () => void;
  onKeyError: () => void;
  onWordComplete: () => void;
  onNextCharChange?: (nextChar: string, prevChar: string) => void;
}

export const TypingArena: React.FC<TypingArenaProps> = ({
  mode,
  timeOption,
  wordsOption,
  lineCount = 3,
  tier,
  errorBehavior,
  learnTrack,
  focusKey,
  onLearnFinish,
  onFinish,
  onActivity,
  setIsFocusMode,
  onKeyClick,
  onKeyError,
  onWordComplete,
  onNextCharChange,
}) => {
  const [words, setWords] = useState<string[]>([]);
  const [typedWords, setTypedWords] = useState<string[]>([""]);
  const [currentWordIdx, setCurrentWordIdx] = useState<number>(0);
  const [currentInput, setCurrentInput] = useState<string>("");

  // ── Phase 2: Neural Lock-In Drill State ────────────────────────────────────
  const [inLockInDrill, setInLockInDrill] = useState<boolean>(false);
  const [drillWords, setDrillWords] = useState<string[]>([]);
  const [drillWordIndex, setDrillWordIndex] = useState<number>(0);
  const [drillCleanCount, setDrillCleanCount] = useState<number>(0);

  const lessonActiveTargetRef = useRef<string>("s");
  const repairQueueRef = useRef<string[]>([]);
  const repairedWordsSet = useRef<Set<string>>(new Set());
  const learnKeystrokesRef = useRef<LearnKeystroke[]>([]);
  const lastKeyTimeRef = useRef<number>(0);
  const lastTypedCharRef = useRef<string>("");

  const [testStarted, setTestStarted] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(timeOption);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isFocused, setIsFocused] = useState<boolean>(true);

  // Caret coordinates inside words-wrapper
  const [caretPos, setCaretPos] = useState<{ x: number; y: number; height: number; visible: boolean }>({
    x: 0,
    y: 0,
    height: 32,
    visible: true,
  });
  const [isTyping, setIsTyping] = useState<boolean>(false);

  // ── Phase 3: Velocity-Reactive Caret Glow ──────────────────────────────────
  // Track keystrokes in a 600ms sliding window for glow intensity
  const recentKeyTimestamps = useRef<number[]>([]);
  const [caretGlowIntensity, setCaretGlowIntensity] = useState<number>(0); // 0–1

  // ── Phase 4: Rage-Quit Shake ───────────────────────────────────────────────
  const [isRageShaking, setIsRageShaking] = useState<boolean>(false);
  const recentErrorTimestamps = useRef<number[]>([]);
  const rageShakeTimeout = useRef<NodeJS.Timeout | null>(null);

  // Flash state for "Stop on Error"
  const [stopErrorFlash, setStopErrorFlash] = useState<boolean>(false);

  // Viewport scroll translateY for 3-line centered view
  const [viewportTranslateY, setViewportTranslateY] = useState<number>(0);

  // ── Phase 5: Live WPM Sparkline ───────────────────────────────────────────
  const [liveWpmWindow, setLiveWpmWindow] = useState<number[]>([]);

  // Telemetry trackers & state refs
  const isFinishedRef = useRef<boolean>(false);
  const testStartedRef = useRef<boolean>(false);
  const startTimeRef = useRef<number | null>(null);
  const wordsRef = useRef<string[]>([]);
  const currentWordIdxRef = useRef<number>(0);
  const currentInputRef = useRef<string>("");
  const typedWordsRef = useRef<string[]>([""]);

  const keystrokesInCurrentSecond = useRef<number>(0);
  const rawKeystrokesPerSecond = useRef<number[]>([]);
  const errorSeconds = useRef<Set<number>>(new Set());
  const correctKeystrokesCount = useRef<number>(0);
  const incorrectKeystrokesCount = useRef<number>(0);
  const extraKeystrokesCount = useRef<number>(0);

  // ── Phase 6: Word Results for Heatmap ─────────────────────────────────────
  const completedWordResults = useRef<WordResult[]>([]);
  const keystrokesLogRef = useRef<{ key: string; time: number }[]>([]);
  const correctedErrorsCount = useRef<number>(0);
  const testStartedEpochMs = useRef<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const wordsWrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync state to refs for non-reactive reads
  useEffect(() => { wordsRef.current = words; }, [words]);
  useEffect(() => { currentWordIdxRef.current = currentWordIdx; }, [currentWordIdx]);
  useEffect(() => { currentInputRef.current = currentInput; }, [currentInput]);
  useEffect(() => { typedWordsRef.current = typedWords; }, [typedWords]);

  // Fetch words from backend (used by reset actions and key handlers)
  const fetchWords = useCallback(
    async (count: number, append = false, recentWords?: string[]) => {
      const batch = await requestWordBatch({ mode, tier, learnTrack, focusKey, count, recent: recentWords });
      if (batch.activeTarget) {
        lessonActiveTargetRef.current = batch.activeTarget;
      }
      setWords((prev) => (append ? [...prev, ...batch.words] : batch.words));
    },
    [mode, tier, learnTrack, focusKey]
  );

  // Complete the test and invoke backend C++ telemetry analysis
  const finalizeTest = useCallback(async () => {
    if (isFinishedRef.current) return;
    isFinishedRef.current = true;

    const now = performance.now();
    const duration = startTimeRef.current
      ? (now - startTimeRef.current) / 1000.0
      : (mode === "time" ? timeOption : 1.0);

    // Push remaining keystrokes of the final second
    rawKeystrokesPerSecond.current.push(keystrokesInCurrentSecond.current);

    // Calculate missed characters
    const currentWords = wordsRef.current;
    const activeWordIdx = currentWordIdxRef.current;
    const activeInput = currentInputRef.current;

    let missed = 0;
    for (let i = activeWordIdx; i < currentWords.length; i++) {
      const orig = currentWords[i] || "";
      if (i === activeWordIdx) {
        if (orig.length > activeInput.length) {
          missed += orig.length - activeInput.length;
        }
      } else {
        missed += orig.length;
      }
    }

    // Record the current (possibly incomplete) word result
    const allWordResults: WordResult[] = [...completedWordResults.current];
    if (activeInput.length > 0) {
      allWordResults.push({ original: currentWords[activeWordIdx] || "", typed: activeInput });
    }

    const payload: TelemetryPayload = {
      durationSeconds: Math.max(1.0, duration),
      correctChars: correctKeystrokesCount.current,
      incorrectChars: incorrectKeystrokesCount.current,
      extraChars: extraKeystrokesCount.current,
      missedChars: missed,
      rawKeystrokesPerSecond: rawKeystrokesPerSecond.current,
    };

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("C++ analysis failed");
      const result: TelemetryResult = await res.json();
      onFinish(
        {
          ...result,
          wordResults: allWordResults,
          correctedErrors: correctedErrorsCount.current,
          keystrokesLog: keystrokesLogRef.current,
          startedAt: testStartedEpochMs.current || Date.now(),
        },
        Array.from(errorSeconds.current)
      );
    } catch (err) {
      console.error("Analysis request failed, calculating fallback:", err);
      const totalChars =
        correctKeystrokesCount.current +
        incorrectKeystrokesCount.current +
        extraKeystrokesCount.current;
      const rawWpm = (totalChars / 5.0) / (payload.durationSeconds / 60.0);
      const netWpm = (correctKeystrokesCount.current / 5.0) / (payload.durationSeconds / 60.0);
      const acc = totalChars > 0 ? (correctKeystrokesCount.current / totalChars) * 100.0 : 100.0;
      onFinish(
        {
          rawWpm: Math.round(rawWpm * 10) / 10,
          netWpm: Math.round(netWpm * 10) / 10,
          accuracy: Math.round(acc * 10) / 10,
          consistency: 90.0,
          perSecondWpm: rawKeystrokesPerSecond.current.map((k) => (k / 5.0) * 60.0),
          correctChars: correctKeystrokesCount.current,
          incorrectChars: incorrectKeystrokesCount.current,
          extraChars: extraKeystrokesCount.current,
          missedChars: missed,
          durationSeconds: payload.durationSeconds,
          wordResults: allWordResults,
        },
        Array.from(errorSeconds.current)
      );
    }
  }, [mode, onFinish, timeOption]);

  // Complete Learn Mode Test and submit to C++ Mastery Engine
  const finalizeLearnTest = useCallback(async () => {
    if (isFinishedRef.current) return;
    isFinishedRef.current = true;

    const now = performance.now();
    const duration = startTimeRef.current
      ? (now - startTimeRef.current) / 1000.0
      : 25.0;

    try {
      const res = await fetch("/api/learn/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track: learnTrack || "phonetic_unlock",
          activeTarget: lessonActiveTargetRef.current || "s",
          durationSeconds: Math.max(1.0, duration),
          keystrokes: learnKeystrokesRef.current,
          repairedWords: Array.from(repairedWordsSet.current),
        }),
      });

      if (res.ok) {
        const delta: MasteryDeltaReport = await res.json();
        onLearnFinish?.(delta);
        return;
      }
    } catch (e) {
      console.error("Failed to submit learn telemetry", e);
    }

    // Fallback to legacy finish
    finalizeTest();
  }, [learnTrack, onLearnFinish, finalizeTest]);

  const finalizeTestRef = useRef(finalizeTest);
  useEffect(() => {
    finalizeTestRef.current = finalizeTest;
  }, [finalizeTest]);

  // Reset arena
  const resetTest = useCallback(() => {
    isFinishedRef.current = false;
    testStartedRef.current = false;
    startTimeRef.current = null;

    setTestStarted(false);
    setTimeLeft(timeOption);
    setElapsedSeconds(0);
    setCurrentWordIdx(0);
    setCurrentInput("");
    setTypedWords([""]);
    setViewportTranslateY(0);
    setIsFocusMode(false);
    setStopErrorFlash(false);
    setLiveWpmWindow([]);
    setCaretGlowIntensity(0);
    setIsRageShaking(false);

    // Reset drill and learn telemetry
    setInLockInDrill(false);
    setDrillWords([]);
    setDrillWordIndex(0);
    setDrillCleanCount(0);
    repairQueueRef.current = [];
    repairedWordsSet.current.clear();
    learnKeystrokesRef.current = [];
    lastKeyTimeRef.current = 0;
    lastTypedCharRef.current = "";

    keystrokesInCurrentSecond.current = 0;
    rawKeystrokesPerSecond.current = [];
    errorSeconds.current.clear();
    correctKeystrokesCount.current = 0;
    incorrectKeystrokesCount.current = 0;
    extraKeystrokesCount.current = 0;
    completedWordResults.current = [];
    recentKeyTimestamps.current = [];
    recentErrorTimestamps.current = [];

    const initialCount = mode === "learn" ? 25 : mode === "time" ? 100 : wordsOption;
    fetchWords(initialCount, false);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, [mode, timeOption, wordsOption, fetchWords, setIsFocusMode]);

  // Initial load for the current configuration. Replaces the previous
  // "call resetTest() inside an effect" flow: the state lands in a promise
  // callback and is dropped if the configuration changes mid-flight. Counter
  // resets on config change are handled by remounting the arena (its key).
  useEffect(() => {
    let cancelled = false;
    const count = mode === "learn" ? 25 : mode === "time" ? 100 : wordsOption;

    requestWordBatch({ mode, tier, learnTrack, focusKey, count }).then((batch) => {
      if (cancelled) return;
      if (batch.activeTarget) {
        lessonActiveTargetRef.current = batch.activeTarget;
      }
      setWords(batch.words);
    });

    // Focus on mount so the very first keystroke is captured (previously done
    // by resetTest, which no longer runs here).
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 50);

    return () => {
      cancelled = true;
      clearTimeout(focusTimer);
    };
  }, [mode, tier, learnTrack, focusKey, wordsOption]);

  // Wall-clock continuous countdown
  useEffect(() => {
    if (!testStarted) return;

    const countdownInterval = setInterval(() => {
      if (isFinishedRef.current || !startTimeRef.current) return;

      const now = performance.now();
      const elapsedSec = (now - startTimeRef.current) / 1000.0;

      if (mode === "time") {
        const remaining = Math.max(0, Math.ceil(timeOption - elapsedSec));
        setTimeLeft(remaining);

        if (remaining <= 0) {
          clearInterval(countdownInterval);
          finalizeTestRef.current();
        }
      } else {
        setElapsedSeconds(Math.floor(elapsedSec));
      }
    }, 100);

    // Per-second telemetry + sparkline update
    const telemetryInterval = setInterval(() => {
      if (isFinishedRef.current) return;
      const ks = keystrokesInCurrentSecond.current;
      rawKeystrokesPerSecond.current.push(ks);
      keystrokesInCurrentSecond.current = 0;

      // Update live sparkline window (last 10 seconds)
      const instantWpm = (ks / 5.0) * 60.0;
      setLiveWpmWindow((prev) => {
        const next = [...prev, instantWpm];
        return next.length > 10 ? next.slice(next.length - 10) : next;
      });
    }, 1000);

    return () => {
      clearInterval(countdownInterval);
      clearInterval(telemetryInterval);
    };
  }, [testStarted, mode, timeOption]);

  // Dynamic buffer appending in Time mode: endless stream, prefetching next 100 words when within 30 words of buffer end
  const isFetchingMoreRef = useRef(false);
  useEffect(() => {
    if (mode !== "time" || words.length === 0) return;
    if (words.length - currentWordIdx > 30) return;
    if (isFetchingMoreRef.current) return;

    isFetchingMoreRef.current = true;
    let cancelled = false;
    const recentWords = words.slice(-20);
    requestWordBatch({ mode, tier, learnTrack, focusKey, count: 100, recent: recentWords })
      .then((batch) => {
        if (!cancelled && batch.words.length > 0) {
          setWords((prev) => [...prev, ...batch.words]);
        }
      })
      .finally(() => {
        isFetchingMoreRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [currentWordIdx, words, mode, tier, learnTrack, focusKey]);

  // Update Caret position and line auto-scrolling
  const updateCaretAndScroll = useCallback(() => {
    if (!wordsWrapperRef.current || words.length === 0) return;

    const currentWordEl = wordsWrapperRef.current.querySelector(
      `[data-word-idx="${currentWordIdx}"]`
    ) as HTMLElement | null;

    if (!currentWordEl) return;

    // Detect line index and center active line on line 2 (or top line for 1)
    const wordOffsetTop = currentWordEl.offsetTop;
    const lineHeight = currentWordEl.offsetHeight || 56;
    const lineIndex = Math.round(wordOffsetTop / lineHeight);

    // Current word anchored on line 2 (index 1). When finishing line 1 (index 0), scroll smoothly
    if (lineIndex > 1) {
      setViewportTranslateY(-(lineIndex - 1) * lineHeight);
    } else {
      setViewportTranslateY(0);
    }

    // Caret coordinates
    const charElements = currentWordEl.querySelectorAll<HTMLElement>("[data-char-idx]");
    if (currentInput.length < charElements.length) {
      const activeCharEl = charElements[currentInput.length];
      if (activeCharEl) {
        setCaretPos({
          x: currentWordEl.offsetLeft + activeCharEl.offsetLeft,
          y: currentWordEl.offsetTop + activeCharEl.offsetTop,
          height: activeCharEl.offsetHeight || 34,
          visible: true,
        });
        return;
      }
    }

    // Caret at end of word or extra chars
    if (charElements.length > 0) {
      const lastCharEl = charElements[charElements.length - 1];
      setCaretPos({
        x: currentWordEl.offsetLeft + lastCharEl.offsetLeft + lastCharEl.offsetWidth,
        y: currentWordEl.offsetTop + lastCharEl.offsetTop,
        height: lastCharEl.offsetHeight || 34,
        visible: true,
      });
    } else {
      setCaretPos({
        x: currentWordEl.offsetLeft,
        y: currentWordEl.offsetTop,
        height: 34,
        visible: true,
      });
    }
  }, [currentWordIdx, currentInput, words]);

  useEffect(() => {
    updateCaretAndScroll();
  }, [updateCaretAndScroll]);

  // Recompute line breaks and caret positioning after fonts are ready and on window resize
  useEffect(() => {
    if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        updateCaretAndScroll();
      });
    }

    const handleResize = () => {
      updateCaretAndScroll();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [updateCaretAndScroll]);

  // Notify parent of next expected char & last typed char for live vector keyboard guidance
  useEffect(() => {
    if (inLockInDrill) {
      const currentWord = drillWords[drillWordIndex] || "";
      const nextChar = currentWord[currentInput.length] || " ";
      onNextCharChange?.(nextChar, lastTypedCharRef.current);
    } else if (words.length > 0 && currentWordIdx < words.length) {
      const currentWord = words[currentWordIdx] || "";
      const nextChar = currentWord[currentInput.length] || " ";
      onNextCharChange?.(nextChar, lastTypedCharRef.current);
    }
  }, [inLockInDrill, drillWords, drillWordIndex, words, currentWordIdx, currentInput, onNextCharChange]);

  // Window-level focus recovery & click-to-focus handler
  useEffect(() => {
    const handleWindowClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest("button") ||
        target.closest("a") ||
        target.closest("select") ||
        target.closest("input")
      ) {
        return;
      }
      inputRef.current?.focus();
    };

    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, []);

  // ── Phase 3: Velocity-Reactive Caret Glow ──────────────────────────────────
  const updateCaretGlow = useCallback(() => {
    const now = performance.now();
    recentKeyTimestamps.current = recentKeyTimestamps.current.filter(
      (t) => now - t < 600
    );
    // Normalize: 0 keys/600ms → 0, 8+ keys/600ms → 1
    const velocity = Math.min(1, recentKeyTimestamps.current.length / 8);
    setCaretGlowIntensity(velocity);
  }, []);

  // ── Phase 4: Rage-Quit Shake ───────────────────────────────────────────────
  const triggerRageShakeIfNeeded = useCallback(() => {
    const now = performance.now();
    // Keep only errors in last 2 seconds
    recentErrorTimestamps.current = recentErrorTimestamps.current.filter(
      (t) => now - t < 2000
    );
    recentErrorTimestamps.current.push(now);

    if (recentErrorTimestamps.current.length >= 3) {
      recentErrorTimestamps.current = [];
      setIsRageShaking(true);
      if (rageShakeTimeout.current) clearTimeout(rageShakeTimeout.current);
      rageShakeTimeout.current = setTimeout(() => {
        setIsRageShaking(false);
      }, 500);
    }
  }, []);

  // Handle typing input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // ── Phase 2: Neural Lock-In Drill Specific Handling ─────────────────────
    if (inLockInDrill) {
      if (e.key === "Escape") {
        e.preventDefault();
        finalizeLearnTest();
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        if (currentInput.length > 0) {
          setCurrentInput((prev) => prev.slice(0, -1));
        }
        return;
      }
      if (e.key === " " || e.key === "Space" || e.key === "Enter") {
        e.preventDefault();
        const target = drillWords[drillWordIndex] || "";
        if (currentInput === target) {
          onWordComplete();
          const nextClean = drillCleanCount + 1;
          if (nextClean >= 3) {
            repairedWordsSet.current.add(target);
            if (drillWordIndex + 1 < drillWords.length) {
              setDrillWordIndex((prev) => prev + 1);
              setDrillCleanCount(0);
              setCurrentInput("");
            } else {
              finalizeLearnTest();
            }
          } else {
            setDrillCleanCount(nextClean);
            setCurrentInput("");
          }
        } else {
          triggerRageShakeIfNeeded();
          setStopErrorFlash(true);
          setTimeout(() => setStopErrorFlash(false), 200);
          onKeyError();
          setDrillCleanCount(0);
          setCurrentInput("");
        }
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        const char = e.key;
        const target = drillWords[drillWordIndex] || "";
        const expectedChar = target[currentInput.length];
        lastTypedCharRef.current = char;

        if (char === expectedChar) {
          onKeyClick();
          const nextInput = currentInput + char;
          setCurrentInput(nextInput);
          if (nextInput === target) {
            onWordComplete();
            const nextClean = drillCleanCount + 1;
            if (nextClean >= 3) {
              repairedWordsSet.current.add(target);
              if (drillWordIndex + 1 < drillWords.length) {
                setTimeout(() => {
                  setDrillWordIndex((prev) => prev + 1);
                  setDrillCleanCount(0);
                  setCurrentInput("");
                }, 100);
              } else {
                setTimeout(() => {
                  finalizeLearnTest();
                }, 120);
              }
            } else {
              setTimeout(() => {
                setDrillCleanCount(nextClean);
                setCurrentInput("");
              }, 100);
            }
          }
        } else {
          triggerRageShakeIfNeeded();
          setStopErrorFlash(true);
          setTimeout(() => setStopErrorFlash(false), 200);
          onKeyError();
          setDrillCleanCount(0);
          setCurrentInput("");
        }
        return;
      }
      return;
    }

    // Hotkeys: Tab + Enter or Escape to reset
    if (e.key === "Escape" || (e.key === "Enter" && e.shiftKey)) {
      e.preventDefault();
      resetTest();
      return;
    }

    // If Tab alone is pressed, prevent default navigation and reset
    if (e.key === "Tab") {
      e.preventDefault();
      resetTest();
      return;
    }

    // Ignore function keys, alt, meta, ctrl, caps lock
    if (
      e.key.length > 1 &&
      e.key !== "Backspace" &&
      e.key !== " " &&
      e.key !== "Space"
    ) {
      return;
    }

    // Notify activity to reset mouse-idle timer
    onActivity();

    // Start test on first valid keystroke
    if (!testStartedRef.current) {
      testStartedRef.current = true;
      setTestStarted(true);
      setIsFocusMode(true);
      startTimeRef.current = performance.now();
      testStartedEpochMs.current = Date.now();
    }

    // Flight time tracking
    const now = performance.now();
    const flightMs = lastKeyTimeRef.current > 0 ? Math.round(now - lastKeyTimeRef.current) : 120;
    lastKeyTimeRef.current = now;

    // Log raw keystroke event
    keystrokesLogRef.current.push({ key: e.key, time: Date.now() });

    // ── Velocity tracking for glow ──
    recentKeyTimestamps.current.push(now);
    updateCaretGlow();

    // Caret typing pulse
    setIsTyping(true);
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    idleTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      setCaretGlowIntensity(0);
    }, 600);

    const targetWord = words[currentWordIdx] || "";

    // 1. BACKSPACE HANDLER
    if (e.key === "Backspace") {
      e.preventDefault();
      if (errorBehavior === "strict") {
        return;
      }

      if (currentInput.length > 0) {
        const charIdx = currentInput.length - 1;
        if (charIdx < targetWord.length && currentInput[charIdx] !== targetWord[charIdx]) {
          correctedErrorsCount.current++;
        }
        setCurrentInput((prev) => prev.slice(0, -1));
      } else if (currentWordIdx > 0 && errorBehavior === "free" && mode !== "learn") {
        const prevIdx = currentWordIdx - 1;
        const prevTyped = typedWords[prevIdx] || "";
        setCurrentWordIdx(prevIdx);
        setCurrentInput(prevTyped);
        setTypedWords((prev) => prev.slice(0, prevIdx + 1));
        // Also remove the last completed word result
        completedWordResults.current = completedWordResults.current.slice(0, prevIdx);
      }
      return;
    }

    // 2. SPACE / WORD ADVANCE HANDLER
    if (e.key === " " || e.key === "Space") {
      e.preventDefault();
      if (currentInput.length === 0) return;

      keystrokesInCurrentSecond.current += 1;

      const isCorrect = currentInput === targetWord;

      if (mode === "learn") {
        learnKeystrokesRef.current.push({
          expected: " ",
          actual: " ",
          flightMs: Math.min(1500, flightMs),
          correct: isCorrect,
        });
        if (!isCorrect && repairQueueRef.current.length < 3 && !repairQueueRef.current.includes(targetWord)) {
          repairQueueRef.current.push(targetWord);
        }
      }

      // Record word result for heatmap
      completedWordResults.current.push({
        original: targetWord,
        typed: currentInput,
      });

      if (!isCorrect) {
        incorrectKeystrokesCount.current += 1;
        const currentElapsed = startTimeRef.current
          ? Math.floor((performance.now() - startTimeRef.current) / 1000)
          : 0;
        errorSeconds.current.add(currentElapsed + 1);
        triggerRageShakeIfNeeded();
        onKeyError();
      } else {
        correctKeystrokesCount.current += 1;
        onWordComplete();
      }

      setTypedWords((prev) => {
        const next = [...prev];
        next[currentWordIdx] = currentInput;
        return next;
      });

      if (mode === "words" && currentWordIdx + 1 >= wordsOption) {
        finalizeTest();
        return;
      }

      if (mode === "learn" && currentWordIdx + 1 >= words.length) {
        if (repairQueueRef.current.length > 0) {
          setInLockInDrill(true);
          setDrillWords([...repairQueueRef.current]);
          setDrillWordIndex(0);
          setDrillCleanCount(0);
          setCurrentInput("");
          return;
        } else {
          finalizeLearnTest();
          return;
        }
      }

      setCurrentWordIdx((prev) => prev + 1);
      setCurrentInput("");
      return;
    }

    // 3. REGULAR CHARACTER HANDLER
    if (e.key.length === 1) {
      e.preventDefault();
      const char = e.key;
      const expectedChar = targetWord[currentInput.length];
      lastTypedCharRef.current = char;

      keystrokesInCurrentSecond.current += 1;
      const isCharCorrect = char === expectedChar;

      if (mode === "learn") {
        learnKeystrokesRef.current.push({
          expected: expectedChar || "",
          actual: char,
          flightMs: Math.min(2000, flightMs),
          correct: isCharCorrect,
        });

        // Check hesitation on active target key (>450ms) or typo
        const targetLetter = lessonActiveTargetRef.current.toLowerCase();
        const isTargetChar = Boolean(expectedChar && expectedChar.toLowerCase() === targetLetter);
        if (!isCharCorrect || (isTargetChar && flightMs > 450)) {
          if (repairQueueRef.current.length < 3 && !repairQueueRef.current.includes(targetWord)) {
            repairQueueRef.current.push(targetWord);
          }
        }
      }

      // Handle "Stop on Error" mode
      if (errorBehavior === "stop") {
        if (char !== expectedChar) {
          setStopErrorFlash(true);
          setTimeout(() => setStopErrorFlash(false), 200);
          incorrectKeystrokesCount.current += 1;
          const currentElapsed = startTimeRef.current
            ? Math.floor((performance.now() - startTimeRef.current) / 1000)
            : 0;
          errorSeconds.current.add(currentElapsed + 1);
          triggerRageShakeIfNeeded();
          onKeyError();
          return;
        } else {
          correctKeystrokesCount.current += 1;
          onKeyClick();
          const nextInput = currentInput + char;
          setCurrentInput(nextInput);

          if (
            mode === "words" &&
            currentWordIdx === wordsOption - 1 &&
            nextInput === targetWord
          ) {
            finalizeTest();
            return;
          }

          if (
            mode === "learn" &&
            currentWordIdx === words.length - 1 &&
            nextInput === targetWord
          ) {
            if (repairQueueRef.current.length > 0) {
              setInLockInDrill(true);
              setDrillWords([...repairQueueRef.current]);
              setDrillWordIndex(0);
              setDrillCleanCount(0);
              setCurrentInput("");
            } else {
              finalizeLearnTest();
            }
            return;
          }
          return;
        }
      }

      // Free Flow & Strict mode
      if (char === expectedChar) {
        correctKeystrokesCount.current += 1;
        onKeyClick();
      } else {
        incorrectKeystrokesCount.current += 1;
        const currentElapsed = startTimeRef.current
          ? Math.floor((performance.now() - startTimeRef.current) / 1000)
          : 0;
        errorSeconds.current.add(currentElapsed + 1);
        if (currentInput.length >= targetWord.length) {
          extraKeystrokesCount.current += 1;
        }
        triggerRageShakeIfNeeded();
        onKeyError();
      }

      const nextInput = currentInput + char;
      if (nextInput.length <= targetWord.length + 10) {
        setCurrentInput(nextInput);
      }

      if (
        mode === "words" &&
        currentWordIdx === wordsOption - 1 &&
        nextInput === targetWord
      ) {
        finalizeTest();
        return;
      }

      if (
        mode === "learn" &&
        currentWordIdx === words.length - 1 &&
        nextInput === targetWord
      ) {
        if (repairQueueRef.current.length > 0) {
          setInLockInDrill(true);
          setDrillWords([...repairQueueRef.current]);
          setDrillWordIndex(0);
          setDrillCleanCount(0);
          setCurrentInput("");
        } else {
          finalizeLearnTest();
        }
        return;
      }
    }
  };

  // Global keydown fallback
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        target !== document.body &&
        (target.tagName === "BUTTON" || target.tagName === "INPUT" || target.tagName === "SELECT")
      ) {
        return;
      }

      if (e.key === "Tab" || e.key === "Escape") {
        e.preventDefault();
        resetTest();
        return;
      }

      if (document.activeElement !== inputRef.current && e.key.length === 1) {
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [resetTest]);

  // ── Derived: Caret glow shadow ─────────────────────────────────────────────
  // Interpolate glow from minimal to vivid based on velocity
  const caretGlowStyle: React.CSSProperties = {
    ["--caret-glow-intensity" as string]: caretGlowIntensity,
    boxShadow: `0 0 ${6 + caretGlowIntensity * 18}px ${caretGlowIntensity * 10}px var(--caret-color)`,
    opacity: stopErrorFlash ? 1 : 0.9 + caretGlowIntensity * 0.1,
    transition: "box-shadow 0.15s ease-out, background-color 0.1s",
  };

  const showSparkline = testStarted && elapsedSeconds >= 3 && liveWpmWindow.length >= 2;

  return (
    <div
      ref={containerRef}
      onClick={() => inputRef.current?.focus()}
      className="w-full max-w-4xl mx-auto px-6 flex flex-col items-center justify-center relative cursor-text select-none"
    >
      {/* Hidden real input capturing keystrokes */}
      <input
        ref={inputRef}
        type="text"
        value={currentInput}
        onChange={() => {}}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className="opacity-0 absolute inset-0 -z-10"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck="false"
      />

      {/* Top Row: Live Counter + Sparkline / Drill Header */}
      {inLockInDrill ? (
        <div className="w-full flex flex-col items-center justify-center gap-2 mb-3 py-2.5 px-4 rounded-xl bg-white/[0.03] border border-[var(--accent-color)]/30 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2 text-xs font-mono-custom tracking-wider text-[var(--accent-color)] font-semibold uppercase">
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent-color)] animate-ping" />
            <span>NEURAL LOCK-IN DRILL · TYPE EACH MISSED WORD 3X CLEAN TO CEMENT MUSCLE MEMORY</span>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono-custom text-[var(--inactive-color)]">
            <span className="opacity-90 font-medium">Word {drillWordIndex + 1} of {drillWords.length}</span>
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((pip) => (
                <span
                  key={pip}
                  className={`inline-block w-2.5 h-2.5 rounded-full transition-all duration-200 ${
                    pip < drillCleanCount
                      ? "bg-[var(--accent-color)] shadow-[0_0_8px_var(--accent-color)] scale-110"
                      : "bg-white/15 border border-white/20"
                  }`}
                />
              ))}
              <span className="ml-1 text-[var(--typed-color)] opacity-95 font-mono-custom font-semibold">
                [{drillCleanCount}/3 Clean]
              </span>
            </div>
            <button
              onClick={() => finalizeLearnTest()}
              className="ml-2 text-[11px] text-[var(--inactive-color)] opacity-70 hover:opacity-100 hover:text-[var(--accent-color)] transition-opacity underline cursor-pointer"
            >
              Skip Drill (Esc)
            </button>
          </div>
        </div>
      ) : mode === "learn" ? (
        <div className="w-full flex items-center justify-between mb-2 font-mono-custom">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-mono-custom tabular-nums text-[var(--accent-color)] opacity-85 tracking-tight">
              {currentWordIdx + 1}
              <span className="text-xs text-[var(--inactive-color)] opacity-60 ml-1 font-normal">
                /{words.length || 25}
              </span>
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-[var(--inactive-color)] opacity-80 font-mono-custom">
              {currentWordIdx < 5
                ? "Phase A · Flow Warm-Up"
                : currentWordIdx < 20
                ? "Phase B · Target Drill"
                : "Phase C · Cadence Lock"}
            </span>
          </div>
          <LiveSparkline dataPoints={liveWpmWindow} visible={showSparkline} />
        </div>
      ) : (
        <div className="w-full flex items-center justify-between mb-2 font-mono-custom">
          <div className="flex items-center gap-3">
            {mode === "time" ? (
              <span className="text-2xl font-mono-custom tabular-nums text-[var(--accent-color)] opacity-85 tracking-tight">
                {timeLeft}
              </span>
            ) : (
              <span className="text-2xl font-mono-custom tabular-nums text-[var(--accent-color)] opacity-85 tracking-tight">
                {currentWordIdx}
                <span className="text-xs text-[var(--inactive-color)] opacity-60 ml-1 font-normal">
                  /{wordsOption}
                </span>
              </span>
            )}
          </div>
          <LiveSparkline dataPoints={liveWpmWindow} visible={showSparkline} />
        </div>
      )}

      {/* 3-Line Viewport Container or Neural Lock-In Drill View */}
      {inLockInDrill ? (
        <div className={`w-full h-[168px] flex flex-col items-center justify-center text-center arena-mask py-1 select-none ${isRageShaking ? "arena-shake" : ""}`}>
          <div className="text-4xl sm:text-5xl font-mono-custom tracking-wider flex items-center justify-center gap-1 mb-3">
            {(drillWords[drillWordIndex] || "").split("").map((targetChar, cIdx) => {
              let charColor = "var(--untyped-color)";
              let charOpacity = 0.65;
              let borderClass = "";
              if (cIdx < currentInput.length) {
                const typedChar = currentInput[cIdx];
                if (typedChar === targetChar) {
                  charColor = "var(--typed-color)";
                  charOpacity = 1.0;
                } else {
                  charColor = "var(--error-color)";
                  charOpacity = 1.0;
                  borderClass = "border-b-[3px] border-[var(--error-color)] pb-[2px]";
                }
              } else if (cIdx === currentInput.length) {
                charColor = "var(--untyped-active, var(--untyped-color))";
                charOpacity = 0.95;
                borderClass = "border-b-[2px] border-[var(--accent-color)] pb-[1px]";
              }
              return (
                <span
                  key={cIdx}
                  style={{ color: charColor, opacity: charOpacity }}
                  className={`inline-block transition-colors duration-75 ${borderClass}`}
                >
                  {targetChar}
                </span>
              );
            })}
          </div>
          <p className="text-xs font-mono-custom text-[var(--inactive-color)] opacity-70">
            Type word cleanly 3 consecutive times to master.
          </p>
        </div>
      ) : (
        <div
          style={{ height: `${lineCount * 56}px` }}
          className="w-full overflow-hidden relative arena-mask py-1"
        >
          {/* Out-of-Focus Overlay (Monkeytype-style) */}
          <AnimatePresence>
            {!isFocused && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => inputRef.current?.focus()}
                className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--bg-color)]/60 backdrop-blur-[1px] cursor-pointer"
              >
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono-custom text-[var(--inactive-color)] hover:text-[var(--typed-color)] transition-colors">
                  <MousePointerClick className="w-3.5 h-3.5 text-[var(--accent-color)] animate-pulse" />
                  <span>click or press any key to focus</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Animated Words Floating Effortlessly on Canvas */}
          <div
            ref={wordsWrapperRef}
            style={{
              transform: `translateY(${viewportTranslateY}px)`,
              transition: "transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
            className={`w-full flex flex-wrap gap-x-4 gap-y-1 text-[clamp(1.5rem,2.2vw,2.1rem)] leading-[1.75] tracking-tight font-mono-custom relative ${
              !isFocused ? "opacity-30" : "opacity-100"
            } transition-opacity duration-300 ${
              // ── Feature 4: Rage-Quit Shake ──
              isRageShaking ? "arena-shake" : ""
            }`}
          >
            {/* ── Feature 3: Velocity-Reactive Caret Glow ── */}
            {caretPos.visible && (
              <motion.div
                animate={{
                  left: caretPos.x,
                  top: caretPos.y + 4,
                  height: caretPos.height - 8,
                }}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 35,
                  mass: 0.15,
                }}
                style={
                  stopErrorFlash
                    ? {
                        boxShadow: "0 0 12px 4px #e06c75",
                        backgroundColor: "#e06c75",
                        transition: "box-shadow 0.1s, background-color 0.1s",
                      }
                    : caretGlowStyle
                }
                className={`absolute w-[2.5px] rounded-full z-20 pointer-events-none ${
                  stopErrorFlash
                    ? "bg-[#e06c75]"
                    : "bg-[var(--caret-color)]"
                } ${!isTyping ? "caret-idle" : ""}`}
              />
            )}

            {/* Render Words and Character States with memoized WordElement */}
            {words.map((word, wIdx) => {
              const isCurrent = wIdx === currentWordIdx;
              const isPast = wIdx < currentWordIdx;
              const typedVal = isPast
                ? typedWords[wIdx] || ""
                : isCurrent
                ? currentInput
                : "";

              return (
                <WordElement
                  key={wIdx}
                  word={word}
                  wIdx={wIdx}
                  isCurrent={isCurrent}
                  isPast={isPast}
                  typedVal={typedVal}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Floating Whisper-Quiet Restart Hint */}
      <div className="w-full flex items-center justify-center gap-3 mt-8 font-mono-custom text-xs select-none">
        <button
          onClick={resetTest}
          className="px-2 py-1 rounded-md text-[var(--inactive-color)] opacity-55 hover:opacity-100 hover:text-[var(--typed-color)] hover:bg-white/[0.04] transition-all cursor-pointer group flex items-center gap-2"
          title="Restart Test (Tab / Esc)"
        >
          <RotateCcw className="w-3.5 h-3.5 opacity-80 group-hover:opacity-100 group-hover:-rotate-90 transition-all duration-200" />
          <span className="text-[11px] tracking-wide opacity-80 group-hover:opacity-100">
            tab / esc to restart
          </span>
        </button>
      </div>
    </div>
  );
};
