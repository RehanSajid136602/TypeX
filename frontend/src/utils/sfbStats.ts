// ---------------------------------------------------------------------------
// Same-Finger Bigram (SFB) & per-finger latency aggregation.
//
// The raw learn-mode keystroke log carries a flight time for EVERY keystroke,
// including the first key of a word (which includes the previous word's space
// and any thinking pause), backspace corrections and wrong keys. Averaging
// those raw numbers with an EMA produced 1600-2000ms "bigram latencies".
//
// This pure helper is the single place that turns the keystroke log into
// trustworthy numbers:
//   * a bigram is two consecutive CORRECT letters in the same word,
//   * struck by the same finger on two DIFFERENT keys (not "ll"),
//   * with no space / mistyped key / backspace / correction in between,
//   * flight times above PAUSE_CAP_MS are pauses, not latency, so they drop,
//   * each bigram/finger is aggregated with the MEDIAN and needs MIN_SAMPLES.
// ---------------------------------------------------------------------------

export const PAUSE_CAP_MS = 1000;
export const MIN_SAMPLES = 3;
export const TOP_SFB_LIMIT = 3;

export type FingerId =
  | "L_PINKY"
  | "L_RING"
  | "L_MIDDLE"
  | "L_INDEX"
  | "R_INDEX"
  | "R_MIDDLE"
  | "R_RING"
  | "R_PINKY";

export const FINGER_LABELS: Record<FingerId, string> = {
  L_PINKY: "L pinky",
  L_RING: "L ring",
  L_MIDDLE: "L middle",
  L_INDEX: "L index",
  R_INDEX: "R index",
  R_MIDDLE: "R middle",
  R_RING: "R ring",
  R_PINKY: "R pinky",
};

// Characters grouped by the finger that strikes them. Mirrors the C++ engine's
// biomechanical map (learning_engine.hpp). The first list wins on overlap, so
// y/h/n stay with the right index and b stays with the left index.
const KEY_FINGERS: [string, FingerId][] = [
  ["`~1!qaz", "L_PINKY"],
  ["2@wsx", "L_RING"],
  ["3#edc", "L_MIDDLE"],
  ["tgv", "L_INDEX"],
  ["4$5%rfb", "L_INDEX"],
  ["6^yhn", "R_INDEX"],
  ["7&ujm", "R_INDEX"],
  ["8*ik,<", "R_MIDDLE"],
  ["9(ol.>", "R_RING"],
  ["0)-_=+p[]{};:'\"/?\\|", "R_PINKY"],
];

const CHAR_FINGERS: Record<string, FingerId> = {};
for (const [chars, finger] of KEY_FINGERS) {
  for (const ch of chars) CHAR_FINGERS[ch] = finger;
}

export const fingerOf = (char: string): FingerId | undefined =>
  CHAR_FINGERS[char.toLowerCase()];

/** Human readable finger name for a bigram ("same key" for "ll"). */
export const describeBigram = (bigram: string): string => {
  if (bigram.length >= 2 && bigram[0].toLowerCase() === bigram[1].toLowerCase()) {
    return "same key";
  }
  const finger =
    CHAR_FINGERS[bigram[0]?.toLowerCase()] ?? CHAR_FINGERS[bigram[1]?.toLowerCase()];
  return finger ? FINGER_LABELS[finger] : "—";
};

/** Minimal shape of a logged learn-mode keystroke. */
export interface FlightKeystroke {
  expected: string;
  actual?: string;
  flightMs: number;
  correct: boolean;
  isDrill?: boolean;
  /** True when the key only exists because an earlier mistake was fixed. */
  corrected?: boolean;
}

export interface SfbStat {
  bigram: string;
  medianMs: number;
  samples: number;
  finger?: FingerId;
}

export interface FingerLatencyStat {
  finger: FingerId;
  medianMs: number;
  samples: number;
}

const isValidLetter = (ch: string | undefined): ch is string =>
  Boolean(ch) && ch!.length > 0 && /[a-z]/i.test(ch!);

export const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** A keystroke that can be trusted as a latency sample. */
const isCleanCorrect = (k: FlightKeystroke): boolean =>
  k.correct && !k.corrected && isValidLetter(k.expected);

/** Keep only plausible latencies; anything above the cap is a pause. */
const keepFlight = (ms: number): boolean =>
  Number.isFinite(ms) && ms > 0 && ms <= PAUSE_CAP_MS;

/** Per-finger latency samples, straight from the shared filtered stream. */
export function collectKeystrokeSamples(
  keystrokes: readonly FlightKeystroke[],
  every = false
): { expected: string; flightMs: number }[] {
  const out: { expected: string; flightMs: number }[] = [];
  keystrokes.forEach((k, i) => {
    if (!isCleanCorrect(k)) return;
    if (!keepFlight(k.flightMs)) return;
    if (!every) {
      // The previous keystroke must have been the immediately preceding correct
      // letter in the same word. Anything else (start of word, after a space,
      // after a mistake or a backspace) is not a key-to-key transition.
      const prev = keystrokes[i - 1];
      if (!prev || !isCleanCorrect(prev)) return;
      if (!keepFlight(prev.flightMs)) return;
    }
    out.push({ expected: k.expected, flightMs: k.flightMs });
  });
  return out;
}

/**
 * Per-finger median latency from the same filtered flight times as the SFB
 * card: correct keys only, pauses above the cap dropped. `every` counts every
 * clean keystroke of the finger (including the first key of a word), which is
 * what a per-finger latency card means; SFB pairs stay strictly word-internal.
 */
export function computeFingerLatency(
  keystrokes: readonly FlightKeystroke[],
  every = true
): Record<string, FingerLatencyStat> {
  const buckets = new Map<FingerId, number[]>();
  for (const sample of collectKeystrokeSamples(keystrokes, every)) {
    const finger = fingerOf(sample.expected);
    if (!finger) continue;
    const list = buckets.get(finger);
    if (list) list.push(sample.flightMs);
    else buckets.set(finger, [sample.flightMs]);
  }

  const result: Record<string, FingerLatencyStat> = {};
  buckets.forEach((values, finger) => {
    if (values.length < MIN_SAMPLES) return;
    result[finger] = {
      finger,
      medianMs: median(values),
      samples: values.length,
    };
  });
  return result;
}

/**
 * Same-finger bigram medians, slowest first.
 * Only bigrams with at least MIN_SAMPLES clean samples are reported.
 */
export function computeSfbStats(
  keystrokes: readonly FlightKeystroke[]
): SfbStat[] {
  const buckets = new Map<string, number[]>();

  for (let i = 1; i < keystrokes.length; i++) {
    const prev = keystrokes[i - 1];
    const cur = keystrokes[i];

    // Both keys must be correct letters typed back to back: no space, no
    // mistyped key, no backspace, no corrected (already fixed) key.
    if (!isCleanCorrect(prev) || !isCleanCorrect(cur)) continue;

    const a = prev.expected.toLowerCase();
    const b = cur.expected.toLowerCase();
    if (a === b) continue; // same-key repeat ("ll") is not a bigram

    const fingerA = fingerOf(a);
    const fingerB = fingerOf(b);
    if (!fingerA || fingerA !== fingerB) continue; // not a same-finger pair

    // The flight time belongs to the second keydown. Anything above the pause
    // cap is a pause, and the previous key must be trustworthy too: a keystroke
    // that followed a pause is a recovery keystroke, not a fluid transition.
    if (!keepFlight(cur.flightMs) || !keepFlight(prev.flightMs)) continue;

    const bigram = a + b;
    const list = buckets.get(bigram);
    if (list) list.push(cur.flightMs);
    else buckets.set(bigram, [cur.flightMs]);
  }

  const stats: SfbStat[] = [];
  buckets.forEach((values, bigram) => {
    if (values.length < MIN_SAMPLES) return;
    stats.push({
      bigram,
      medianMs: median(values),
      samples: values.length,
      finger: fingerOf(bigram[0]),
    });
  });

  return stats.sort((x, y) => y.medianMs - x.medianMs);
}
