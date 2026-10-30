"use client";

import React from "react";
import { Keyboard as KeyboardIcon } from "lucide-react";
import {
  TestMode,
  TimeOption,
  WordsOption,
  DictionaryTier,
  DICTIONARY_TIERS,
  tierLabel,
  ErrorBehavior,
  LearnTrack,
  LineCountOption,
} from "@/types/typing";

interface ConfigBarProps {
  mode: TestMode;
  timeOption: TimeOption;
  wordsOption: WordsOption;
  tier: DictionaryTier;
  errorBehavior: ErrorBehavior;
  learnTrack: LearnTrack;
  lineCount?: LineCountOption;
  showKeyboard: boolean;
  isFocusMode: boolean;
  onModeChange: (mode: TestMode) => void;
  onTimeOptionChange: (time: TimeOption) => void;
  onWordsOptionChange: (words: WordsOption) => void;
  onTierChange: (tier: DictionaryTier) => void;
  onErrorBehaviorChange: (behavior: ErrorBehavior) => void;
  onLearnTrackChange: (track: LearnTrack) => void;
  onLineCountChange?: (lines: LineCountOption) => void;
  onToggleKeyboard: () => void;
}

export const ConfigBar: React.FC<ConfigBarProps> = ({
  mode,
  timeOption,
  wordsOption,
  tier,
  errorBehavior,
  learnTrack,
  lineCount = 3,
  showKeyboard,
  isFocusMode,
  onModeChange,
  onTimeOptionChange,
  onWordsOptionChange,
  onTierChange,
  onErrorBehaviorChange,
  onLearnTrackChange,
  onLineCountChange,
  onToggleKeyboard,
}) => {
  const learnTracks: { id: LearnTrack; label: string }[] = [
    { id: "phonetic_unlock", label: "unlock" },
    { id: "trigram_chunks", label: "trigrams" },
    { id: "sfb_destroyer", label: "sfb" },
    { id: "finger_gym", label: "fingers" },
    { id: "cpp_symbols", label: "c++ symbols" },
  ];

  return (
    <div
      className={`w-full max-w-4xl mx-auto px-4 mb-8 flex items-center justify-center transition-all duration-500 ease-out font-mono-custom text-xs select-none ${
        isFocusMode
          ? "opacity-0 pointer-events-none -translate-y-2"
          : "opacity-100 translate-y-0"
      }`}
    >
      {/* Floating Whisper-Quiet Navigation Bar */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-[var(--inactive-color)]">
        {/* Mode Selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onModeChange("time")}
            className={`relative px-1.5 py-0.5 transition-all duration-150 cursor-pointer ${
              mode === "time"
                ? "text-[var(--accent-color)] font-medium opacity-100"
                : "text-[var(--inactive-color)] opacity-60 hover:opacity-100 hover:text-[var(--typed-color)]"
            }`}
          >
            time
            {mode === "time" && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent-color)] shadow-[0_0_6px_var(--accent-color)]" />
            )}
          </button>
          <button
            onClick={() => onModeChange("words")}
            className={`relative px-1.5 py-0.5 transition-all duration-150 cursor-pointer ${
              mode === "words"
                ? "text-[var(--accent-color)] font-medium opacity-100"
                : "text-[var(--inactive-color)] opacity-60 hover:opacity-100 hover:text-[var(--typed-color)]"
            }`}
          >
            words
            {mode === "words" && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent-color)] shadow-[0_0_6px_var(--accent-color)]" />
            )}
          </button>
          <button
            onClick={() => onModeChange("learn")}
            className={`relative px-1.5 py-0.5 transition-all duration-150 cursor-pointer ${
              mode === "learn"
                ? "text-[var(--accent-color)] font-medium opacity-100"
                : "text-[var(--inactive-color)] opacity-60 hover:opacity-100 hover:text-[var(--typed-color)]"
            }`}
          >
            learn
            {mode === "learn" && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent-color)] shadow-[0_0_6px_var(--accent-color)]" />
            )}
          </button>
        </div>

        {/* 1px Vertical Hairline Divider at opacity-25 */}
        <div className="h-3 w-px bg-white/25" />

        {/* Mode-Specific Sub-Options */}
        {mode === "learn" ? (
          /* 5 Curriculum Track Pills for Learn Mode */
          <div className="flex items-center gap-2">
            {learnTracks.map((item) => (
              <button
                key={item.id}
                onClick={() => onLearnTrackChange(item.id)}
                className={`relative px-1.5 py-0.5 transition-all duration-150 cursor-pointer ${
                  learnTrack === item.id
                    ? "text-[var(--accent-color)] font-medium opacity-100"
                    : "text-[var(--inactive-color)] opacity-60 hover:opacity-100 hover:text-[var(--typed-color)]"
                }`}
              >
                {item.label}
                {learnTrack === item.id && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent-color)] shadow-[0_0_6px_var(--accent-color)]" />
                )}
              </button>
            ))}
          </div>
        ) : (
          /* Standard Time / Words Sub-Options */
          <div className="flex items-center gap-2">
            {mode === "time" ? (
              <>
                {([15, 30, 60, 120] as TimeOption[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => onTimeOptionChange(t)}
                    className={`relative px-1.5 py-0.5 transition-all duration-150 cursor-pointer ${
                      timeOption === t
                        ? "text-[var(--accent-color)] font-medium opacity-100"
                        : "text-[var(--inactive-color)] opacity-60 hover:opacity-100 hover:text-[var(--typed-color)]"
                    }`}
                  >
                    {t}
                    {timeOption === t && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent-color)] shadow-[0_0_6px_var(--accent-color)]" />
                    )}
                  </button>
                ))}
              </>
            ) : (
              <>
                {([10, 25, 50, 100] as WordsOption[]).map((w) => (
                  <button
                    key={w}
                    onClick={() => onWordsOptionChange(w)}
                    className={`relative px-1.5 py-0.5 transition-all duration-150 cursor-pointer ${
                      wordsOption === w
                        ? "text-[var(--accent-color)] font-medium opacity-100"
                        : "text-[var(--inactive-color)] opacity-60 hover:opacity-100 hover:text-[var(--typed-color)]"
                    }`}
                  >
                    {w}
                    {wordsOption === w && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent-color)] shadow-[0_0_6px_var(--accent-color)]" />
                    )}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* 1px Vertical Hairline Divider at opacity-25 */}
        <div className="h-3 w-px bg-white/25" />

        {/* Tier Selector (hidden in learn mode where tracks govern corpus) */}
        {mode !== "learn" && (
          <>
            <div className="flex items-center gap-2">
              {DICTIONARY_TIERS.map((id) => (
                <button
                  key={id}
                  onClick={() => onTierChange(id)}
                  title={id === "english_25k" ? "english_25k — rare word pool" : `Tier: ${tierLabel(id)}`}
                  className={`relative px-1.5 py-0.5 transition-all duration-150 cursor-pointer ${
                    tier === id
                      ? "text-[var(--accent-color)] font-medium opacity-100"
                      : "text-[var(--inactive-color)] opacity-65 hover:opacity-100 hover:text-[var(--typed-color)]"
                  }`}
                >
                  {tierLabel(id)}
                  {tier === id && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent-color)] shadow-[0_0_6px_var(--accent-color)]" />
                  )}
                </button>
              ))}
            </div>
            <div className="h-3 w-px bg-white/25" />
          </>
        )}

        {/* Error Behavior Selector */}
        <div className="flex items-center gap-2">
          {(
            [
              { id: "free", label: "free" },
              { id: "stop", label: "stop" },
              { id: "strict", label: "strict" },
            ] as { id: ErrorBehavior; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => onErrorBehaviorChange(item.id)}
              className={`relative px-1.5 py-0.5 transition-all duration-150 cursor-pointer ${
                errorBehavior === item.id
                  ? "text-[var(--accent-color)] font-medium opacity-100"
                  : "text-[var(--inactive-color)] opacity-60 hover:opacity-100 hover:text-[var(--typed-color)]"
              }`}
            >
              {item.label}
              {errorBehavior === item.id && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent-color)] shadow-[0_0_6px_var(--accent-color)]" />
              )}
            </button>
          ))}
        </div>

        {/* 1px Vertical Hairline Divider at opacity-25 */}
        <div className="h-3 w-px bg-white/25" />

        {/* Lines Setting Selector (2, 3, 4 lines) */}
        <div className="flex items-center gap-1.5" title="Visible lines setting">
          <span className="text-[10px] text-[var(--inactive-color)] opacity-60 mr-0.5">lines</span>
          {([2, 3, 4] as LineCountOption[]).map((lines) => (
            <button
              key={lines}
              onClick={() => onLineCountChange?.(lines)}
              className={`relative px-1.5 py-0.5 transition-all duration-150 cursor-pointer ${
                lineCount === lines
                  ? "text-[var(--accent-color)] font-medium opacity-100"
                  : "text-[var(--inactive-color)] opacity-60 hover:opacity-100 hover:text-[var(--typed-color)]"
              }`}
            >
              {lines}
              {lineCount === lines && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent-color)] shadow-[0_0_6px_var(--accent-color)]" />
              )}
            </button>
          ))}
        </div>

        {/* 1px Vertical Hairline Divider at opacity-25 */}
        <div className="h-3 w-px bg-white/25" />

        {/* Keyboard HUD Toggle Pill */}
        <button
          onClick={onToggleKeyboard}
          title={showKeyboard ? "Hide Keyboard Guide" : "Show Keyboard Guide"}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-all duration-150 cursor-pointer ${
            showKeyboard
              ? "text-[var(--accent-color)] bg-white/[0.05] opacity-100 font-medium"
              : "text-[var(--inactive-color)] opacity-60 hover:opacity-100 hover:text-[var(--typed-color)]"
          }`}
        >
          <KeyboardIcon className="w-3.5 h-3.5" />
          <span className="text-[11px]">keyboard</span>
        </button>
      </div>
    </div>
  );
};
