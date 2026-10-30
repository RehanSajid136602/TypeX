"use client";

import React, { useState } from "react";
import { KeyStatus } from "@/types/typing";

interface KeyboardHUDProps {
  targetChar?: string;
  prevChar?: string;
  keyStatuses?: KeyStatus[];
  isHeatmapMode?: boolean;
  onToggleHeatmap?: () => void;
  visible?: boolean;
}

interface KeyDef {
  id: string;
  label: string;
  shiftLabel?: string;
  char: string;
  shiftChar?: string;
  finger: string; // "L_PINKY", "L_RING", "L_MIDDLE", "L_INDEX", "R_INDEX", "R_MIDDLE", "R_RING", "R_PINKY"
  hand: "LEFT" | "RIGHT" | "NONE";
  w?: number; // relative width, default 1
}

export const KeyboardHUD: React.FC<KeyboardHUDProps> = ({
  targetChar = "",
  prevChar = "",
  keyStatuses = [],
  isHeatmapMode = false,
  onToggleHeatmap,
  visible = true,
}) => {
  const [hoveredKey, setHoveredKey] = useState<KeyDef | null>(null);

  if (!visible) return null;

  // Build key status lookup
  const statusMap = new Map<string, KeyStatus>();
  for (const s of keyStatuses) {
    statusMap.set(s.key.toLowerCase(), s);
  }

  // Define 60% ANSI Key Rows
  const rows: KeyDef[][] = [
    // Row 0
    [
      { id: "backtick", label: "`", shiftLabel: "~", char: "`", shiftChar: "~", finger: "L_PINKY", hand: "LEFT" },
      { id: "1", label: "1", shiftLabel: "!", char: "1", shiftChar: "!", finger: "L_PINKY", hand: "LEFT" },
      { id: "2", label: "2", shiftLabel: "@", char: "2", shiftChar: "@", finger: "L_RING", hand: "LEFT" },
      { id: "3", label: "3", shiftLabel: "#", char: "3", shiftChar: "#", finger: "L_MIDDLE", hand: "LEFT" },
      { id: "4", label: "4", shiftLabel: "$", char: "4", shiftChar: "$", finger: "L_INDEX", hand: "LEFT" },
      { id: "5", label: "5", shiftLabel: "%", char: "5", shiftChar: "%", finger: "L_INDEX", hand: "LEFT" },
      { id: "6", label: "6", shiftLabel: "^", char: "6", shiftChar: "^", finger: "R_INDEX", hand: "RIGHT" },
      { id: "7", label: "7", shiftLabel: "&", char: "7", shiftChar: "&", finger: "R_INDEX", hand: "RIGHT" },
      { id: "8", label: "8", shiftLabel: "*", char: "8", shiftChar: "*", finger: "R_MIDDLE", hand: "RIGHT" },
      { id: "9", label: "9", shiftLabel: "(", char: "9", shiftChar: "(", finger: "R_RING", hand: "RIGHT" },
      { id: "0", label: "0", shiftLabel: ")", char: "0", shiftChar: ")", finger: "R_PINKY", hand: "RIGHT" },
      { id: "-", label: "-", shiftLabel: "_", char: "-", shiftChar: "_", finger: "R_PINKY", hand: "RIGHT" },
      { id: "=", label: "=", shiftLabel: "+", char: "=", shiftChar: "+", finger: "R_PINKY", hand: "RIGHT" },
      { id: "backspace", label: "backspace", char: "", finger: "R_PINKY", hand: "RIGHT", w: 2 },
    ],
    // Row 1
    [
      { id: "tab", label: "tab", char: "", finger: "L_PINKY", hand: "LEFT", w: 1.5 },
      { id: "q", label: "q", shiftLabel: "Q", char: "q", shiftChar: "Q", finger: "L_PINKY", hand: "LEFT" },
      { id: "w", label: "w", shiftLabel: "W", char: "w", shiftChar: "W", finger: "L_RING", hand: "LEFT" },
      { id: "e", label: "e", shiftLabel: "E", char: "e", shiftChar: "E", finger: "L_MIDDLE", hand: "LEFT" },
      { id: "r", label: "r", shiftLabel: "R", char: "r", shiftChar: "R", finger: "L_INDEX", hand: "LEFT" },
      { id: "t", label: "t", shiftLabel: "T", char: "t", shiftChar: "T", finger: "L_INDEX", hand: "LEFT" },
      { id: "y", label: "y", shiftLabel: "Y", char: "y", shiftChar: "Y", finger: "R_INDEX", hand: "RIGHT" },
      { id: "u", label: "u", shiftLabel: "U", char: "u", shiftChar: "U", finger: "R_INDEX", hand: "RIGHT" },
      { id: "i", label: "i", shiftLabel: "I", char: "i", shiftChar: "I", finger: "R_MIDDLE", hand: "RIGHT" },
      { id: "o", label: "o", shiftLabel: "O", char: "o", shiftChar: "O", finger: "R_RING", hand: "RIGHT" },
      { id: "p", label: "p", shiftLabel: "P", char: "p", shiftChar: "P", finger: "R_PINKY", hand: "RIGHT" },
      { id: "[", label: "[", shiftLabel: "{", char: "[", shiftChar: "{", finger: "R_PINKY", hand: "RIGHT" },
      { id: "]", label: "]", shiftLabel: "}", char: "]", shiftChar: "}", finger: "R_PINKY", hand: "RIGHT" },
      { id: "\\", label: "\\", shiftLabel: "|", char: "\\", shiftChar: "|", finger: "R_PINKY", hand: "RIGHT", w: 1.5 },
    ],
    // Row 2
    [
      { id: "caps", label: "caps", char: "", finger: "L_PINKY", hand: "LEFT", w: 1.75 },
      { id: "a", label: "a", shiftLabel: "A", char: "a", shiftChar: "A", finger: "L_PINKY", hand: "LEFT" },
      { id: "s", label: "s", shiftLabel: "S", char: "s", shiftChar: "S", finger: "L_RING", hand: "LEFT" },
      { id: "d", label: "d", shiftLabel: "D", char: "d", shiftChar: "D", finger: "L_MIDDLE", hand: "LEFT" },
      { id: "f", label: "f", shiftLabel: "F", char: "f", shiftChar: "F", finger: "L_INDEX", hand: "LEFT" },
      { id: "g", label: "g", shiftLabel: "G", char: "g", shiftChar: "G", finger: "L_INDEX", hand: "LEFT" },
      { id: "h", label: "h", shiftLabel: "H", char: "h", shiftChar: "H", finger: "R_INDEX", hand: "RIGHT" },
      { id: "j", label: "j", shiftLabel: "J", char: "j", shiftChar: "J", finger: "R_INDEX", hand: "RIGHT" },
      { id: "k", label: "k", shiftLabel: "K", char: "k", shiftChar: "K", finger: "R_MIDDLE", hand: "RIGHT" },
      { id: "l", label: "l", shiftLabel: "L", char: "l", shiftChar: "L", finger: "R_RING", hand: "RIGHT" },
      { id: ";", label: ";", shiftLabel: ":", char: ";", shiftChar: ":", finger: "R_PINKY", hand: "RIGHT" },
      { id: "'", label: "'", shiftLabel: "\"", char: "'", shiftChar: "\"", finger: "R_PINKY", hand: "RIGHT" },
      { id: "enter", label: "enter", char: "", finger: "R_PINKY", hand: "RIGHT", w: 2.25 },
    ],
    // Row 3
    [
      { id: "shift_l", label: "shift", char: "", finger: "L_PINKY", hand: "LEFT", w: 2.25 },
      { id: "z", label: "z", shiftLabel: "Z", char: "z", shiftChar: "Z", finger: "L_PINKY", hand: "LEFT" },
      { id: "x", label: "x", shiftLabel: "X", char: "x", shiftChar: "X", finger: "L_RING", hand: "LEFT" },
      { id: "c", label: "c", shiftLabel: "C", char: "c", shiftChar: "C", finger: "L_MIDDLE", hand: "LEFT" },
      { id: "v", label: "v", shiftLabel: "V", char: "v", shiftChar: "V", finger: "L_INDEX", hand: "LEFT" },
      { id: "b", label: "b", shiftLabel: "B", char: "b", shiftChar: "B", finger: "L_INDEX", hand: "LEFT" },
      { id: "n", label: "n", shiftLabel: "N", char: "n", shiftChar: "N", finger: "R_INDEX", hand: "RIGHT" },
      { id: "m", label: "m", shiftLabel: "M", char: "m", shiftChar: "M", finger: "R_INDEX", hand: "RIGHT" },
      { id: ",", label: ",", shiftLabel: "<", char: ",", shiftChar: "<", finger: "R_MIDDLE", hand: "RIGHT" },
      { id: ".", label: ".", shiftLabel: ">", char: ".", shiftChar: ">", finger: "R_RING", hand: "RIGHT" },
      { id: "/", label: "/", shiftLabel: "?", char: "/", shiftChar: "?", finger: "R_PINKY", hand: "RIGHT" },
      { id: "shift_r", label: "shift", char: "", finger: "R_PINKY", hand: "RIGHT", w: 2.75 },
    ],
    // Row 4
    [
      { id: "ctrl_l", label: "ctrl", char: "", finger: "L_PINKY", hand: "LEFT", w: 1.25 },
      { id: "win_l", label: "❖", char: "", finger: "L_PINKY", hand: "LEFT", w: 1.25 },
      { id: "alt_l", label: "alt", char: "", finger: "L_RING", hand: "LEFT", w: 1.25 },
      { id: "space", label: "space", char: " ", finger: "NONE", hand: "NONE", w: 6.25 },
      { id: "alt_r", label: "alt", char: "", finger: "R_RING", hand: "RIGHT", w: 1.25 },
      { id: "win_r", label: "❖", char: "", finger: "R_PINKY", hand: "RIGHT", w: 1.25 },
      { id: "ctrl_r", label: "ctrl", char: "", finger: "R_PINKY", hand: "RIGHT", w: 1.25 },
    ],
  ];

  // Derive target key info
  let isShiftRequired = false;
  let activeKeyId = "";
  let activeFinger = "NONE";
  let activeHand: "LEFT" | "RIGHT" | "NONE" = "NONE";

  if (targetChar) {
    for (const r of rows) {
      for (const k of r) {
        if (k.char === targetChar) {
          activeKeyId = k.id;
          activeFinger = k.finger;
          activeHand = k.hand;
          break;
        } else if (k.shiftChar === targetChar) {
          activeKeyId = k.id;
          activeFinger = k.finger;
          activeHand = k.hand;
          isShiftRequired = true;
          break;
        }
      }
      if (activeKeyId) break;
    }
  }

  // Biomechanical Motion Classification
  let motionType = "NORMAL";
  let prevKeyDef: KeyDef | null = null;
  if (prevChar) {
    for (const r of rows) {
      for (const k of r) {
        if (k.char === prevChar || k.shiftChar === prevChar) {
          prevKeyDef = k;
          break;
        }
      }
      if (prevKeyDef) break;
    }
  }

  if (prevKeyDef && activeKeyId && prevKeyDef.hand !== "NONE" && activeHand !== "NONE") {
    if (prevKeyDef.hand !== activeHand) {
      motionType = "HAND ALTERNATION";
    } else if (prevKeyDef.finger === activeFinger && prevKeyDef.id !== activeKeyId) {
      motionType = "⚠ SAME-FINGER JUMP";
    } else if (prevKeyDef.hand === "LEFT") {
      motionType = "INWARD ROLL";
    } else {
      motionType = "ROLL";
    }
  }

  const formatFingerName = (f: string) => {
    switch (f) {
      case "L_PINKY": return "LEFT PINKY";
      case "L_RING": return "LEFT RING";
      case "L_MIDDLE": return "LEFT MIDDLE";
      case "L_INDEX": return "LEFT INDEX";
      case "R_INDEX": return "RIGHT INDEX";
      case "R_MIDDLE": return "RIGHT MIDDLE";
      case "R_RING": return "RIGHT RING";
      case "R_PINKY": return "RIGHT PINKY";
      default: return "SPACE (THUMB)";
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 mt-6 select-none font-mono-custom flex flex-col items-center">
      {/* Top HUD Controls: Guided vs Heatmap */}
      <div className="w-full flex items-center justify-between mb-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-[var(--inactive-color)] opacity-70">
            biomechanical keyboard guide
          </span>
          <span className="text-[10px] text-[var(--inactive-color)] opacity-40">·</span>
          <span className="text-[10px] text-[var(--accent-color)] font-medium">
            60% ANSI
          </span>
        </div>

        {onToggleHeatmap && (
          <button
            onClick={onToggleHeatmap}
            className={`text-[10px] px-2 py-0.5 rounded transition-all cursor-pointer ${
              isHeatmapMode
                ? "bg-[var(--accent-color)]/15 text-[var(--accent-color)] font-medium border border-[var(--accent-color)]/30"
                : "text-[var(--inactive-color)] opacity-60 hover:opacity-100 hover:text-[var(--typed-color)] bg-white/[0.02] border border-white/[0.05]"
            }`}
          >
            {isHeatmapMode ? "✓ heatmap active" : "show latency heatmap"}
          </button>
        )}
      </div>

      {/* SVG 60% Keyboard Layout */}
      <div className="w-full p-3 rounded-xl bg-white/[0.015] border border-white/[0.05] relative overflow-hidden flex flex-col gap-1.5 items-center">
        {rows.map((row, rIdx) => (
          <div key={rIdx} className="w-full flex gap-1 justify-center">
            {row.map((k) => {
              const widthUnit = k.w || 1;
              const flexGrow = widthUnit;

              // Check if key is active / target
              const isTargetKey = k.id === activeKeyId;
              const isShiftHighlight =
                isShiftRequired &&
                ((activeHand === "LEFT" && k.id === "shift_r") ||
                  (activeHand === "RIGHT" && k.id === "shift_l") ||
                  (activeHand === "NONE" && (k.id === "shift_l" || k.id === "shift_r")));

              // Heatmap styling
              const stat = k.char ? statusMap.get(k.char.toLowerCase()) : undefined;
              let heatmapBg = "bg-white/[0.02]";
              let heatmapBorder = "border-white/[0.06]";
              let heatmapText = "text-[var(--inactive-color)] opacity-75";

              if (isHeatmapMode && stat) {
                if (stat.confidence >= 85 || (stat.emaFlightMs > 0 && stat.emaFlightMs < 130)) {
                  heatmapBg = "bg-[var(--accent-color)]/20";
                  heatmapBorder = "border-[var(--accent-color)]/50";
                  heatmapText = "text-[var(--typed-color)] font-medium opacity-100";
                } else if (stat.emaFlightMs >= 190 || stat.errors > 3) {
                  heatmapBg = "bg-[#e06c75]/20";
                  heatmapBorder = "border-[#e06c75]/50";
                  heatmapText = "text-[#e06c75] font-medium opacity-100";
                } else {
                  heatmapBg = "bg-slate-700/25";
                  heatmapBorder = "border-slate-500/30";
                  heatmapText = "text-[var(--inactive-color)] opacity-90";
                }
              }

              // Active guided highlights override
              if (isTargetKey) {
                heatmapBg = "bg-[var(--accent-color)] text-[var(--bg-color)] font-bold shadow-[0_0_12px_var(--accent-glow)]";
                heatmapBorder = "border-[var(--accent-color)]";
                heatmapText = "text-black font-bold";
              } else if (isShiftHighlight) {
                heatmapBg = "bg-[var(--accent-color)]/30 text-[var(--accent-color)]";
                heatmapBorder = "border-[var(--accent-color)] animate-pulse";
                heatmapText = "text-[var(--accent-color)] font-medium";
              }

              return (
                <div
                  key={k.id}
                  style={{ flex: `${flexGrow} 1 0px` }}
                  onMouseEnter={() => setHoveredKey(k)}
                  onMouseLeave={() => setHoveredKey(null)}
                  className={`h-9 rounded-md border flex flex-col items-center justify-center relative transition-all duration-100 cursor-default ${heatmapBg} ${heatmapBorder}`}
                >
                  {k.shiftLabel && (
                    <span className="text-[8px] leading-none opacity-65 mb-0.5">
                      {k.shiftLabel}
                    </span>
                  )}
                  <span className={`text-[10px] leading-none ${heatmapText}`}>
                    {k.label}
                  </span>
                </div>
              );
            })}
          </div>
        ))}

        {/* Biomechanical Live Badge Directly Below Spacebar */}
        <div className="w-full mt-2 pt-2 border-t border-white/[0.04] flex flex-wrap items-center justify-between text-xs text-[var(--inactive-color)]">
          <div className="flex items-center gap-3">
            <span className="text-[10px] opacity-60">ACTIVE FINGER:</span>
            <span className="px-2 py-0.5 rounded bg-white/[0.05] text-[var(--accent-color)] font-medium text-[11px]">
              {formatFingerName(activeFinger)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] opacity-60">MOTOR TRANSITION:</span>
            <span
              className={`px-2 py-0.5 rounded font-medium text-[11px] ${
                motionType.includes("SAME-FINGER")
                  ? "bg-[#e06c75]/15 text-[#e06c75] border border-[#e06c75]/30"
                  : motionType === "HAND ALTERNATION"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-white/[0.04] text-[var(--typed-color)]"
              }`}
            >
              {motionType}
            </span>
          </div>

          {/* Hover Tooltip Details in Heatmap Mode */}
          {hoveredKey && hoveredKey.char && (
            <div className="text-[10px] text-[var(--inactive-color)] opacity-85 ml-auto">
              Key [ <span className="text-[var(--typed-color)] uppercase font-semibold">{hoveredKey.char}</span> ] ·{" "}
              Finger: {hoveredKey.finger} ·{" "}
              Confidence: {statusMap.get(hoveredKey.char.toLowerCase())?.confidence || 0}% ·{" "}
              Speed: {Math.round(statusMap.get(hoveredKey.char.toLowerCase())?.emaFlightMs || 220)}ms
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
