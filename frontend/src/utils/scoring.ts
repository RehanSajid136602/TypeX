/**
 * Final-text scoring accounting — the client half of the authoritative model.
 *
 * Mirrors `backend/include/scoring_engine.hpp`. The displayed and persisted
 * score must describe the text that exists when the test ends, not how many
 * keystrokes were spent producing it. Before this module the client sent
 * cumulative retype counts, so 10 corrected errors reported 22 net WPM on a
 * 20 WPM test and 50 corrected errors reported 30 net WPM (audit §6.2–6.3).
 *
 * Rules:
 *   - correctChars/incorrectChars/extraChars describe the FINAL text only.
 *   - retyping a character never adds to correctChars.
 *   - correctedErrors counts wrong keystrokes that were later deleted.
 *   - uncorrectedErrors counts characters still wrong at submission.
 */

import type { WordResult } from "@/types/typing";

export const CORRECTION_PENALTY = 0.5;

export interface FinalTextCounts {
  correctChars: number;
  incorrectChars: number;
  extraChars: number;
  finalCharsTyped: number;
  /** Characters that differ from the target; these are the uncorrected errors. */
  mismatchedChars: number;
}

/**
 * Compare every submitted word against its target character by character.
 *
 * Finished words include the separating space they consumed in the target
 * text; the final in-progress word does not.
 */
export function countFinalText(wordResults: WordResult[]): FinalTextCounts {
  const counts: FinalTextCounts = {
    correctChars: 0,
    incorrectChars: 0,
    extraChars: 0,
    finalCharsTyped: 0,
    mismatchedChars: 0,
  };

  // If the caller models separators explicitly (a " " entry), trust them and
  // never invent a second space after a word.
  const hasExplicitSpaces = wordResults.some((w) => (w.original ?? "") === " ");

  for (let i = 0; i < wordResults.length; i++) {
    const target = wordResults[i].original ?? "";
    const typed = wordResults[i].typed ?? "";
    const isLast = i + 1 === wordResults.length;

    // An explicit separator entry is a real character in the final text.
    if (target === " ") {
      if (typed.length > 0) {
        counts.correctChars++;
        counts.finalCharsTyped++;
      }
      continue;
    }

    const shared = Math.min(target.length, typed.length);
    for (let c = 0; c < shared; c++) {
      if (typed[c] === target[c]) {
        counts.correctChars++;
      } else {
        counts.incorrectChars++;
        counts.mismatchedChars++;
      }
    }

    // Characters typed past the end of the target word are "extra".
    if (typed.length > target.length) {
      const overflow = typed.length - target.length;
      counts.extraChars += overflow;
      counts.mismatchedChars += overflow;
    }

    // How much of the target the typist actually reached.
    counts.finalCharsTyped += Math.min(target.length, typed.length);

    // The separator space after a word the typist submitted. A word is
    // submitted when it was typed exactly to its length and is not the final,
    // still-in-progress word. Over-typed words do not earn the space: the
    // typist never pressed it.
    if (!hasExplicitSpaces && !isLast && typed.length > 0 && typed.length === target.length) {
      counts.correctChars++;
      counts.finalCharsTyped++;
    }
  }

  return counts;
}

export interface CharacterCounts {
  correctChars: number;
  incorrectChars: number;
  extraChars: number;
  finalCharsTyped: number;
}

/**
 * Choose the counters to submit.
 *
 * Prefer the final-text truth. Fall back to the live counters only when no
 * word results exist (e.g. Learn mode), and even then clamp correctChars so a
 * retype can never exceed the characters that survive.
 */
export function resolveCharacterCounts(
  wordResults: WordResult[] | null | undefined,
  live: CharacterCounts
): CharacterCounts {
  if (wordResults && wordResults.length > 0) {
    const counts = countFinalText(wordResults);
    return {
      correctChars: counts.correctChars,
      incorrectChars: counts.incorrectChars,
      extraChars: counts.extraChars,
      finalCharsTyped: counts.finalCharsTyped,
    };
  }

  const finalCharsTyped = Math.max(0, live.finalCharsTyped);
  return {
    correctChars: Math.min(Math.max(0, live.correctChars), Math.max(finalCharsTyped, 0)),
    incorrectChars: Math.max(0, live.incorrectChars),
    extraChars: Math.max(0, live.extraChars),
    finalCharsTyped,
  };
}

/** Accuracy exactly as the backend computes it. */
export function computeAccuracy(
  uncorrectedErrors: number,
  correctedErrors: number,
  totalKeystrokes: number
): number {
  if (totalKeystrokes <= 0) return 100;
  const penalty = uncorrectedErrors + CORRECTION_PENALTY * correctedErrors;
  return Math.max(0, Math.min(100, (1 - penalty / totalKeystrokes) * 100));
}

/** Net and raw WPM exactly as the backend computes them. */
export function computeWpm(chars: CharacterCounts, durationSeconds: number) {
  const minutes = Math.max(durationSeconds / 60, 1 / 60);
  const raw = (chars.correctChars + chars.incorrectChars + chars.extraChars) / 5 / minutes;
  const net = Math.min(chars.correctChars / 5 / minutes, raw);
  return { netWpm: net, rawWpm: raw };
}

export interface ConfusionEntry {
  expected: string;
  actual: string;
  count: number;
}

export interface WordErrorEntry {
  word: string;
  count: number;
}

/** Aggregate expected->actual confusions from a keystroke log. */
export function buildConfusions(
  log: Array<{ key: string; expected?: string; correct?: boolean }>
): ConfusionEntry[] {
  const map = new Map<string, number>();
  for (const entry of log) {
    if (entry.key === "Backspace" || entry.key === "Delete") continue;
    if (entry.correct !== false) continue;
    if (!entry.expected) continue;
    const actual = entry.key === "Space" ? " " : entry.key;
    if (actual === entry.expected) continue;
    const id = `${entry.expected}\u001f${actual}`;
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([id, count]) => {
      const [expected, actual] = id.split("\u001f");
      return { expected, actual, count };
    })
    .sort((a, b) => (a.expected === b.expected ? a.actual.localeCompare(b.actual) : a.expected.localeCompare(b.expected)));
}

/** Words that still carry a mistake in the final text. */
export function buildWordErrors(wordResults: WordResult[]): WordErrorEntry[] {
  const out: WordErrorEntry[] = [];
  for (const w of wordResults) {
    const target = w.original ?? "";
    const typed = w.typed ?? "";
    if (!target) continue;
    let errors = 0;
    const shared = Math.min(target.length, typed.length);
    for (let c = 0; c < shared; c++) {
      if (typed[c] !== target[c]) errors++;
    }
    if (typed.length > target.length) errors += typed.length - target.length;
    if (typed.length < target.length) errors += target.length - typed.length;
    if (errors > 0) out.push({ word: target, count: errors });
  }
  return out;
}
