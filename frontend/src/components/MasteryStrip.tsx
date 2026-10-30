"use client";

import React from "react";
import { KeyStatus } from "@/types/typing";

interface MasteryStripProps {
  keyStatuses: KeyStatus[];
  activeTarget: string;
  focusKey: string | null;
  onSelectFocusKey: (key: string) => void;
  isFocusMode: boolean;
}

export const MasteryStrip: React.FC<MasteryStripProps> = ({
  keyStatuses,
  activeTarget,
  focusKey,
  onSelectFocusKey,
  isFocusMode,
}) => {
  // Curriculum sequence
  const curriculumSequence = [
    "e", "n", "i", "t", "r", "l", "s", "a", "o", "d", "y", "c", "h", "g",
    "m", "u", "p", "b", "k", "v", "w", "f", "z", "x", "q", "j"
  ];

  // Map for fast lookup
  const statusMap = new Map<string, KeyStatus>();
  for (const s of keyStatuses) {
    statusMap.set(s.key.toLowerCase(), s);
  }

  const effectiveTarget = focusKey || activeTarget || "s";
  const targetStat = statusMap.get(effectiveTarget.toLowerCase());
  const targetConf = targetStat ? Math.round(targetStat.confidence) : 40;

  return (
    <div
      className={`w-full max-w-4xl mx-auto px-4 mb-4 flex flex-col md:flex-row items-center justify-between gap-3 font-mono-custom text-xs select-none transition-all duration-500 ease-out ${
        isFocusMode ? "opacity-0 pointer-events-none -translate-y-2" : "opacity-100 translate-y-0"
      }`}
    >
      {/* 26-Key Mastery Strip */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 p-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
        {curriculumSequence.map((char) => {
          const stat = statusMap.get(char);
          const isCurrentActive = char.toLowerCase() === effectiveTarget.toLowerCase();
          const isMastered = stat ? stat.confidence >= 85.0 : false;
          const isUnlocked = stat ? stat.status === "unlocked" || stat.status === "active" || isMastered : false;

          let stateClass = "";
          let bottomIndicator: React.ReactNode = null;

          if (isCurrentActive) {
            stateClass = "border border-[var(--accent-color)] text-[var(--accent-color)] font-bold shadow-[0_0_8px_var(--accent-glow)] bg-white/[0.04]";
            bottomIndicator = (
              <span className="text-[8px] text-[var(--accent-color)] leading-none mt-0.5 font-normal">
                {stat ? Math.round(stat.confidence) : 40}%
              </span>
            );
          } else if (isMastered) {
            stateClass = "text-[var(--typed-color)] opacity-95 hover:opacity-100 hover:bg-white/[0.04]";
            bottomIndicator = (
              <span className="w-2.5 h-[2px] rounded-full bg-[var(--accent-color)] opacity-85 mt-0.5" />
            );
          } else if (isUnlocked) {
            stateClass = "text-[var(--inactive-color)] opacity-85 hover:opacity-100 hover:text-[var(--typed-color)] hover:bg-white/[0.04]";
            bottomIndicator = (
              <span className="w-2 h-[1px] rounded-full bg-white/20 mt-0.5" />
            );
          } else {
            // Locked: high-contrast muted text (minimum opacity-65 - never dark invisible)
            stateClass = "text-[var(--inactive-color)] opacity-65 border border-white/[0.05] hover:opacity-90 hover:text-[var(--typed-color)]";
            bottomIndicator = (
              <span className="text-[7px] opacity-60 leading-none mt-0.5">•</span>
            );
          }

          return (
            <button
              key={char}
              onClick={() => onSelectFocusKey(char)}
              title={`Key [ ${char.toUpperCase()} ] · Confidence: ${stat ? Math.round(stat.confidence) : 0}% (${stat ? stat.status : "locked"})`}
              className={`flex flex-col items-center justify-center w-6 h-8 rounded transition-all duration-150 cursor-pointer ${stateClass}`}
            >
              <span className="uppercase text-[11px] leading-none">{char}</span>
              {bottomIndicator}
            </button>
          );
        })}
      </div>

      {/* Target Readout & Unlock Gate Badge */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs">
        <span className="text-[10px] text-[var(--inactive-color)] opacity-70 uppercase tracking-wider">
          target
        </span>
        <span className="px-1.5 py-0.5 rounded bg-[var(--accent-color)]/10 text-[var(--accent-color)] font-bold text-xs uppercase">
          {effectiveTarget}
        </span>
        <span className="text-[var(--inactive-color)] opacity-40">·</span>
        <span className="tabular-nums font-medium text-[var(--typed-color)]">
          {targetConf}%
        </span>
        <span className="text-[10px] text-[var(--inactive-color)] opacity-70">
          / 85% to unlock
        </span>
        {focusKey && (
          <button
            onClick={() => onSelectFocusKey("")}
            className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-[var(--inactive-color)] hover:text-[var(--typed-color)] hover:bg-white/[0.1] transition-colors cursor-pointer"
            title="Reset to Auto Guided mode"
          >
            auto
          </button>
        )}
      </div>
    </div>
  );
};
