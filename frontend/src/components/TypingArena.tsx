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
  KeyStatus,
  MasteryGateSnapshot,
} from "@/types/typing";
import { RotateCcw, MousePointerClick } from "lucide-react";
import { LiveSparkline } from "./LiveSparkline";

import { sampleClientWords } from "@/utils/monkeytypeWordlists";
import { useSettings } from "@/context/SettingsContext";
import { DEFAULT_PERSONAL_SETTINGS, StopOnError } from "@/types/typing";
import {
  isGateAchieved,
  getNextCurriculumTarget,
  getAllowedLettersForTarget,
  generateLearnBatch,
  createMasteryGateSnapshot,
} from "@/utils/learnGenerator";
import {
  DrillItem,
  DrillState,
  initDrillState,
  recordDrillOutcome,
  createInitialDrillQueue,
  reinsertDrillWord,
  findConfusableWords,
} from "@/utils/drillScheduler";

interface WordBatch {
  words: string[];
  activeTarget?: string;
  isPatternDrill?: boolean;
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
      const activeTarget = (focusKey || "s").toLowerCase();
      const url = `/api/learn/lesson?track=${learnTrack || "phonetic_unlock"}&count=25${
        activeTarget ? `&focusKey=${encodeURIComponent(activeTarget)}` : ""
      }&_t=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("Learn API error");
      const data = await res.json();
      if (data && Array.isArray(data.words) && data.words.length > 0) {
        const target = (data.activeTarget || activeTarget).toLowerCase();
        const targetCount = data.words.filter((w: string) => w.toLowerCase().includes(target)).length;
        if (targetCount >= Math.ceil(data.words.length * 0.8)) {
          return {
            words: data.words,
            activeTarget: target,
            isPatternDrill: Boolean(data.isPatternDrill),
          };
        }
        // Guarantee >= 80% target density with pure generator
        const allowed = getAllowedLettersForTarget(target);
        return {
          words: generateLearnBatch(allowed, target, data.words.length, Math.random, recent),
          activeTarget: target,
          isPatternDrill: Boolean(data.isPatternDrill),
        };
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
  if (mode === "learn") {
    const target = (focusKey || "s").toLowerCase();
    const allowed = getAllowedLettersForTarget(target);
    return {
      words: generateLearnBatch(allowed, target, count || 25, Math.random, recent),
      activeTarget: target,
      isPatternDrill: false,
    };
  }

  return {
    words: sampleClientWords(tier, count, recent),
  };
}

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

// Memoized individual word component for 0 layout shift and maximum typing performance
interface WordElementProps {
  word: string;
  wIdx: number;
  isCurrent: boolean;
  isPast: boolean;
  typedVal: string;
  targetKey?: string;
}

export const WordElement = React.memo<WordElementProps>(
  ({ word, wIdx, isCurrent, isPast, typedVal, targetKey }) => {
    const targetLower = targetKey ? targetKey.toLowerCase() : "";
    const isPastMistyped = isPast && typedVal !== word;

    return (
      <div
        data-word-idx={wIdx}
        className={`relative inline-flex items-baseline whitespace-nowrap border-b-2 ${
          isPastMistyped ? "border-[var(--error-color)]/70 pb-[1px]" : "border-transparent pb-[1px]"
        }`}
      >
        {/* Target word characters */}
        {word.split("").map((targetChar, cIdx) => {
          let charStyle: React.CSSProperties = {
            color: "var(--untyped-color)",
            opacity: "var(--untyped-opacity)",
          };
          let borderClass = "border-transparent";

          const isTargetLetter = targetLower !== "" && targetChar.toLowerCase() === targetLower;

          if (isCurrent) {
            if (cIdx >= typedVal.length) {
              charStyle = {
                color: isTargetLetter
                  ? "var(--accent-color)"
                  : "var(--untyped-active)",
                opacity: isTargetLetter ? 1.0 : 0.78,
              };
              if (isTargetLetter) {
                borderClass = "border-[var(--accent-color)]";
              }
            }
          } else if (isPast) {
            if (cIdx >= typedVal.length) {
              charStyle = {
                color: "var(--error-color)",
                opacity: 0.55,
              };
              borderClass = "border-[var(--error-color)]/50";
            } else {
              charStyle = {
                color: "var(--untyped-color)",
                opacity: "var(--untyped-opacity)",
              };
            }
          } else {
            // Future upcoming words
            if (isTargetLetter) {
              charStyle = {
                color: "var(--accent-color)",
                opacity: 0.85,
              };
              borderClass = "border-[var(--accent-color)]";
            }
          }

          if (cIdx < typedVal.length) {
            const typedChar = typedVal[cIdx];
            if (typedChar === targetChar) {
              charStyle = {
                color: "var(--correct-color, #22c55e)",
                opacity: 1.0,
              };
              borderClass = "border-transparent";
            } else {
              charStyle = {
                color: "var(--error-color)",
                opacity: 1.0,
              };
              borderClass = "border-[var(--error-color)]";
            }
          }

          return (
            <span
              key={cIdx}
              data-char-idx={cIdx}
              style={charStyle}
              className={`inline-block border-b-2 ${borderClass}`}
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
                style={{ color: "var(--error-color)", opacity: 1.0 }}
                className="inline-block border-b-2 border-[var(--error-color)]"
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
      prev.typedVal === next.typedVal &&
      prev.targetKey === next.targetKey
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
  keyStatuses?: KeyStatus[];
  onTargetUnlock?: (newTarget: string, updatedStatuses: KeyStatus[]) => void;
  onLearnFinish?: (delta: MasteryDeltaReport) => void;
  onFinish: (result: TelemetryResult, errorSeconds: number[]) => void;
  onActivity: () => void;
  isFocusMode: boolean;
  setIsFocusMode: (val: boolean) => void;
  // Sound FX callbacks
  onKeyClick: () => void;
  onKeyDelete?: () => void;
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
  keyStatuses,
  onTargetUnlock,
  onLearnFinish,
  onFinish,
  onActivity,
  setIsFocusMode,
  onKeyClick,
  onKeyDelete,
  onKeyError,
  onWordComplete,
  onNextCharChange,
}) => {
  const { settings: personalSettings } = useSettings();
  const settings = mode === "competition" ? DEFAULT_PERSONAL_SETTINGS : personalSettings;

  const stopOnErrorRef = useRef<StopOnError>(settings.stopOnError);
  useEffect(() => {
    stopOnErrorRef.current = settings.stopOnError;
  }, [settings.stopOnError]);

  const [words, setWords] = useState<string[]>([]);
  const [typedWords, setTypedWords] = useState<string[]>([""]);
  const [currentWordIdx, setCurrentWordIdx] = useState<number>(0);
  const [currentInput, setCurrentInput] = useState<string>("");

  // ── Phase 2: Neural Lock-In Drill State ────────────────────────────────────
  const [inLockInDrill, setInLockInDrill] = useState<boolean>(false);
  const [drillQueue, setDrillQueue] = useState<DrillItem[]>([]);
  const drillQueueRef = useRef<DrillItem[]>([]);
  const [drillTargetWords, setDrillTargetWords] = useState<string[]>([]);
  const [drillCleanCounts, setDrillCleanCounts] = useState<Record<string, number>>({});
  const drillCleanCountsRef = useRef<Record<string, number>>({});
  const drillCandidatePoolRef = useRef<string[]>([]);
  const drillStateRef = useRef<DrillState | null>(null);
  const frozenGateSnapshotRef = useRef<MasteryGateSnapshot | null>(null);

  const [activeTargetKey, setActiveTargetKey] = useState<string>(focusKey || "s");
  const [isPatternDrill, setIsPatternDrill] = useState<boolean>(false);

  const lessonActiveTargetRef = useRef<string>("s");
  const liveTargetStatRef = useRef<KeyStatus | null>(null);
  const advancedTargetsRef = useRef<Set<string>>(new Set());
  const [milestoneToast, setMilestoneToast] = useState<{ unlockedKey: string; isComplete?: boolean } | null>(null);
  const milestoneTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const repairQueueRef = useRef<string[]>([]);
  const repairedWordsSet = useRef<Set<string>>(new Set());
  const missedWordsSet = useRef<Set<string>>(new Set());
  const firstAttemptKeyIndices = useRef<Set<string>>(new Set());
  const learnKeystrokesRef = useRef<LearnKeystroke[]>([]);
  const lastKeyTimeRef = useRef<number>(0);
  const lastTypedCharRef = useRef<string>("");

  const [testStarted, setTestStarted] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(timeOption);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isFocused, setIsFocused] = useState<boolean>(true);

  // Caret coordinates inside words-wrapper
  const [caretPos, setCaretPos] = useState<{ x: number; y: number; height: number; width: number; visible: boolean }>({
    x: 0,
    y: 0,
    height: 32,
    width: 14,
    visible: true,
  });
  const [isTyping, setIsTyping] = useState<boolean>(false);

  // ── Phase 3: Velocity-Reactive Caret Glow ──────────────────────────────────
  // Track keystrokes in a 600ms sliding window for glow intensity
  const recentKeyTimestamps = useRef<number[]>([]);
  const [caretGlowIntensity, setCaretGlowIntensity] = useState<number>(0); // 0–1

  // Flash state for "Stop on Error"
  const [stopErrorFlash, setStopErrorFlash] = useState<boolean>(false);

  // Viewport scroll translateY for 3-line centered view
  const [viewportTranslateY, setViewportTranslateY] = useState<number>(0);
  const [measuredLineHeight, setMeasuredLineHeight] = useState<number>(56);

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
      const activeKey = focusKey || lessonActiveTargetRef.current;
      const batch = await requestWordBatch({ mode, tier, learnTrack, focusKey: activeKey, count, recent: recentWords });
      if (batch.activeTarget) {
        lessonActiveTargetRef.current = batch.activeTarget;
        setActiveTargetKey(batch.activeTarget);
      }
      if (batch.isPatternDrill !== undefined) {
        setIsPatternDrill(batch.isPatternDrill);
      }
      setWords((prev) => (append ? [...prev, ...batch.words] : batch.words));
    },
    [mode, tier, learnTrack, focusKey]
  );

  // ── Auto-advance at 100% ──────────────────────────────────────────────────
  const triggerAutoAdvance = useCallback(
    async (currentTarget: string) => {
      const lowerTarget = currentTarget.toLowerCase();
      if (advancedTargetsRef.current.has(lowerTarget)) return;
      advancedTargetsRef.current.add(lowerTarget);

      const nextTarget = getNextCurriculumTarget(lowerTarget);

      // Freeze snapshot of the target that just achieved 100%
      const stat = liveTargetStatRef.current || keyStatuses?.find((s) => s.key.toLowerCase() === lowerTarget);
      const snapshot = createMasteryGateSnapshot(lowerTarget, stat, nextTarget || undefined);
      snapshot.achieved = true;
      snapshot.percentage = 100;
      frozenGateSnapshotRef.current = snapshot;

      if (!nextTarget) {
        // After 'j': curriculum complete state
        if (milestoneTimeoutRef.current) clearTimeout(milestoneTimeoutRef.current);
        setMilestoneToast({ unlockedKey: "j", isComplete: true });
        milestoneTimeoutRef.current = setTimeout(() => {
          setMilestoneToast(null);
        }, 3500);
        return;
      }

      // 1. Unlock the next letter in the curriculum order and make it the new target
      lessonActiveTargetRef.current = nextTarget;
      setActiveTargetKey(nextTarget);

      // 2. Update keyboard strip and target chip immediately
      const currentStatuses = keyStatuses || [];
      const updatedStatuses: KeyStatus[] = currentStatuses.map((s) => {
        if (s.key.toLowerCase() === lowerTarget) {
          return { ...s, status: "mastered" as const, confidence: 100, bestSpeedConfidence: 1.0 };
        }
        if (s.key.toLowerCase() === nextTarget.toLowerCase()) {
          return { ...s, status: "active" as const };
        }
        return s;
      });
      if (!updatedStatuses.some((s) => s.key.toLowerCase() === nextTarget.toLowerCase())) {
        updatedStatuses.push({
          key: nextTarget,
          confidence: 0,
          emaFlightMs: 350,
          attempts: 0,
          errors: 0,
          status: "active",
        });
      }
      onTargetUnlock?.(nextTarget, updatedStatuses);

      // Initialize live stat for the new target
      liveTargetStatRef.current = {
        key: nextTarget,
        confidence: 0,
        emaFlightMs: 350,
        attempts: 0,
        errors: 0,
        status: "active",
      };

      // 3. Regenerate only UPCOMING words using new target and 80% rule
      const currIdx = currentWordIdxRef.current;
      const allowedLetters = getAllowedLettersForTarget(nextTarget);
      setWords((prevWords) => {
        const typedOrCurrent = prevWords.slice(0, currIdx + 1);
        const upcomingCount = Math.max(10, prevWords.length - (currIdx + 1));
        const newUpcoming = generateLearnBatch(
          allowedLetters,
          nextTarget,
          upcomingCount,
          Math.random,
          typedOrCurrent
        );
        return [...typedOrCurrent, ...newUpcoming];
      });

      // 4. Show milestone as a small non-blocking toast
      if (milestoneTimeoutRef.current) clearTimeout(milestoneTimeoutRef.current);
      setMilestoneToast({ unlockedKey: nextTarget });
      milestoneTimeoutRef.current = setTimeout(() => {
        setMilestoneToast(null);
      }, 3500);

      // 5. Persist the new unlocked state through the backend with raw SQL
      try {
        await fetch("/api/learn/advance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            track: learnTrack || "phonetic_unlock",
            target: lowerTarget,
            newTarget: nextTarget,
          }),
        });
      } catch (err) {
        console.error("Failed to persist target advance", err);
      }
    },
    [keyStatuses, onTargetUnlock, learnTrack]
  );

  // Sync liveTargetStatRef and evaluate gate at start
  useEffect(() => {
    if (mode !== "learn") return;
    const target = (lessonActiveTargetRef.current || activeTargetKey || "s").toLowerCase();
    const stat = keyStatuses?.find((s) => s.key.toLowerCase() === target);
    if (stat) {
      liveTargetStatRef.current = { ...stat };
    } else {
      liveTargetStatRef.current = {
        key: target,
        confidence: 0,
        emaFlightMs: 350,
        attempts: 0,
        errors: 0,
        status: "active",
      };
    }
    // Advance on first evaluation if already achieved (blocked if stopOnError is letter)
    if (stopOnErrorRef.current !== "letter" && isGateAchieved(liveTargetStatRef.current) && !advancedTargetsRef.current.has(target)) {
      triggerAutoAdvance(target);
    }
  }, [keyStatuses, activeTargetKey, mode, triggerAutoAdvance]);

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
    if (mode !== "time") {
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
    } else {
      const orig = currentWords[activeWordIdx] || "";
      if (orig.length > activeInput.length) {
        missed += orig.length - activeInput.length;
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

    const activeTarget = (lessonActiveTargetRef.current || "s").toLowerCase();
    const stat = liveTargetStatRef.current || keyStatuses?.find((s) => s.key.toLowerCase() === activeTarget);
    if (!frozenGateSnapshotRef.current) {
      frozenGateSnapshotRef.current = createMasteryGateSnapshot(
        activeTarget,
        stat,
        getNextCurriculumTarget(activeTarget) || undefined
      );
    }
    const gateSnapshot = frozenGateSnapshotRef.current;
    if (stopOnErrorRef.current === "letter" && gateSnapshot) {
      gateSnapshot.achieved = false;
    }

    // Both drill pool and missed words list on results screen must be the same list
    const finalMissedWords = Array.from(new Set(missedWordsSet.current));

    try {
      const res = await fetch("/api/learn/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track: learnTrack || "phonetic_unlock",
          activeTarget: gateSnapshot.target,
          durationSeconds: Math.max(1.0, duration),
          keystrokes: learnKeystrokesRef.current,
          repairedWords: Array.from(repairedWordsSet.current),
          missedWords: finalMissedWords,
          gateSnapshot,
        }),
      });

      if (res.ok) {
        const delta: MasteryDeltaReport = await res.json();
        delta.gateSnapshot = gateSnapshot;
        if (gateSnapshot.achieved) {
          delta.passedGate = true;
          delta.unlockedNewTarget = true;
          delta.newActiveTarget = gateSnapshot.advancingToToken || delta.newActiveTarget;
          delta.newConfidence = 100;
        }
        delta.missedWords = finalMissedWords;
        onLearnFinish?.(delta);
        return;
      }
    } catch (e) {
      console.error("Failed to submit learn telemetry", e);
    }

    // Fallback to legacy finish
    finalizeTest();
  }, [learnTrack, onLearnFinish, finalizeTest, keyStatuses]);

  const finalizeTestRef = useRef(finalizeTest);
  useEffect(() => {
    finalizeTestRef.current = finalizeTest;
  }, [finalizeTest]);

  // Start Interleaved Neural Lock-In Drill
  const startLockInDrill = useCallback(() => {
    // Both drill pool and missed words list on results screen are the exact same list
    const targetWords = Array.from(new Set(missedWordsSet.current));
    if (targetWords.length === 0) {
      finalizeLearnTest();
      return;
    }

    const state = initDrillState(targetWords, words);
    drillStateRef.current = state;
    drillQueueRef.current = state.queue;
    drillCleanCountsRef.current = state.cleanCounts;

    setDrillTargetWords(state.targetWords);
    setDrillCleanCounts(state.cleanCounts);
    setDrillQueue(state.queue);
    setInLockInDrill(true);
    currentInputRef.current = "";
    setCurrentInput("");
  }, [words, finalizeLearnTest]);

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

    // Reset drill and learn telemetry
    setInLockInDrill(false);
    setDrillQueue([]);
    drillQueueRef.current = [];
    drillStateRef.current = null;
    frozenGateSnapshotRef.current = null;
    setDrillTargetWords([]);
    setDrillCleanCounts({});
    drillCleanCountsRef.current = {};
    drillCandidatePoolRef.current = [];
    repairQueueRef.current = [];
    repairedWordsSet.current.clear();
    missedWordsSet.current.clear();
    firstAttemptKeyIndices.current.clear();
    learnKeystrokesRef.current = [];
    advancedTargetsRef.current.clear();
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

    const activeTarget = focusKey || (keyStatuses?.find((s) => s.status === "active")?.key) || lessonActiveTargetRef.current;
    requestWordBatch({ mode, tier, learnTrack, focusKey: activeTarget, count }).then((batch) => {
      if (cancelled) return;
      if (batch.activeTarget) {
        lessonActiveTargetRef.current = batch.activeTarget;
        setActiveTargetKey(batch.activeTarget);
      }
      if (batch.isPatternDrill !== undefined) {
        setIsPatternDrill(batch.isPatternDrill);
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
    const activeTarget = lessonActiveTargetRef.current || focusKey || "s";
    requestWordBatch({ mode, tier, learnTrack, focusKey: activeTarget, count: 100, recent: recentWords })
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

    const activeWordIdx = currentWordIdxRef.current;
    const currentWordEl = wordsWrapperRef.current.querySelector(
      `[data-word-idx="${activeWordIdx}"]`
    ) as HTMLElement | null;

    if (!currentWordEl) return;

    const wrapperEl = wordsWrapperRef.current;
    const wrapperRect = wrapperEl.getBoundingClientRect();

    // Dynamically measure line pitch (vertical step between rows) from rendered word elements in DOM
    const allWordEls = wrapperEl.querySelectorAll<HTMLElement>("[data-word-idx]");
    let linePitch = 0;
    const firstLineTop = allWordEls.length > 0 ? allWordEls[0].offsetTop : 0;

    for (let i = 1; i < allWordEls.length; i++) {
      const topDiff = allWordEls[i].offsetTop - firstLineTop;
      if (topDiff > 8) {
        linePitch = topDiff;
        break;
      }
    }

    if (linePitch <= 0) {
      const computed = window.getComputedStyle(wrapperEl);
      const compLineHeight = parseFloat(computed.lineHeight) || currentWordEl.offsetHeight || 56;
      const rowGap = parseFloat(computed.rowGap) || 4;
      linePitch = compLineHeight + rowGap;
    }

    if (linePitch > 0 && Math.abs(linePitch - measuredLineHeight) > 1) {
      setMeasuredLineHeight(linePitch);
    }

    // Determine current active line index
    const lineIndex = Math.max(0, Math.round((currentWordEl.offsetTop - firstLineTop) / linePitch));

    // Target row positioning:
    // - 2-line mode: Active line is pinned to first row (row 0), fully opaque and never masked.
    // - 3-line and 4-line modes: Active line sits in the vertical middle (row 1).
    // Lines already typed scroll out upward; upcoming lines sit below active line.
    const targetRow = lineCount === 2 ? 0 : 1;
    const scrollLines = Math.max(0, lineIndex - targetRow);
    setViewportTranslateY(-scrollLines * linePitch);

    // Precise Caret coordinates directly measured from DOM glyph elements
    const charElements = currentWordEl.querySelectorAll<HTMLElement>("[data-char-idx]");
    const inputLen = currentInputRef.current.length;

    let targetCharRect: DOMRect | null = null;
    let isAfterChar = false;

    if (inputLen < charElements.length) {
      const activeCharEl = charElements[inputLen];
      if (activeCharEl) {
        targetCharRect = activeCharEl.getBoundingClientRect();
      }
    } else if (charElements.length > 0) {
      const lastCharEl = charElements[charElements.length - 1];
      targetCharRect = lastCharEl.getBoundingClientRect();
      isAfterChar = true;
    }

    if (targetCharRect) {
      const charX = isAfterChar
        ? targetCharRect.right - wrapperRect.left
        : targetCharRect.left - wrapperRect.left;
      const charY = targetCharRect.top - wrapperRect.top;
      const charHeight = targetCharRect.height;

      // Vertically center caret on active glyphs, fully covering active line glyph height
      const caretHeight = Math.max(24, Math.round(charHeight * 0.76));
      const caretY = charY + Math.round((charHeight - caretHeight) / 2);

      setCaretPos({
        x: charX,
        y: caretY,
        height: caretHeight,
        width: targetCharRect.width || 14,
        visible: true,
      });
    } else {
      const wordRect = currentWordEl.getBoundingClientRect();
      const wordY = wordRect.top - wrapperRect.top;
      const wordHeight = wordRect.height;
      const caretHeight = Math.max(24, Math.round(wordHeight * 0.76));
      const caretY = wordY + Math.round((wordHeight - caretHeight) / 2);
      const avgCharWidth = Math.round(wordRect.width / Math.max(1, (wordsRef.current[currentWordIdxRef.current] || "").length)) || 14;

      setCaretPos({
        x: wordRect.left - wrapperRect.left,
        y: caretY,
        height: caretHeight,
        width: avgCharWidth,
        visible: true,
      });
    }
  }, [words, lineCount, measuredLineHeight]);

  // Re-measure and update caret/scroll when font size changes with zero layout shift
  useEffect(() => {
    updateCaretAndScroll();
  }, [settings.fontSize, updateCaretAndScroll]);

  useIsomorphicLayoutEffect(() => {
    updateCaretAndScroll();
  }, [updateCaretAndScroll, currentWordIdx, currentInput]);

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
      const currentWord = drillQueue[0]?.word || "";
      const nextChar = currentWord[currentInput.length] || " ";
      onNextCharChange?.(nextChar, lastTypedCharRef.current);
    } else if (words.length > 0 && currentWordIdx < words.length) {
      const currentWord = words[currentWordIdx] || "";
      const nextChar = currentWord[currentInput.length] || " ";
      onNextCharChange?.(nextChar, lastTypedCharRef.current);
    }
  }, [inLockInDrill, drillQueue, words, currentWordIdx, currentInput, onNextCharChange]);

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

  // Handle typing input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = performance.now();
    const flightMs = lastKeyTimeRef.current > 0 ? Math.round(now - lastKeyTimeRef.current) : 120;

    // ── Phase 2: Neural Lock-In Drill Specific Handling ─────────────────────
    if (inLockInDrill) {
      if (e.key === "Escape") {
        e.preventDefault();
        finalizeLearnTest();
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        if (onKeyDelete) onKeyDelete();
        else onKeyClick();
        if (currentInputRef.current.length > 0) {
          const nextInput = currentInputRef.current.slice(0, -1);
          currentInputRef.current = nextInput;
          setCurrentInput(nextInput);
        }
        return;
      }

      const currentItem = drillQueueRef.current[0];
      if (!currentItem || (drillStateRef.current && drillStateRef.current.isComplete)) {
        finalizeLearnTest();
        return;
      }

      const applyDrillOutcome = (outcome: "clean" | "mistake") => {
        if (!drillStateRef.current) return;
        const nextState = recordDrillOutcome(
          drillStateRef.current,
          outcome,
          words
        );
        drillStateRef.current = nextState;
        drillQueueRef.current = nextState.queue;
        drillCleanCountsRef.current = nextState.cleanCounts;

        setDrillQueue(nextState.queue);
        setDrillCleanCounts(nextState.cleanCounts);
        setDrillTargetWords(nextState.targetWords);

        if (outcome === "clean" && (nextState.cleanCounts[currentItem.word] || 0) >= 3) {
          repairedWordsSet.current.add(currentItem.word);
        }

        if (nextState.isComplete || nextState.queue.length === 0) {
          finalizeLearnTest();
          return;
        }

        currentInputRef.current = "";
        setCurrentInput("");
      };

      const handleDrillSuccess = (_item: DrillItem) => {
        onWordComplete();
        applyDrillOutcome("clean");
      };

      const handleDrillMistake = (_item: DrillItem) => {
        setStopErrorFlash(true);
        setTimeout(() => setStopErrorFlash(false), 200);
        onKeyError();
        applyDrillOutcome("mistake");
      };

      if (e.key === " " || e.key === "Space" || e.key === "Enter") {
        e.preventDefault();
        const activeInput = currentInputRef.current;
        if (activeInput === currentItem.word) {
          handleDrillSuccess(currentItem);
        } else {
          handleDrillMistake(currentItem);
        }
        return;
      }

      if (e.key.length === 1) {
        e.preventDefault();
        const char = e.key;
        const target = currentItem.word;
        const activeInput = currentInputRef.current;
        const expectedChar = target[activeInput.length];
        lastTypedCharRef.current = char;

        if (mode === "learn") {
          learnKeystrokesRef.current.push({
            expected: expectedChar || "",
            actual: char,
            flightMs: Math.min(2000, flightMs),
            correct: char === expectedChar,
            isDrill: true,
            isFirstAttempt: false,
          });
        }

        if (char === expectedChar) {
          onKeyClick();
          const nextInput = activeInput + char;
          currentInputRef.current = nextInput;
          setCurrentInput(nextInput);
          if (nextInput === target) {
            handleDrillSuccess(currentItem);
          }
        } else {
          handleDrillMistake(currentItem);
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

    // Handle Ctrl/Cmd combinations (e.g. Ctrl+Backspace to delete whole word)
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "Backspace") {
        e.preventDefault();
        if (errorBehavior === "strict") return;
        if (onKeyDelete) onKeyDelete();
        else onKeyClick();
        currentInputRef.current = "";
        setCurrentInput("");
        return;
      }
      // Let browser shortcuts (Ctrl+R, etc.) work without interference
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

    const activeWordIdx = currentWordIdxRef.current;
    const activeWords = wordsRef.current.length > 0 ? wordsRef.current : words;
    const targetWord = activeWords[activeWordIdx] || "";
    const activeInput = currentInputRef.current;

    // 1. BACKSPACE HANDLER
    if (e.key === "Backspace") {
      e.preventDefault();
      if (errorBehavior === "strict") {
        return;
      }

      if (onKeyDelete) onKeyDelete();
      else onKeyClick();

      if (activeInput.length > 0) {
        const charIdx = activeInput.length - 1;
        if (charIdx < targetWord.length && activeInput[charIdx] !== targetWord[charIdx]) {
          correctedErrorsCount.current++;
        }
        const nextInput = activeInput.slice(0, -1);
        currentInputRef.current = nextInput;
        setCurrentInput(nextInput);
      } else if (activeWordIdx > 0 && errorBehavior === "free" && mode !== "learn") {
        const prevIdx = activeWordIdx - 1;
        const prevTyped = typedWordsRef.current[prevIdx] || "";
        currentWordIdxRef.current = prevIdx;
        currentInputRef.current = prevTyped;
        setCurrentWordIdx(prevIdx);
        setCurrentInput(prevTyped);
        const nextTypedWords = typedWordsRef.current.slice(0, prevIdx);
        typedWordsRef.current = nextTypedWords;
        setTypedWords(nextTypedWords);
        completedWordResults.current = completedWordResults.current.slice(0, prevIdx);
      }
      return;
    }

    // 2. SPACE / WORD ADVANCE HANDLER
    if (e.key === " " || e.key === "Space") {
      e.preventDefault();
      if (activeInput.length === 0) return;

      // In stop mode (word or letter) or if errorBehavior is stop, do not allow skipping unfinished or error words
      const currentStopOnError = stopOnErrorRef.current;
      const isWordBlocked =
        (currentStopOnError === "word" || currentStopOnError === "letter" || errorBehavior === "stop") &&
        activeInput !== targetWord;
      if (isWordBlocked) {
        setStopErrorFlash(true);
        setTimeout(() => setStopErrorFlash(false), 200);
        incorrectKeystrokesCount.current += 1;
        onKeyError();
        return;
      }

      keystrokesInCurrentSecond.current += 1;
      const isCorrect = activeInput === targetWord;

      if (mode === "learn") {
        learnKeystrokesRef.current.push({
          expected: " ",
          actual: " ",
          flightMs: Math.min(1500, flightMs),
          correct: isCorrect,
          isFirstAttempt: true,
          isDrill: false,
        });
        if (!isCorrect) {
          missedWordsSet.current.add(targetWord);
          if (!repairQueueRef.current.includes(targetWord)) {
            repairQueueRef.current.push(targetWord);
          }
        }
      }

      completedWordResults.current.push({
        original: targetWord,
        typed: activeInput,
      });

      if (!isCorrect) {
        incorrectKeystrokesCount.current += 1;
        const currentElapsed = startTimeRef.current
          ? Math.floor((performance.now() - startTimeRef.current) / 1000)
          : 0;
        errorSeconds.current.add(currentElapsed + 1);
        onKeyError();
      } else {
        correctKeystrokesCount.current += 1;
        onWordComplete();
      }

      const nextTypedWords = [...typedWordsRef.current];
      nextTypedWords[activeWordIdx] = activeInput;
      typedWordsRef.current = nextTypedWords;
      setTypedWords(nextTypedWords);

      const nextWordIdx = activeWordIdx + 1;

      if (mode === "words" && nextWordIdx >= wordsOption) {
        currentInputRef.current = "";
        setCurrentInput("");
        finalizeTest();
        return;
      }

      if (mode === "learn" && nextWordIdx >= activeWords.length) {
        if (repairQueueRef.current.length > 0) {
          startLockInDrill();
          return;
        } else {
          finalizeLearnTest();
          return;
        }
      }

      currentWordIdxRef.current = nextWordIdx;
      currentInputRef.current = "";
      setCurrentWordIdx(nextWordIdx);
      setCurrentInput("");

      const nextTarget = activeWords[nextWordIdx] || "";
      onNextCharChange?.(nextTarget[0] || " ", " ");
      return;
    }

    // 3. REGULAR CHARACTER HANDLER
    if (e.key.length === 1) {
      e.preventDefault();
      const char = e.key;
      const expectedChar = targetWord[activeInput.length];
      lastTypedCharRef.current = char;

      keystrokesInCurrentSecond.current += 1;
      const isCharCorrect = char === expectedChar;

      if (mode === "learn") {
        const charKey = `${activeWordIdx}:${activeInput.length}`;
        const isFirstAttempt = !firstAttemptKeyIndices.current.has(charKey);
        firstAttemptKeyIndices.current.add(charKey);

        learnKeystrokesRef.current.push({
          expected: expectedChar || "",
          actual: char,
          flightMs: Math.min(2000, flightMs),
          correct: isCharCorrect,
          isFirstAttempt,
          isDrill: false,
        });

        const targetLetter = lessonActiveTargetRef.current.toLowerCase();
        const isTargetChar = Boolean(expectedChar && expectedChar.toLowerCase() === targetLetter);
        if (!isCharCorrect) {
          missedWordsSet.current.add(targetWord);
          if (!repairQueueRef.current.includes(targetWord)) {
            repairQueueRef.current.push(targetWord);
          }
        }

        if (isTargetChar) {
          const stat = liveTargetStatRef.current || {
            key: targetLetter,
            confidence: 0,
            emaFlightMs: 350,
            attempts: 0,
            errors: 0,
            status: "active",
          };
          stat.attempts = (stat.attempts || 0) + 1;
          stat.samples = (stat.samples || 0) + 1;
          if (isFirstAttempt) {
            stat.firstAttemptAttempts = (stat.firstAttemptAttempts || 0) + 1;
          }
          if (isCharCorrect) {
            const TARGET_TIME_MS = 342.86; // 35 WPM
            const curFlight = Math.min(2000, flightMs);
            stat.bestFlightMs =
              stat.bestFlightMs && stat.bestFlightMs > 0
                ? Math.min(stat.bestFlightMs, curFlight)
                : curFlight;
            stat.bestSpeedConfidence = TARGET_TIME_MS / stat.bestFlightMs;
            stat.confidence = Math.min(100, Math.round(stat.bestSpeedConfidence * 100));
          } else {
            stat.errors = (stat.errors || 0) + 1;
            if (isFirstAttempt) {
              stat.firstAttemptErrors = (stat.firstAttemptErrors || 0) + 1;
            }
          }
          liveTargetStatRef.current = stat;

          // Single source of truth gate check (blocked if stopOnError is letter)
          if (stopOnErrorRef.current !== "letter" && isGateAchieved(stat) && !advancedTargetsRef.current.has(targetLetter)) {
            triggerAutoAdvance(targetLetter);
          }
        }
      }

      // Handle "Stop on Error = letter" mode: reject incorrect keystrokes immediately
      const currentStopOnError = stopOnErrorRef.current;
      const isLetterBlocked =
        (currentStopOnError === "letter" || errorBehavior === "stop") && !isCharCorrect;
      if (isLetterBlocked) {
        setStopErrorFlash(true);
        setTimeout(() => setStopErrorFlash(false), 200);
        incorrectKeystrokesCount.current += 1;
        const currentElapsed = startTimeRef.current
          ? Math.floor((performance.now() - startTimeRef.current) / 1000)
          : 0;
        errorSeconds.current.add(currentElapsed + 1);
        onKeyError();
        return;
      }

      // Free Flow & Strict mode
      if (isCharCorrect) {
        correctKeystrokesCount.current += 1;
        onKeyClick();
      } else {
        incorrectKeystrokesCount.current += 1;
        const currentElapsed = startTimeRef.current
          ? Math.floor((performance.now() - startTimeRef.current) / 1000)
          : 0;
        errorSeconds.current.add(currentElapsed + 1);
        if (activeInput.length >= targetWord.length) {
          extraKeystrokesCount.current += 1;
        }
        onKeyError();
      }

      const nextInput = activeInput + char;
      if (nextInput.length <= targetWord.length + 10) {
        currentInputRef.current = nextInput;
        setCurrentInput(nextInput);
      }

      const nextExpected = targetWord[nextInput.length] || " ";
      onNextCharChange?.(nextExpected, char);

      if (
        mode === "words" &&
        activeWordIdx === wordsOption - 1 &&
        nextInput === targetWord
      ) {
        finalizeTest();
        return;
      }

      if (
        mode === "learn" &&
        activeWordIdx === activeWords.length - 1 &&
        nextInput === targetWord
      ) {
        if (repairQueueRef.current.length > 0) {
          startLockInDrill();
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
            <span>NEURAL LOCK-IN DRILL · INTERLEAVED ACTIVE RECALL · 3 CLEAN PASSES TO MASTER</span>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono-custom text-[var(--inactive-color)]">
            <span className="opacity-90 font-medium">
              Mastered {drillTargetWords.filter((w) => (drillCleanCounts[w] || 0) >= 3).length} of {drillTargetWords.length} words
            </span>
            {drillQueue[0]?.isPadding ? (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[var(--inactive-color)] opacity-80 font-mono-custom">
                Practice Buffer
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((pip) => {
                  const currentWordText = drillQueue[0]?.word || "";
                  const count = drillCleanCounts[currentWordText] || 0;
                  return (
                    <span
                      key={pip}
                      className={`inline-block w-2.5 h-2.5 rounded-full transition-all duration-200 ${
                        pip < count
                          ? "bg-[var(--accent-color)] shadow-[0_0_8px_var(--accent-color)] scale-110"
                          : "bg-white/15 border border-white/20"
                      }`}
                    />
                  );
                })}
              </div>
            )}
            <button
              onClick={() => finalizeLearnTest()}
              className="ml-2 text-[11px] text-[var(--inactive-color)] opacity-70 hover:opacity-100 hover:text-[var(--accent-color)] transition-opacity underline cursor-pointer"
            >
              Skip Drill (Esc)
            </button>
          </div>
          <span className="text-[10px] text-[var(--inactive-color)] opacity-50 tracking-wide">
            Words are mixed together · 3 clean passes per word required · Mistakes push word back
          </span>
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
              {currentWordIdx < Math.max(1, Math.floor(words.length / 5))
                ? "Phase A · Flow Warm-Up"
                : currentWordIdx < Math.floor((words.length * 4) / 5)
                ? "Phase B · Target Drill"
                : "Phase C · Cadence Lock"}
            </span>
            <div className="flex items-center gap-1.5 ml-1">
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-color)] opacity-40 font-mono-custom">
                Target:
              </span>
              <span data-testid="target-chip" className="px-2 py-0.5 rounded text-xs font-mono-custom font-bold bg-[var(--accent-color)]/10 text-[var(--accent-color)] border border-[var(--accent-color)]/25">
                {activeTargetKey.toUpperCase()}
              </span>
            </div>
            {isPatternDrill && (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold font-mono-custom">
                Pattern Drill
              </span>
            )}
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
        <div className="w-full h-[168px] flex flex-col items-center justify-center text-center arena-mask py-1 select-none">
          <div data-testid="drill-active-word" className="text-4xl sm:text-5xl font-mono-custom tracking-wider flex items-center justify-center gap-1 mb-3">
            {(drillQueue[0]?.word || "").split("").map((targetChar, cIdx) => {
              let charColor = "var(--untyped-color)";
              let charOpacity: number | string = "var(--untyped-opacity)";
              let borderClass = "border-transparent";
              if (cIdx < currentInput.length) {
                const typedChar = currentInput[cIdx];
                if (typedChar === targetChar) {
                  charColor = "var(--correct-color, #22c55e)";
                  charOpacity = 1.0;
                  borderClass = "border-transparent";
                } else {
                  charColor = "var(--error-color)";
                  charOpacity = 1.0;
                  borderClass = "border-[var(--error-color)]";
                }
              } else if (cIdx === currentInput.length) {
                charColor = "var(--untyped-active)";
                charOpacity = 0.85;
                borderClass = "border-[var(--accent-color)]";
              }
              return (
                <span
                  key={cIdx}
                  style={{ color: charColor, opacity: charOpacity }}
                  className={`inline-block border-b-2 ${borderClass}`}
                >
                  {targetChar}
                </span>
              );
            })}
          </div>
          <p className="text-xs font-mono-custom text-[var(--inactive-color)] opacity-70">
            Words are mixed. Type each missed word cleanly 3 times to master.
          </p>
        </div>
      ) : (
        <div
          style={{
            height: `${lineCount * measuredLineHeight}px`,
            maskImage:
              lineCount === 2
                ? viewportTranslateY < 0
                  ? "linear-gradient(to bottom, transparent 0%, black 8px, black 52%, rgba(0,0,0,0.35) 85%, transparent 100%)"
                  : "linear-gradient(to bottom, black 0%, black 52%, rgba(0,0,0,0.35) 85%, transparent 100%)"
                : viewportTranslateY < 0
                ? "linear-gradient(to bottom, transparent 0%, black 15%, black 65%, rgba(0,0,0,0.35) 88%, transparent 100%)"
                : "linear-gradient(to bottom, black 0%, black 65%, rgba(0,0,0,0.35) 88%, transparent 100%)",
            WebkitMaskImage:
              lineCount === 2
                ? viewportTranslateY < 0
                  ? "linear-gradient(to bottom, transparent 0%, black 8px, black 52%, rgba(0,0,0,0.35) 85%, transparent 100%)"
                  : "linear-gradient(to bottom, black 0%, black 52%, rgba(0,0,0,0.35) 85%, transparent 100%)"
                : viewportTranslateY < 0
                ? "linear-gradient(to bottom, transparent 0%, black 15%, black 65%, rgba(0,0,0,0.35) 88%, transparent 100%)"
                : "linear-gradient(to bottom, black 0%, black 65%, rgba(0,0,0,0.35) 88%, transparent 100%)",
          }}
          className="w-full overflow-hidden relative py-1"
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
              fontSize: "var(--typing-font-size, 1.5rem)",
            }}
            className={`w-full flex flex-wrap gap-x-4 gap-y-1 leading-[1.75] tracking-tight font-mono-custom relative ${
              !isFocused ? "opacity-30" : "opacity-100"
            } transition-opacity duration-300`}
          >
            {/* ── Caret ── */}
            {caretPos.visible && (
              <motion.div
                animate={{
                  left: caretPos.x,
                  top:
                    settings.caretStyle === "underline"
                      ? caretPos.y + caretPos.height - 3
                      : caretPos.y,
                  height:
                    settings.caretStyle === "underline"
                      ? 3
                      : caretPos.height,
                  width:
                    settings.caretStyle === "line"
                      ? 2.5
                      : Math.max(12, caretPos.width || 14),
                }}
                transition={
                  settings.smoothCaret
                    ? {
                        left: { type: "spring", stiffness: 600, damping: 38, mass: 0.1 },
                        top: { duration: 0.12, ease: "easeOut" },
                        height: { duration: 0.05 },
                        width: { duration: 0.05 },
                      }
                    : { duration: 0 }
                }
                style={
                  stopErrorFlash
                    ? {
                        boxShadow: "0 0 12px 4px #e06c75",
                        backgroundColor: "#e06c75",
                        transition: "box-shadow 0.1s, background-color 0.1s",
                      }
                    : {
                        ...caretGlowStyle,
                        opacity:
                          settings.caretStyle === "block"
                            ? 0.45
                            : (caretGlowStyle.opacity ?? 1),
                      }
                }
                className={`absolute z-20 pointer-events-none ${
                  settings.caretStyle === "block" ? "rounded-xs" : "rounded-full"
                } ${
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
                  targetKey={mode === "learn" ? activeTargetKey : undefined}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Milestone Toast (non-blocking, pointer-events-none, auto-dismiss) */}
      {milestoneToast && (
        <div data-testid="milestone-toast" className="fixed top-6 right-6 z-50 pointer-events-none flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-[var(--surface-color)]/95 backdrop-blur-md border border-[var(--accent-color)]/50 text-[var(--accent-color)] text-xs font-mono-custom shadow-[0_4px_24px_rgba(0,0,0,0.6)] animate-in fade-in slide-in-from-top-2 duration-300">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-color)] animate-ping" />
          <span className="font-semibold tracking-wide">
            {milestoneToast.isComplete
              ? "Curriculum Complete! All 26 letters unlocked."
              : `Milestone: Key [ ${milestoneToast.unlockedKey.toUpperCase()} ] Unlocked!`}
          </span>
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
