import {
  initDrillState,
  recordDrillOutcome,
} from "./drillScheduler";

// Simple reproducible pseudo-random generator
function createSeededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export interface SimulationReport {
  completed: boolean;
  steps: number;
  shownMasteredWords: string[];
  backToBackViolations: number;
  finalCleanCounts: Record<string, number>;
}

export function runDrillSimulation(
  targetWords: string[],
  corpus: string[],
  scriptedMistakes: Record<string, number[]>, // word -> steps where mistake occurs
  seed: number = 42,
  maxSteps: number = 300
): SimulationReport {
  const rng = createSeededRandom(seed);
  let state = initDrillState(targetWords, corpus, rng);
  const shownMasteredWords: string[] = [];
  let backToBackViolations = 0;
  let lastWord = "";

  let step = 0;
  while (!state.isComplete && state.queue.length > 0 && step < maxSteps) {
    step++;
    const current = state.queue[0];
    const word = current.word;

    // Check if an already-mastered target word is ever shown
    if (!current.isPadding && (state.cleanCounts[word] || 0) >= 3) {
      shownMasteredWords.push(word);
    }

    // Check back-to-back violation (if more than 1 distinct word in drill pool)
    if (lastWord === word && state.targetWords.length + state.paddingWords.length > 1) {
      backToBackViolations++;
    }
    lastWord = word;

    const mistakes = scriptedMistakes[word] || [];
    const isMistake = mistakes.includes(step);

    state = recordDrillOutcome(
      state,
      isMistake ? "mistake" : "clean",
      corpus,
      rng
    );
  }

  return {
    completed: state.isComplete,
    steps: step,
    shownMasteredWords,
    backToBackViolations,
    finalCleanCounts: state.cleanCounts,
  };
}

console.log("=== Running Neural Lock-In Drill Scheduler Tests ===");

// ── Test 1: 8 target words, clean passes + scripted mistakes ─────────────────
const targets8 = ["apple", "banana", "cherry", "date", "elderberry", "fig", "grape", "honeydew"];
const corpus = ["apple", "banana", "cherry", "date", "elderberry", "fig", "grape", "honeydew", "lemon", "mango", "orange", "papaya", "quince", "raspberry"];

const scripted1: Record<string, number[]> = {
  apple: [2],       // Mistake on step 2
  cherry: [5, 12],   // Mistakes on steps 5 and 12
  honeydew: [8],    // Mistake on step 8
};

const rep1 = runDrillSimulation(targets8, corpus, scripted1, 101);
console.log("[Test 1] 8 words with mistakes:");
console.log(`  Completed: ${rep1.completed} in ${rep1.steps} steps`);
console.log(`  Shown mastered words: ${rep1.shownMasteredWords.length} (expected: 0)`);
console.log(`  Back-to-back violations: ${rep1.backToBackViolations} (expected: 0)`);

if (!rep1.completed) throw new Error("Test 1 failed: drill did not complete!");
if (rep1.shownMasteredWords.length > 0) throw new Error(`Test 1 failed: mastered words shown: ${rep1.shownMasteredWords}`);
if (rep1.backToBackViolations > 0) throw new Error(`Test 1 failed: back to back violations: ${rep1.backToBackViolations}`);
console.log("  ✓ Test 1 PASSED!");

// ── Test 2: 1 target word (padded with confusable words) ──────────────────────
const targets1 = ["whisper"];
const scripted2: Record<string, number[]> = {
  whisper: [3], // 1 mistake on step 3
};

const rep2 = runDrillSimulation(targets1, corpus, scripted2, 202);
console.log("\n[Test 2] 1 target word (queue padded with confusable words):");
console.log(`  Completed: ${rep2.completed} in ${rep2.steps} steps`);
console.log(`  Final clean count for whisper: ${rep2.finalCleanCounts["whisper"]}`);
console.log(`  Shown mastered words: ${rep2.shownMasteredWords.length}`);

if (!rep2.completed) throw new Error("Test 2 failed: 1-word drill did not complete!");
if (rep2.finalCleanCounts["whisper"] < 3) throw new Error("Test 2 failed: whisper clean count < 3!");
if (rep2.shownMasteredWords.length > 0) throw new Error("Test 2 failed: whisper shown after reaching 3 clean passes!");
console.log("  ✓ Test 2 PASSED!");

// ── Test 3: Random Walk Trials (50 simulations with random error rates) ───────
console.log("\n[Test 3] 50 Random Walk Trials across different seeds & error rates...");
let totalTrials = 50;
for (let t = 0; t < totalTrials; t++) {
  const seed = 1000 + t;
  const trialRng = createSeededRandom(seed);
  const wordsCount = 3 + Math.floor(trialRng() * 6); // 3 to 8 words
  const chosenTargets = targets8.slice(0, wordsCount);

  // Script mistakes based on random chance
  const mistakes: Record<string, number[]> = {};
  for (const w of chosenTargets) {
    mistakes[w] = [];
    for (let s = 1; s <= 200; s++) {
      if (trialRng() < 0.2) mistakes[w].push(s); // 20% mistake rate
    }
  }

  const rep = runDrillSimulation(chosenTargets, corpus, mistakes, seed);
  if (!rep.completed) {
    throw new Error(`Trial ${t} failed to complete within max steps (seed ${seed})`);
  }
  if (rep.shownMasteredWords.length > 0) {
    throw new Error(`Trial ${t} showed mastered word (seed ${seed}): ${rep.shownMasteredWords}`);
  }
}
console.log("  ✓ Test 3 PASSED! 50/50 randomized drill simulations terminated with 0 mastered words shown!");

console.log("\n=======================================================");
console.log("🎉 ALL NEURAL LOCK-IN DRILL TESTS PASSED 100%!");
console.log("=======================================================");
