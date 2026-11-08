"use client";

import React, { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Trophy, Sparkles, AlertTriangle } from "lucide-react";
import { MasteryDeltaReport, FingerStat, MIN_TARGET_ATTEMPTS } from "@/types/typing";
import {
  FINGER_LABELS,
  computeFingerLatency,
  computeSfbStats,
  describeBigram,
  TOP_SFB_LIMIT,
  MIN_SAMPLES as MIN_SFB_SAMPLES,
  PAUSE_CAP_MS as SFB_PAUSE_CAP_MS,
} from "@/utils/sfbStats";

interface MasteryDeltaViewProps {
  delta: MasteryDeltaReport;
  fingerStats?: Record<string, FingerStat>;
  /** Raw learn-mode keystroke log; source of truth for SFB + finger latency. */
  keystrokes?: readonly FlightKeystrokeLike[];
  onContinue: () => void;
}

type FlightKeystrokeLike = {
  expected: string;
  actual?: string;
  flightMs: number;
  correct: boolean;
  isDrill?: boolean;
  corrected?: boolean;
};

export const MasteryDeltaView: React.FC<MasteryDeltaViewProps> = ({
  delta,
  fingerStats = {},
  keystrokes,
  onContinue,
}) => {
  // Listen for Enter / Space key to fast forward to next lesson
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onContinue();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onContinue]);

  // The gate is met at the target speed; snapshot is the single frozen source of truth
  const snapshot = delta.gateSnapshot;
  const gateAchieved = snapshot
    ? snapshot.achieved
    : delta.passedGate === true || delta.unlockedNewTarget === true;
  const targetStrokes = snapshot
    ? snapshot.keystrokesDone
    : Math.min(MIN_TARGET_ATTEMPTS, delta.targetAttempts ?? 0);
  const targetRequired = snapshot
    ? snapshot.keystrokesRequired
    : MIN_TARGET_ATTEMPTS;
  const targetAccuracy = snapshot
    ? snapshot.accuracy
    : delta.targetAccuracy ?? 100;
  const gatePercent = gateAchieved
    ? 100
    : snapshot
    ? Math.min(99, Math.max(0, Math.round(snapshot.percentage)))
    : Math.min(99, Math.max(0, Math.round(delta.newConfidence)));
  const advancingToken = snapshot?.advancingToToken || delta.newActiveTarget;

  const fingerOrder = [
    { id: "L_PINKY", label: "L-PK", hand: "L" },
    { id: "L_RING", label: "L-RG", hand: "L" },
    { id: "L_MIDDLE", label: "L-MD", hand: "L" },
    { id: "L_INDEX", label: "L-IX", hand: "L" },
    { id: "R_INDEX", label: "R-IX", hand: "R" },
    { id: "R_MIDDLE", label: "R-MD", hand: "R" },
    { id: "R_RING", label: "R-RG", hand: "R" },
    { id: "R_PINKY", label: "R-PK", hand: "R" },
  ];

  // A finger only has data once it has actually struck a key; the engine
  // pre-seeds every finger with a placeholder latency, so keystrokes decide.
  // Both cards read the same filtered flight-time samples: clean key-to-key
  // transitions inside a word, pauses above the cap dropped, median per bucket.
  const hasKeystrokes = Boolean(keystrokes && keystrokes.length > 0);
  const medians = useMemo(
    () => (hasKeystrokes ? computeFingerLatency(keystrokes!) : {}),
    [keystrokes, hasKeystrokes]
  );

  const fingerRows = fingerOrder.map((f) => {
    // Without a keystroke log (query refetch path) fall back to engine stats.
    const median = medians[f.id];
    if (median) {
      return { ...f, hasData: true, avgMs: median.medianMs, samples: median.samples };
    }
    const stat = fingerStats[f.id];
    const fallback = hasKeystrokes ? 0 : stat?.avgMs ?? 0;
    return {
      ...f,
      hasData: !hasKeystrokes && (stat?.keystrokes ?? 0) > 0,
      avgMs: fallback,
      samples: 0,
    };
  });
  const maxAvgMs = fingerRows.reduce(
    (max, f) => (f.hasData ? Math.max(max, f.avgMs) : max),
    0
  );
  const slowestFinger = fingerRows
    .filter((f) => f.hasData)
    .reduce<(typeof fingerRows)[number] | null>(
      (worst, f) => (worst === null || f.avgMs > worst.avgMs ? f : worst),
      null
    );
  const weakestWithData = Boolean(slowestFinger);

  // SFB rows: same helper rules, slowest first, top 3, minimum sample count.
  const sfbRows = useMemo(() => {
    if (!hasKeystrokes) return delta.sfbBottlenecks ?? [];
    return computeSfbStats(keystrokes!).slice(0, TOP_SFB_LIMIT);
  }, [keystrokes, hasKeystrokes, delta.sfbBottlenecks]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="w-full max-w-4xl mx-auto px-6 py-4 flex flex-col gap-6 select-none font-mono-custom"
    >
      {/* Unlock Milestone Banner if achieved */}
      {gateAchieved ? (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full p-4 rounded-xl bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/40 flex items-center justify-between shadow-[0_0_20px_var(--accent-glow)]"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--accent-color)]/20 text-[var(--accent-color)]">
              <Trophy className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--accent-color)] tracking-wide uppercase">
                Curriculum Milestone Unlocked!
              </div>
              <div className="text-sm text-[var(--typed-color)]">
                Reached 35 WPM target speed with &ge; 95% accuracy. Advancing to next token: [ <span className="font-bold text-[var(--accent-color)] uppercase">{advancingToken}</span> ]
              </div>
            </div>
          </div>
          <Sparkles className="w-5 h-5 text-[var(--accent-color)] opacity-70" />
        </motion.div>
      ) : (
        <div className="w-full p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs font-mono-custom text-amber-200">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Target gate requires 35 WPM target speed with &ge; 95.0% accuracy (achieved:{" "}
              <strong className="text-white font-bold">{targetAccuracy}%</strong> across{" "}
              <strong className="text-white font-bold">{targetStrokes}</strong>/{targetRequired} strokes). Keep practicing to unlock next key!
            </span>
          </div>
        </div>
      )}

      {/* Hero Mastery Progression Card */}
      <div className="rounded-xl bg-white/[0.015] border border-white/[0.05] p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--inactive-color)] opacity-80 uppercase tracking-wider text-[11px]">
            Target Mastery Gate
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-white/[0.05] text-[var(--accent-color)] font-medium">
            35 WPM TARGET GATE (95% ACCURACY)
          </span>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <span
              className={`text-4xl md:text-5xl font-light tabular-nums ${
                gateAchieved ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {gatePercent}%
            </span>
            <span
              className={`text-sm font-medium ${
                gateAchieved
                  ? "text-emerald-400"
                  : "text-amber-400"
              }`}
            >
              {gateAchieved ? "TARGET REACHED" : "PRACTICING"}
            </span>
          </div>

          <div className="text-xs text-[var(--inactive-color)] opacity-75">
            Target Keystrokes: <span className="tabular-nums font-medium text-[var(--typed-color)]">{targetStrokes} / {targetRequired}</span>
            {targetAccuracy !== undefined && (
              <span className="ml-3">Accuracy: <span className="tabular-nums font-medium text-[var(--typed-color)]">{targetAccuracy}%</span></span>
            )}
          </div>
        </div>

        {/* Progress Bar with 100% Target Marker */}
        <div className="w-full relative py-1">
          <div className="w-full h-2.5 rounded-full bg-white/[0.06] overflow-hidden relative">
            <motion.div
              initial={{ width: `${gateAchieved ? 100 : Math.min(100, delta.previousConfidence)}%` }}
              animate={{ width: `${gateAchieved ? 100 : gatePercent}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className={`h-full rounded-full ${
                gateAchieved
                  ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]"
                  : "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]"
              }`}
            />
          </div>
          {/* 100% Threshold Line */}
          <div
            style={{ left: "100%" }}
            className="absolute top-0 bottom-0 w-0.5 bg-white/40 z-10 -translate-x-full"
            title="35 WPM Target Speed Threshold"
          />
        </div>
      </div>

      {/* 8-Finger Biomechanical Latency Strip */}
      <div className="rounded-xl bg-white/[0.015] border border-white/[0.05] p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--inactive-color)] opacity-80 uppercase tracking-wider text-[11px]">
            8-Finger Latency Telemetry
          </span>
          {weakestWithData && slowestFinger && (
            <span className="flex items-center gap-1.5 text-[11px] text-[#e06c75] opacity-90">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>
                Weakest: {FINGER_LABELS[slowestFinger.id as keyof typeof FINGER_LABELS] ?? slowestFinger.id} (
                {Math.round(slowestFinger.avgMs)}ms)
              </span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-8 gap-2 pt-2">
          {fingerRows.map((f, idx) => {
            const isWeakest = f.hasData && slowestFinger?.id === f.id;
            // Bar height is purely proportional to measured latency: the slowest
            // finger fills the strip, every other finger scales against it.
            const heightPercent =
              f.hasData && maxAvgMs > 0 ? (f.avgMs / maxAvgMs) * 100 : 0;

            return (
              <div
                key={f.id}
                className={`flex flex-col items-center gap-2 p-2 rounded-lg transition-all ${
                  isWeakest
                    ? "bg-[#e06c75]/10 border border-[#e06c75]/30 shadow-[0_0_10px_rgba(224,108,117,0.15)]"
                    : idx === 3
                    ? "bg-white/[0.02] border-r border-white/[0.08]"
                    : "bg-white/[0.02] border border-white/[0.04]"
                }`}
              >
                <div className="h-16 w-full flex items-end justify-center">
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-3 rounded-t-sm transition-all duration-500 ${
                      isWeakest
                        ? "bg-[#e06c75]"
                        : f.avgMs < 140
                        ? "bg-[var(--accent-color)]"
                        : "bg-slate-400 opacity-60"
                    }`}
                  />
                </div>
                <span className="text-[10px] text-[var(--typed-color)] font-medium tabular-nums">
                  {f.hasData ? `${Math.round(f.avgMs)}ms` : "—"}
                </span>
                <span className="text-[9px] text-[var(--inactive-color)] opacity-70 uppercase">
                  {f.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confusion Matrix & SFB Bottlenecks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Confusions */}
        <div className="rounded-xl bg-white/[0.015] border border-white/[0.05] p-4 flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-wider text-[var(--inactive-color)] opacity-80">
            Top Neural Substitutions
          </span>
          {delta.topConfusions && delta.topConfusions.length > 0 ? (
            <div className="flex flex-col gap-1.5 mt-1">
              {delta.topConfusions.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded bg-white/[0.03] border border-white/[0.04]"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#e06c75] uppercase">{item.expected}</span>
                    <span className="text-[var(--inactive-color)] opacity-40">→ typed →</span>
                    <span className="font-semibold text-amber-400 uppercase">{item.actual}</span>
                  </div>
                  <span className="text-[10px] text-[var(--inactive-color)] opacity-70">
                    {item.count} mistype{item.count > 1 ? "s" : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[var(--inactive-color)] opacity-60 py-3 text-center">
              ✓ Clean character accuracy (no prominent substitutions)
            </div>
          )}
        </div>

        {/* SFB Bottlenecks */}
        <div className="rounded-xl bg-white/[0.015] border border-white/[0.05] p-4 flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-wider text-[var(--inactive-color)] opacity-80">
            Same-Finger Bigrams (SFB)
          </span>
          {sfbRows.length > 0 ? (
            <div className="flex flex-col gap-1.5 mt-1">
              {sfbRows.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded bg-white/[0.03] border border-white/[0.04]"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--typed-color)]">{item.bigram}</span>
                    <span className="text-[10px] text-[var(--inactive-color)] opacity-50">
                      {describeBigram(item.bigram)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--inactive-color)] opacity-50 tabular-nums">
                      n={"samples" in item ? item.samples : item.count}
                    </span>
                    <span className="text-xs text-[var(--accent-color)] font-medium tabular-nums">
                      {Math.round("medianMs" in item ? item.medianMs : item.avgMs)}ms
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[var(--inactive-color)] opacity-60 py-3 text-center">
              Not enough clean same-finger transitions yet (needs {MIN_SFB_SAMPLES}+
              per bigram, under a {SFB_PAUSE_CAP_MS}ms pause cap)
            </div>
          )}
        </div>
      </div>

      {/* Missed Words Section */}
      {delta.missedWords && delta.missedWords.length > 0 && (
        <div data-testid="missed-words-section" className="rounded-xl bg-white/[0.015] border border-white/[0.05] p-4 flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-wider text-[var(--inactive-color)] opacity-80">
            Missed Words (Queued for Spaced Repetition)
          </span>
          <div className="flex flex-wrap gap-2 mt-1">
            {delta.missedWords.map((word, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 rounded bg-[#e06c75]/10 border border-[#e06c75]/25 text-[#e06c75] text-xs font-mono-custom"
              >
                {word}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center justify-center gap-4 mt-2">
        <button
          onClick={onContinue}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[var(--accent-color)] text-[var(--bg-color)] font-medium text-xs shadow-[0_0_15px_var(--accent-glow)] hover:opacity-90 transition-all cursor-pointer group"
        >
          <span>Continue to Next Lesson</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          <span className="text-[10px] opacity-75 font-normal ml-1">(Enter)</span>
        </button>
      </div>
    </motion.div>
  );
};
