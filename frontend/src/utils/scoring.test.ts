/**
 * Tests for the client scoring model (frontend/src/utils/scoring.ts).
 *
 * These mirror the backend assertions in tests/test_scoring.cpp, so a change on
 * either side that breaks parity fails here first.
 *
 * Run: pnpm --dir frontend exec tsx src/utils/scoring.test.ts
 */

import {
  buildConfusions,
  buildWordErrors,
  computeAccuracy,
  computeWpm,
  countFinalText,
  resolveCharacterCounts,
} from "./scoring";

let failures = 0;
let checks = 0;

function check(cond: boolean, what: string) {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  [FAIL] ${what}`);
  }
}

function checkNear(got: number, want: number, tol: number, what: string) {
  checks++;
  if (Math.abs(got - want) > tol) {
    failures++;
    console.log(`  [FAIL] ${what} (got ${got}, want ${want})`);
  }
}

// ── 1. Clean test ─────────────────────────────────────────────────────────────
console.log("[1] clean final text");
{
  const counts = countFinalText([
    { original: "the", typed: "the" },
    { original: "quick", typed: "quick" },
  ]);
  check(counts.correctChars === 9, "perfect: 8 letters + 1 space");
  check(counts.incorrectChars === 0, "perfect: no incorrect");
  check(counts.extraChars === 0, "perfect: no extra");
  check(counts.finalCharsTyped === 9, "perfect: 9 reached");

  const wpm = computeWpm({ ...counts, finalCharsTyped: counts.finalCharsTyped }, 60);
  checkNear(wpm.netWpm, wpm.rawWpm, 1e-9, "clean: net == raw");
  checkNear(computeAccuracy(0, 0, counts.correctChars), 100, 1e-9, "clean: accuracy 100");
}

// ── 2. Corrected errors never inflate WPM ────────────────────────────────────
console.log("[2] corrected errors do not inflate net wpm");
{
  const words = [
    { original: "the", typed: "the" },
    { original: "quick", typed: "quick" },
  ];
  const clean = countFinalText(words);
  const cleanWpm = computeWpm({ ...clean }, 60).netWpm;

  // Same final text, but the client reports cumulative retype counts.
  for (const corrected of [1, 10, 50]) {
    const resolved = resolveCharacterCounts(words, {
      correctChars: clean.correctChars + corrected, // cumulative retypes
      incorrectChars: corrected, // stale, never decremented
      extraChars: 0,
      finalCharsTyped: clean.finalCharsTyped,
    });
    const wpm = computeWpm({
      correctChars: resolved.correctChars,
      incorrectChars: resolved.incorrectChars,
      extraChars: resolved.extraChars,
      finalCharsTyped: resolved.finalCharsTyped,
    }, 60);
    checkNear(wpm.netWpm, cleanWpm, 1e-9, `net wpm unchanged with ${corrected} corrected errors`);
    check(wpm.netWpm <= wpm.rawWpm + 1e-9, `net <= raw with ${corrected} corrected`);
    check(
      resolved.correctChars <= resolved.finalCharsTyped,
      `correctChars clamped with ${corrected} corrected`
    );
  }
}

// ── 3. Fallback clamping when there are no word results ──────────────────────
console.log("[3] fallback clamping");
{
  const resolved = resolveCharacterCounts(undefined, {
    correctChars: 152, // cumulative retypes with no per-word truth
    incorrectChars: 0,
    extraChars: 0,
    finalCharsTyped: 150,
  });
  check(resolved.correctChars === 150, "fallback clamps correctChars to finalCharsTyped");
  const wpm = computeWpm(resolved, 60);
  checkNear(wpm.netWpm, 30.0, 1e-9, "fallback net wpm from capped chars");
}

// ── 4. Uncorrected errors ────────────────────────────────────────────────────
console.log("[4] uncorrected errors");
{
  const counts = countFinalText([
    { original: "the", typed: "teh" },
    { original: "quick", typed: "quick" },
  ]);
  check(counts.incorrectChars === 2, "swapped: 2 incorrect in final text");
  check(counts.mismatchedChars === 2, "swapped: 2 mismatched");
  const acc = computeAccuracy(counts.mismatchedChars, 0, 9);
  checkNear(acc, (1 - 2 / 9) * 100, 0.01, "swapped: accuracy reflects 2 errors");
  const wpm = computeWpm(counts, 60);
  check(wpm.netWpm < wpm.rawWpm, "swapped: net < raw");
}

// ── 5. Extra characters ──────────────────────────────────────────────────────
console.log("[5] extra characters");
{
  const counts = countFinalText([{ original: "the", typed: "thee" }]);
  check(counts.correctChars === 3, "extra: 3 correct");
  check(counts.extraChars === 1, "extra: 1 extra");
  check(counts.mismatchedChars === 1, "extra: 1 mismatched");
}

// ── 6. Telemetry maps ────────────────────────────────────────────────────────
console.log("[6] telemetry maps");
{
  const log = [
    { key: "h", expected: "t", correct: false },
    { key: "Backspace", correct: true },
    { key: "t", expected: "t", correct: true },
    { key: "h", expected: "e", correct: false },
    { key: "Backspace", correct: true },
    { key: "e", expected: "e", correct: true },
  ];
  const confusions = buildConfusions(log);
  check(confusions.length === 2, "confusions: two pairs");
  const pairs = confusions.map((c) => `${c.expected}->${c.actual}=${c.count}`).sort();
  check(pairs.includes("e->h=1"), "confusions: e->h");
  check(pairs.includes("t->h=1"), "confusions: t->h");

  const wordErrors = buildWordErrors([
    { original: "the", typed: "teh" },
    { original: "quick", typed: "quick" },
    { original: "fox", typed: "" },
  ]);
  check(wordErrors.length === 2, "wordErrors: two words");
  check(
    wordErrors.some((w) => w.word === "the") && wordErrors.some((w) => w.word === "fox"),
    "wordErrors: 'the' and skipped 'fox'"
  );
}

// ── 7. Legacy payload safety ─────────────────────────────────────────────────
console.log("[7] legacy payloads");
{
  // No `expected`/`correct` fields at all: must not throw, must not invent pairs.
  const confusions = buildConfusions([{ key: "a" }, { key: "b" }]);
  check(confusions.length === 0, "legacy log: no confusions invented");
  check(buildWordErrors([]).length === 0, "empty wordResults: no word errors");
}

console.log("");
if (failures === 0) {
  console.log(`[PASS] ${checks} checks passed.`);
} else {
  console.log(`[FAIL] ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
