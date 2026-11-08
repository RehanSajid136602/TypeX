import {
  computeFingerLatency,
  computeSfbStats,
  median,
  PAUSE_CAP_MS,
  MIN_SAMPLES,
  type FlightKeystroke,
} from "./sfbStats";

// Fixture helper: a clean, correct letter keystroke.
const k = (ch: string, flightMs: number, extra: Partial<FlightKeystroke> = {}): FlightKeystroke => ({
  expected: ch,
  actual: ch,
  flightMs,
  correct: true,
  ...extra,
});

// A realistic "edededed" word typed at ~300ms, then a 2000ms thinking pause and
// a 460ms recovery keystroke. Only fluid key-to-key pairs may count.
const edRealistic: FlightKeystroke[] = [
  k("e", 280),
  k("d", 300),
  k("e", 310),
  k("d", 320),
  k("e", 330),
  k("d", 340),
  k("e", 2000), // ← above PAUSE_CAP_MS (thinking pause, not latency)
  k("d", 460), // recovery keystroke after the pause: also discarded
  k("e", 260),
  k("d", 270),
  k("e", 300),
  k("d", 310),
  k("e", 320),
  k("d", 330),
];

// ── Test 1: a pair after a 1500ms pause is excluded ─────────────────────────
const pauseFixture: FlightKeystroke[] = [k("e", 200), k("d", 1500)];
const pauseStats = computeSfbStats(pauseFixture);
if (pauseStats.length !== 0) {
  throw new Error(`Test 1 failed: 1500ms pause not excluded (got ${JSON.stringify(pauseStats)})`);
}
// same for the per-finger card: the pause must not become a finger sample
const pauseFingers = computeFingerLatency(pauseFixture);
if (pauseFingers.L_MIDDLE !== undefined) {
  throw new Error("Test 1 failed: paused keystroke leaked into finger latency");
}
console.log(`[Test 1] ✓ ${PAUSE_CAP_MS}ms cap drops the 1500ms pair entirely`);

// ── Test 2: a pair across a space is excluded ───────────────────────────────
// "ed" ... space ... "nd": the space keystroke sits between the keys, so the
// letter pair is not consecutive. Cross-word pairs never qualify either.
const spaceFixture: FlightKeystroke[] = [
  k("e", 150),
  k("d", 250),
  { expected: " ", actual: " ", flightMs: 300, correct: true },
  k("e", 220), // first key of the NEXT word, previous keystroke was a space
  k("d", 260),
];
const spaceStats = computeSfbStats(spaceFixture);
if (spaceStats.length !== 0) {
  throw new Error(`Test 2 failed: space-separated pair counted (got ${JSON.stringify(spaceStats)})`);
}
console.log("[Test 2] ✓ pairs split by a space are excluded");

// ── Test 3: a same-key repeat is excluded ───────────────────────────────────
const repeatFixture: FlightKeystroke[] = [
  k("l", 120), k("l", 140), k("l", 160), k("l", 180),
];
const repeatStats = computeSfbStats(repeatFixture);
if (repeatStats.some((s) => s.bigram === "ll") || repeatStats.length !== 0) {
  throw new Error(`Test 3 failed: same-key repeat counted (got ${JSON.stringify(repeatStats)})`);
}
console.log("[Test 3] ✓ same-key repeat \"ll\" is excluded");

// ── Test 4: the median is used, not the mean ───────────────────────────────
if (median([300, 320, 340, 2000]) !== 330) {
  throw new Error(`Test 4 failed: median([300,320,340,2000]) = ${median([300, 320, 340, 2000])}`);
}
const edStats = computeSfbStats(edRealistic);
const ed = edStats.find((s) => s.bigram === "ed");
if (!ed) throw new Error("Test 4 failed: \"ed\" missing from SFB stats");
// "ed" samples: 300, 320, 340, 300, 310, 330 → median 315. The 2000ms pause
// and the 460ms recovery keystroke are gone; a mean would have been pulled far
// above 300ms by them.
if (ed.medianMs !== 315) {
  throw new Error(`Test 4 failed: "ed" median = ${ed.medianMs}ms (expected 315)`);
}
if (ed.samples !== 6) {
  throw new Error(`Test 4 failed: "ed" samples = ${ed.samples} (expected 6)`);
}
console.log(`[Test 4] ✓ "ed" median ${ed.medianMs}ms over ${ed.samples} samples (2000ms pause excluded)`);

// ── Test 5: minimum sample count + sorting ─────────────────────────────────
const sparse: FlightKeystroke[] = [k("n", 100), k("m", 200), k("n", 210)]; // only one "nm"
if (computeSfbStats(sparse).length !== 0) {
  throw new Error(`Test 5 failed: bigram with < ${MIN_SAMPLES} samples was reported`);
}

const multi: FlightKeystroke[] = [
  // "ed" x3 @ ~300ms
  k("e", 100), k("d", 300), k("e", 300), k("d", 300), k("e", 300), k("d", 300),
  // "tr" x3 @ ~180ms
  k("t", 100), k("r", 180), k("t", 180), k("r", 180), k("t", 180), k("r", 180),
];
const multiStats = computeSfbStats(multi);
if (multiStats.length !== 2) {
  throw new Error(`Test 5 failed: expected 2 bigrams, got ${JSON.stringify(multiStats)}`);
}
if (multiStats[0].bigram !== "ed" || multiStats[0].medianMs !== 300) {
  throw new Error(`Test 5 failed: slowest-first ordering broken (${JSON.stringify(multiStats)})`);
}
console.log(`[Test 5] ✓ slowest first: ${multiStats.map((s) => `${s.bigram}=${s.medianMs}ms/n=${s.samples}`).join(", ")}`);

// ── Test 6: mistyped / corrected keys break the pair ───────────────────────
const dirty: FlightKeystroke[] = [
  k("e", 100),
  { expected: "d", actual: "s", flightMs: 400, correct: false }, // mistype
  k("d", 200), // corrected re-type: still adjacent to a bad key
  k("e", 200),
  k("d", 210, { corrected: true }), // flagged correction
];
if (computeSfbStats(dirty).length !== 0) {
  throw new Error("Test 6 failed: mistyped/corrected keys still counted");
}
console.log("[Test 6] ✓ mistyped keys and corrected keys break the pair");

// ── Test 7: finger latency uses the same filtered flight times ──────────────
const fingerSamples = computeFingerLatency(edRealistic);
const leftMiddle = fingerSamples.L_MIDDLE;
if (!leftMiddle) throw new Error("Test 7 failed: L_MIDDLE finger latency missing");
const cleanFlights = edRealistic.filter((s) => s.flightMs <= PAUSE_CAP_MS).map((s) => s.flightMs);
if (leftMiddle.medianMs !== median(cleanFlights)) {
  throw new Error(
    `Test 7 failed: finger card ${leftMiddle.medianMs}ms vs filtered median ${median(cleanFlights)}ms`
  );
}
if (leftMiddle.medianMs > PAUSE_CAP_MS / 2) {
  throw new Error(`Test 7 failed: finger latency ${leftMiddle.medianMs}ms still looks like a pause`);
}
// Same-filter check: with the word-internal rule the finger stream carries
// exactly the samples that end an SFB pair (both "ed" and "de" counts).
const wordInternal = computeFingerLatency(edRealistic, false);
const wordInternalFlights: number[] = [];
for (let i = 1; i < edRealistic.length; i++) {
  const prev = edRealistic[i - 1];
  const cur = edRealistic[i];
  if (!prev.correct || !cur.correct) continue;
  if (prev.flightMs > PAUSE_CAP_MS || cur.flightMs > PAUSE_CAP_MS) continue;
  wordInternalFlights.push(cur.flightMs);
}
if (wordInternal.L_MIDDLE?.samples !== wordInternalFlights.length) {
  throw new Error(
    `Test 7 failed: word-internal finger samples ${wordInternal.L_MIDDLE?.samples} != ${wordInternalFlights.length}`
  );
}
console.log(
  `[Test 7] ✓ L middle ${leftMiddle.medianMs}ms over ${leftMiddle.samples} clean samples; ` +
    `word-internal view n=${wordInternal.L_MIDDLE?.samples} (matches SFB stream)`
);

console.log("\n=======================================================");
console.log("🎉 ALL SFB HELPER TESTS PASSED");
console.log("=======================================================");
