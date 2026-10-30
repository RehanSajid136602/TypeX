"use client";

import React, { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  TelemetryResult,
  TestMode,
  TimeOption,
  WordsOption,
  DictionaryTier,
  PersonalBest,
  WordResult,
} from "@/types/typing";
import { WpmChart } from "./WpmChart";
import { RotateCcw, Trophy, ChevronRight } from "lucide-react";

interface ResultsCardProps {
  results: TelemetryResult;
  mode: TestMode;
  timeOption: TimeOption;
  wordsOption: WordsOption;
  tier: DictionaryTier;
  errorSeconds: number[];
  onRestart: () => void;
  // Optional props for competition mode
  contestantName?: string;
  department?: string;
  liveRank?: string; // e.g. "#2 of 14"
  customRestartLabel?: string;
  onNext?: () => void;
}

// ─── Per-Character Error Heatmap ─────────────────────────────────────────────

interface CharCellProps {
  targetChar: string;
  typedChar?: string;
  isMissed?: boolean;
}

const CharCell: React.FC<CharCellProps> = ({ targetChar, typedChar, isMissed }) => {
  let bg = "rgba(255,255,255,0.05)";
  let textColor = "var(--inactive-color, #64748B)";
  let title = targetChar;

  if (isMissed) {
    bg = "rgba(100, 100, 106, 0.15)";
    textColor = "var(--inactive-color, #64748B)";
    title = `"${targetChar}" — missed`;
  } else if (typedChar !== undefined) {
    if (typedChar === targetChar) {
      bg = "rgba(100, 200, 150, 0.15)";
      textColor = "rgba(100, 200, 150, 0.9)";
      title = `"${targetChar}" — correct`;
    } else {
      bg = "rgba(224, 108, 117, 0.18)";
      textColor = "#e06c75";
      title = `"${targetChar}" — typed "${typedChar}"`;
    }
  }

  return (
    <span
      title={title}
      style={{ background: bg, color: textColor }}
      className="inline-flex items-center justify-center w-[18px] h-[18px] rounded text-[9px] font-mono-custom"
    >
      {targetChar}
    </span>
  );
};

interface HeatmapProps {
  wordResults: WordResult[];
}

const ErrorHeatmap: React.FC<HeatmapProps> = ({ wordResults }) => {
  const errorWords = wordResults.filter(
    ({ original, typed }) => original !== typed
  );

  if (errorWords.length === 0) {
    return (
      <div className="w-full rounded-xl bg-white/[0.015] border border-white/[0.05] p-4 font-mono-custom">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-[var(--inactive-color)] opacity-80">
            character heatmap
          </span>
          <span className="text-[10px] text-emerald-400/80 font-medium">
            ✓ perfect accuracy
          </span>
        </div>
        <p className="text-xs text-[var(--inactive-color)] text-center py-2 opacity-60">
          No errors detected. Flawless typing!
        </p>
      </div>
    );
  }

  const displayWords = errorWords.slice(0, 30);

  return (
    <div className="w-full rounded-xl bg-white/[0.015] border border-white/[0.05] p-4 font-mono-custom">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-wider text-[var(--inactive-color)] opacity-80">
          character heatmap
        </span>
        <span className="text-[10px] text-[#e06c75]/80">
          {errorWords.length} word{errorWords.length !== 1 ? "s" : ""} with errors
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        {displayWords.map(({ original, typed }, wIdx) => {
          const maxLen = Math.max(original.length, typed.length);
          return (
            <div key={wIdx} className="flex flex-col gap-0.5">
              <span className="text-[8px] text-[var(--inactive-color)] opacity-70 truncate max-w-[80px]">
                {original}
              </span>
              <div className="flex gap-0.5">
                {Array.from({ length: maxLen }).map((_, cIdx) => {
                  const targetChar = original[cIdx];
                  const typedChar = typed[cIdx];

                  if (!targetChar) {
                    return (
                      <span
                        key={cIdx}
                        title={`extra: "${typedChar}"`}
                        style={{ background: "rgba(224, 108, 117, 0.18)", color: "#e06c75" }}
                        className="inline-flex items-center justify-center w-[18px] h-[18px] rounded text-[9px] font-mono-custom"
                      >
                        {typedChar}
                      </span>
                    );
                  }

                  return (
                    <CharCell
                      key={cIdx}
                      targetChar={targetChar}
                      typedChar={typedChar}
                      isMissed={!typedChar}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {errorWords.length > 30 && (
        <p className="text-[9px] text-[#646669] mt-2 opacity-50">
          +{errorWords.length - 30} more error words not shown
        </p>
      )}
    </div>
  );
};

// ─── Main ResultsCard ─────────────────────────────────────────────────────────

export const ResultsCard: React.FC<ResultsCardProps> = ({
  results,
  mode,
  timeOption,
  wordsOption,
  tier,
  errorSeconds,
  onRestart,
  contestantName,
  department,
  liveRank,
  customRestartLabel,
  onNext,
}) => {
  const [showDetails, setShowDetails] = React.useState(false);

  const modeKey = mode === "time" ? `${timeOption}s` : `${wordsOption}w`;
  const pbKey = `typex_pb_${mode}_${modeKey}_${tier}`;

  const previousPb = useMemo<PersonalBest | null>(() => {
    try {
      const savedPbStr = localStorage.getItem(pbKey);
      return savedPbStr ? (JSON.parse(savedPbStr) as PersonalBest) : null;
    } catch {
      return null;
    }
  }, [pbKey]);

  const isNewPb = previousPb === null || results.netWpm > previousPb.wpm;

  useEffect(() => {
    if (!isNewPb || mode === "competition") return;
    try {
      localStorage.setItem(
        pbKey,
        JSON.stringify({
          wpm: results.netWpm,
          accuracy: results.accuracy,
          date: new Date().toISOString(),
        })
      );
    } catch {
      // non-fatal
    }
  }, [isNewPb, pbKey, results.netWpm, results.accuracy, mode]);

  // Keyboard shortcut: Esc or Enter to restart/next
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        if (onNext) {
          onNext();
        } else {
          onRestart();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onRestart, onNext]);

  const modeDisplay = mode === "competition" ? "COMPETITION" : mode === "time" ? `${timeOption}s` : `${wordsOption} words`;
  const tierDisplay = tier.replace("_", " ");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="w-full max-w-5xl mx-auto px-6 py-4 flex flex-col items-center justify-center select-none font-mono-custom min-h-[60vh]"
    >
      {/* Contestant Stage Banner (When in competition mode) */}
      {(contestantName || liveRank) && (
        <div className="w-full flex items-center justify-between border-b border-white/[0.08] pb-4 mb-2">
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-widest text-[var(--inactive-color)] font-medium">
              Contestant
            </span>
            <div className="flex items-center gap-3">
              <span className="text-2xl md:text-3xl font-bold tracking-wide text-[var(--typed-color)]">
                {contestantName}
              </span>
              {department && (
                <span className="text-xs px-2.5 py-0.5 rounded bg-white/[0.06] text-[var(--inactive-color)] border border-white/[0.08]">
                  {department}
                </span>
              )}
            </div>
          </div>

          {liveRank && (
            <div className="flex items-center gap-3">
              {/* Podium Medal for Top 3 */}
              {(() => {
                const isTop1 = liveRank.startsWith("#1 ");
                const isTop2 = liveRank.startsWith("#2 ");
                const isTop3 = liveRank.startsWith("#3 ");
                if (isTop1) {
                  return (
                    <span className="px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-[0_0_15px_rgba(251,191,36,0.25)] flex items-center gap-1.5">
                      🥇 Gold
                    </span>
                  );
                } else if (isTop2) {
                  return (
                    <span className="px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase bg-slate-300/20 text-slate-200 border border-slate-300/40 shadow-[0_0_15px_rgba(226,232,240,0.2)] flex items-center gap-1.5">
                      🥈 Silver
                    </span>
                  );
                } else if (isTop3) {
                  return (
                    <span className="px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase bg-amber-700/25 text-amber-600 border border-amber-700/40 shadow-[0_0_15px_rgba(180,83,9,0.2)] flex items-center gap-1.5">
                      🥉 Bronze
                    </span>
                  );
                }
                return null;
              })()}
              <div className="flex flex-col items-end">
                <span className="text-[11px] uppercase tracking-widest text-[var(--inactive-color)] font-medium">
                  Live Standing
                </span>
                <span className="text-2xl md:text-3xl font-black tracking-tight text-[var(--accent-color)]">
                  {liveRank}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top Meta Line & PB Badge for Standard Modes */}
      {!contestantName && (
        <div className="w-full flex items-center justify-between text-xs text-[var(--inactive-color)] mb-2">
          <span>
            {modeDisplay} • {tierDisplay}
          </span>

          {isNewPb && mode !== "competition" && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
              <Trophy className="w-3.5 h-3.5" />
              <span>new personal best</span>
              {previousPb !== null && (
                <span className="opacity-75 font-normal ml-0.5">
                  (+{(results.netWpm - previousPb.wpm).toFixed(1)})
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── HERO STATS (Fills ~45% Viewport Height) ── */}
      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 my-4 h-[44vh] min-h-[300px] max-h-[500px]">
        {/* Enormous WPM */}
        <div className="flex flex-col items-center justify-center p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] shadow-2xl backdrop-blur-sm h-full">
          <span className="text-xs uppercase tracking-[0.25em] text-[var(--inactive-color)] font-medium mb-1">
            net wpm
          </span>
          <span className="text-[clamp(4.5rem,11vh,9rem)] font-extralight tracking-tight tabular-nums text-[var(--accent-color)] leading-none select-text py-2">
            {results.netWpm.toFixed(1)}
          </span>
          <span className="text-xs tracking-wider uppercase text-[var(--inactive-color)] mt-1 font-medium">
            net speed
          </span>
        </div>

        {/* Enormous Accuracy */}
        <div className="flex flex-col items-center justify-center p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] shadow-2xl backdrop-blur-sm h-full">
          <span className="text-xs uppercase tracking-[0.25em] text-[var(--inactive-color)] font-medium mb-1">
            accuracy
          </span>
          <div className="flex items-baseline leading-none py-2">
            <span className="text-[clamp(4.5rem,11vh,9rem)] font-extralight tracking-tight tabular-nums text-[var(--typed-color)] leading-none select-text">
              {results.accuracy.toFixed(1)}
            </span>
            <span className="text-3xl sm:text-4xl md:text-5xl font-light text-[var(--inactive-color)] ml-1">
              %
            </span>
          </div>
          <span className="text-xs tracking-wider uppercase text-[var(--inactive-color)] mt-1 font-medium">
            precision
          </span>
        </div>
      </div>

      {/* ── QUIET SECONDARY STATS ROW ── */}
      <div className="w-full flex flex-wrap items-center justify-around gap-4 py-3 px-6 rounded-xl bg-white/[0.015] border border-white/[0.04] text-xs text-[var(--inactive-color)]">
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-wider text-[11px] font-medium text-[var(--inactive-color)]">raw</span>
          <span className="text-sm font-semibold tabular-nums text-[var(--typed-color)]">
            {results.rawWpm.toFixed(1)}
          </span>
        </div>

        <span className="opacity-20">•</span>

        <div className="flex items-center gap-2">
          <span className="uppercase tracking-wider text-[11px] font-medium text-[var(--inactive-color)]">consistency</span>
          <span className="text-sm font-semibold tabular-nums text-[var(--typed-color)]">
            {results.consistency.toFixed(1)}%
          </span>
        </div>

        <span className="opacity-20">•</span>

        <div className="flex items-center gap-2">
          <span className="uppercase tracking-wider text-[11px] font-medium text-[var(--inactive-color)]">characters</span>
          <span className="text-xs font-mono tabular-nums text-[var(--typed-color)]">
            {results.correctChars} <span className="text-emerald-400 font-medium">ok</span> /{" "}
            <span className="text-[#e06c75] font-medium">{results.incorrectChars} err</span> /{" "}
            <span className="text-amber-500 font-medium">{results.extraChars} ext</span>
          </span>
        </div>

        {typeof results.correctedErrors === "number" && (
          <>
            <span className="opacity-20">•</span>
            <div className="flex items-center gap-2">
              <span className="uppercase tracking-wider text-[11px] font-medium text-[var(--inactive-color)]">corrected</span>
              <span className="text-sm font-semibold tabular-nums text-emerald-400">
                {results.correctedErrors}
              </span>
            </div>
          </>
        )}

        <span className="opacity-20">•</span>

        <div className="flex items-center gap-2">
          <span className="uppercase tracking-wider text-[11px] font-medium text-[var(--inactive-color)]">time</span>
          <span className="text-sm font-semibold tabular-nums text-[var(--typed-color)]">
            {results.durationSeconds.toFixed(1)}s
          </span>
        </div>
      </div>

      {/* ── DETAILS COLLAPSIBLE TOGGLE ── */}
      <div className="w-full mt-4 flex flex-col items-center">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-[var(--inactive-color)] opacity-70 hover:opacity-100 hover:text-[var(--typed-color)] transition-all flex items-center gap-1.5 py-1 px-3 rounded-lg hover:bg-white/[0.04] cursor-pointer"
        >
          <span>{showDetails ? "Hide Details" : "Show Details"}</span>
          <span className="text-[10px]">{showDetails ? "▲" : "▼"}</span>
        </button>

        {showDetails && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full flex flex-col gap-4 mt-4"
          >
            {/* SVG Telemetry Chart */}
            <WpmChart
              perSecondWpm={results.perSecondWpm}
              errorSeconds={errorSeconds}
              rawWpm={results.rawWpm}
            />

            {/* Heatmap */}
            {results.wordResults && results.wordResults.length > 0 && (
              <ErrorHeatmap wordResults={results.wordResults} />
            )}
          </motion.div>
        )}
      </div>

      {/* ── ACTION CONTROLS ── */}
      <div className="flex items-center justify-center gap-6 mt-6 text-xs select-none">
        {onNext ? (
          <button
            onClick={onNext}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--accent-color)] text-black font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-lg"
          >
            <span>{customRestartLabel || "Next Contestant"}</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-[10px] opacity-75 font-normal ml-1">Enter</span>
          </button>
        ) : (
          <>
            <button
              onClick={onRestart}
              className="flex items-center gap-2 text-[var(--typed-color)] hover:text-[var(--accent-color)] transition-colors cursor-pointer group px-4 py-2 rounded-lg hover:bg-white/[0.03]"
            >
              <RotateCcw className="w-3.5 h-3.5 group-hover:-rotate-90 transition-transform duration-200" />
              <span>{customRestartLabel || "Restart"}</span>
              <span className="text-[10px] text-[var(--inactive-color)] opacity-70">Esc / Enter</span>
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
};
