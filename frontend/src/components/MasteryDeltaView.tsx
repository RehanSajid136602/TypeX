"use client";

import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Trophy, Sparkles, AlertTriangle } from "lucide-react";
import { MasteryDeltaReport, FingerStat } from "@/types/typing";

interface MasteryDeltaViewProps {
  delta: MasteryDeltaReport;
  fingerStats?: Record<string, FingerStat>;
  onContinue: () => void;
}

export const MasteryDeltaView: React.FC<MasteryDeltaViewProps> = ({
  delta,
  fingerStats = {},
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="w-full max-w-4xl mx-auto px-6 py-4 flex flex-col gap-6 select-none font-mono-custom"
    >
      {/* Unlock Milestone Banner if achieved */}
      {delta.unlockedNewTarget ? (
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
                Reached 35 WPM target speed with &ge; 95% accuracy. Advancing to next token: [ <span className="font-bold text-[var(--accent-color)] uppercase">{delta.newActiveTarget}</span> ]
              </div>
            </div>
          </div>
          <Sparkles className="w-5 h-5 text-[var(--accent-color)] opacity-70" />
        </motion.div>
      ) : delta.passedGate === false ? (
        <div className="w-full p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs font-mono-custom text-amber-200">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Target gate requires 35 WPM target speed with &ge; 95.0% accuracy (achieved:{" "}
              <strong className="text-white font-bold">{delta.targetAccuracy ?? 0}%</strong> across{" "}
              <strong className="text-white font-bold">{delta.targetAttempts ?? 0}</strong>/20 strokes). Keep practicing to unlock next key!
            </span>
          </div>
        </div>
      ) : null}

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
            <span className="text-4xl md:text-5xl font-light text-[var(--accent-color)] tabular-nums">
              {Math.min(100, Math.round(delta.newConfidence))}%
            </span>
            <span
              className={`text-sm font-medium ${
                delta.passedGate
                  ? "text-emerald-400"
                  : "text-[#e06c75]"
              }`}
            >
              {delta.passedGate ? "TARGET REACHED" : "PRACTICING"}
            </span>
          </div>

          <div className="text-xs text-[var(--inactive-color)] opacity-75">
            Target Keystrokes: <span className="tabular-nums font-medium text-[var(--typed-color)]">{delta.targetAttempts ?? 0} / 20</span>
            {delta.targetAccuracy !== undefined && (
              <span className="ml-3">Accuracy: <span className="tabular-nums font-medium text-[var(--typed-color)]">{delta.targetAccuracy}%</span></span>
            )}
          </div>
        </div>

        {/* Progress Bar with 100% Target Marker */}
        <div className="w-full relative py-1">
          <div className="w-full h-2.5 rounded-full bg-white/[0.06] overflow-hidden relative">
            <motion.div
              initial={{ width: `${Math.min(100, delta.previousConfidence)}%` }}
              animate={{ width: `${Math.min(100, delta.newConfidence)}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-[var(--accent-secondary)] to-[var(--accent-color)] shadow-[0_0_8px_var(--accent-glow)]"
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
          {delta.weakestFinger && (
            <span className="flex items-center gap-1.5 text-[11px] text-[#e06c75] opacity-90">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Weakest: {delta.weakestFinger.finger} ({delta.weakestFinger.avgMs}ms)</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-8 gap-2 pt-2">
          {fingerOrder.map((f, idx) => {
            const stat = fingerStats[f.id];
            const avgMs = stat ? stat.avgMs : delta.weakestFinger?.finger === f.id ? delta.weakestFinger.avgMs : 185;
            const isWeakest = delta.weakestFinger?.finger === f.id;
            // Height ratio: 100ms -> 30%, 250ms -> 100%
            const heightPercent = Math.min(100, Math.max(25, ((avgMs - 80) / 180) * 100));

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
                        : avgMs < 140
                        ? "bg-[var(--accent-color)]"
                        : "bg-slate-400 opacity-60"
                    }`}
                  />
                </div>
                <span className="text-[10px] text-[var(--typed-color)] font-medium tabular-nums">
                  {Math.round(avgMs)}ms
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
          {delta.sfbBottlenecks && delta.sfbBottlenecks.length > 0 ? (
            <div className="flex flex-col gap-1.5 mt-1">
              {delta.sfbBottlenecks.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded bg-white/[0.03] border border-white/[0.04]"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--typed-color)]">{item.bigram}</span>
                    <span className="text-[10px] text-[var(--inactive-color)] opacity-50">jump</span>
                  </div>
                  <span className="text-xs text-[var(--accent-color)] font-medium tabular-nums">
                    {Math.round(item.avgMs)}ms
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[var(--inactive-color)] opacity-60 py-3 text-center">
              ✓ Fluid transitions (SFB latency within threshold)
            </div>
          )}
        </div>
      </div>

      {/* Missed Words Section */}
      {delta.missedWords && delta.missedWords.length > 0 && (
        <div className="rounded-xl bg-white/[0.015] border border-white/[0.05] p-4 flex flex-col gap-2">
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
