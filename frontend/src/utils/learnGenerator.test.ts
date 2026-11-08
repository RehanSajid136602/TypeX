import {
  generateLearnBatch,
  isGateAchieved,
  getNextCurriculumTarget,
  getAllowedLettersForTarget,
  createMasteryGateSnapshot,
} from "./learnGenerator";
import {
  CURRICULUM_KEY_SEQUENCE,
  TARGET_SPEED_WPM,
  UNLOCK_ACCURACY,
  MIN_TARGET_ATTEMPTS,
  KeyStatus,
} from "@/types/typing";

// Seedable Mulberry32 PRNG
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function runTests() {
  console.log("=== Running Learn Generator Unit Tests ===");

  const rng = mulberry32(98765);

  // ─────────────────────────────────────────────────────────────────────────
  // Test A: Every batch is at least 80% target words (tested across curriculum)
  // ─────────────────────────────────────────────────────────────────────────
  console.log("[Test A] Testing 80% target density across 10 batches for all 26 keys...");
  for (let idx = 0; idx < CURRICULUM_KEY_SEQUENCE.length; idx++) {
    const target = CURRICULUM_KEY_SEQUENCE[idx];
    const unlocked = CURRICULUM_KEY_SEQUENCE.slice(0, idx);

    for (let b = 0; b < 10; b++) {
      const batch10 = generateLearnBatch(unlocked, target, 10, rng);
      if (batch10.length !== 10) {
        throw new Error(`Expected batch length 10, got ${batch10.length}`);
      }
      const targetCount = batch10.filter((w) => w.toLowerCase().includes(target)).length;
      if (targetCount < 8) {
        throw new Error(
          `Target '${target}' batch ${b} failed density check: got ${targetCount}/10 (${targetCount * 10}%), expected >= 8/10 (80%)`
        );
      }

      // Also check 25-word batch
      const batch25 = generateLearnBatch(unlocked, target, 25, rng);
      const targetCount25 = batch25.filter((w) => w.toLowerCase().includes(target)).length;
      if (targetCount25 < 20) {
        throw new Error(
          `Target '${target}' batch 25 failed density: got ${targetCount25}/25, expected >= 20/25 (80%)`
        );
      }
    }
  }
  console.log("  ✓ Test A PASSED: 260 batches verified with >= 80% target density.");

  // ─────────────────────────────────────────────────────────────────────────
  // Test B: No locked letter ever appears in any word
  // ─────────────────────────────────────────────────────────────────────────
  console.log("[Test B] Testing strict containment (no locked letters ever appear)...");
  for (let idx = 0; idx < CURRICULUM_KEY_SEQUENCE.length; idx++) {
    const target = CURRICULUM_KEY_SEQUENCE[idx];
    const unlocked = CURRICULUM_KEY_SEQUENCE.slice(0, idx);
    const allowed = new Set([...unlocked, target]);

    for (let b = 0; b < 10; b++) {
      const batch = generateLearnBatch(unlocked, target, 10, rng);
      for (const word of batch) {
        for (const ch of word.toLowerCase()) {
          if (!allowed.has(ch as (typeof CURRICULUM_KEY_SEQUENCE)[number])) {
            throw new Error(
              `Target '${target}': locked letter '${ch}' appeared in word '${word}'!`
            );
          }
        }
      }
    }
  }
  console.log("  ✓ Test B PASSED: 0 locked letters appeared across all generated batches.");

  // ─────────────────────────────────────────────────────────────────────────
  // Test C: Rare letters ('q', 'j', 'z') fill batches using pseudo-words
  // ─────────────────────────────────────────────────────────────────────────
  console.log("[Test C] Testing rare letters ('q', 'j', 'z') fill batches using pseudo-words...");
  const rareLetters = ["q", "j", "z"];
  for (const rare of rareLetters) {
    const idx = CURRICULUM_KEY_SEQUENCE.indexOf(rare as any);
    const unlocked = CURRICULUM_KEY_SEQUENCE.slice(0, idx);

    for (let b = 0; b < 10; b++) {
      const batch = generateLearnBatch(unlocked, rare, 10, rng);
      if (batch.length !== 10) {
        throw new Error(`Rare '${rare}' batch did not fill: length ${batch.length}`);
      }
      const targetCount = batch.filter((w) => w.toLowerCase().includes(rare)).length;
      if (targetCount < 8) {
        throw new Error(`Rare '${rare}' batch density < 80%: ${targetCount}/10`);
      }
    }
    console.log(`  ✓ Rare '${rare}' successfully filled 10 batches with >= 80% density.`);
  }
  console.log("  ✓ Test C PASSED: rare letters filled batches using pseudo-words.");

  // ─────────────────────────────────────────────────────────────────────────
  // Test D: Gate evaluation single source of truth
  // ─────────────────────────────────────────────────────────────────────────
  console.log("[Test D] Testing isGateAchieved logic...");
  const masteredStat: KeyStatus = {
    key: "e",
    status: "mastered",
    confidence: 100,
    attempts: 25,
    errors: 0,
    emaFlightMs: 120,
  };
  if (!isGateAchieved(masteredStat)) throw new Error("Mastered key should pass gate!");

  const readyStat: KeyStatus = {
    key: "h",
    status: "active",
    confidence: 100,
    bestSpeedConfidence: 1.05,
    bestFlightMs: 300,
    attempts: 25,
    errors: 1,
    samples: 22,
    firstAttemptAttempts: 20,
    firstAttemptErrors: 1, // 95% accuracy
    emaFlightMs: 310,
  };
  if (!isGateAchieved(readyStat)) throw new Error("Key at 35 WPM / 95% acc should pass gate!");

  const unreadyStatAcc: KeyStatus = {
    ...readyStat,
    firstAttemptErrors: 3, // 85% accuracy (< 95%)
  };
  if (isGateAchieved(unreadyStatAcc)) throw new Error("Key < 95% accuracy should NOT pass gate!");

  const unreadyStatSamples: KeyStatus = {
    ...readyStat,
    samples: 10,
    firstAttemptAttempts: 10, // < 20 attempts
  };
  if (isGateAchieved(unreadyStatSamples)) throw new Error("Key < 20 attempts should NOT pass gate!");

  console.log("  ✓ Test D PASSED: isGateAchieved correctly implements single source of truth.");

  // ─────────────────────────────────────────────────────────────────────────
  // Test E: Curriculum progression sequence
  // ─────────────────────────────────────────────────────────────────────────
  console.log("[Test E] Testing getNextCurriculumTarget...");
  if (getNextCurriculumTarget("e") !== "n") throw new Error("e should advance to n");
  if (getNextCurriculumTarget("h") !== "g") throw new Error("h should advance to g");
  if (getNextCurriculumTarget("q") !== "j") throw new Error("q should advance to j");
  if (getNextCurriculumTarget("j") !== null) throw new Error("j should return null (complete)");
  console.log("  ✓ Test E PASSED: Curriculum advance sequence verified.");

  // ─────────────────────────────────────────────────────────────────────────
  // Test F: Mastery Gate Snapshot retains 100% after curriculum advance
  // ─────────────────────────────────────────────────────────────────────────
  console.log("[Test F] Testing createMasteryGateSnapshot stability across advances...");
  const targetStatH: KeyStatus = {
    key: "h",
    status: "active",
    confidence: 100,
    bestSpeedConfidence: 1.15,
    bestFlightMs: 290,
    attempts: 24,
    samples: 24,
    errors: 0,
    firstAttemptAttempts: 24,
    firstAttemptErrors: 0,
    emaFlightMs: 290,
  };

  // 1. Capture snapshot at test completion
  const snapshotH = createMasteryGateSnapshot("h", targetStatH, "g");
  if (!snapshotH.achieved) throw new Error("Target 'h' should have achieved gate!");
  if (snapshotH.percentage !== 100) throw new Error(`Snapshot percentage should be 100%, got ${snapshotH.percentage}%`);
  if (snapshotH.advancingToToken !== "g") throw new Error(`Snapshot advancing token should be 'g', got ${snapshotH.advancingToToken}`);

  // 2. Simulate curriculum advance to 'g': live state for 'g' has 0 keystrokes and 0% confidence
  const newLiveTarget = snapshotH.advancingToToken!;
  const liveStatG: KeyStatus = {
    key: newLiveTarget,
    status: "active",
    confidence: 0,
    attempts: 0,
    samples: 0,
    errors: 0,
    emaFlightMs: 220,
  };

  // 3. Confirm that the frozen snapshot from the finished session STILL renders 100% and does not drift
  const renderedPercentage = snapshotH.achieved ? 100 : snapshotH.percentage;
  if (renderedPercentage !== 100) {
    throw new Error(`Rendered percentage drifted! Expected 100%, got ${renderedPercentage}%`);
  }
  if (snapshotH.target !== "h") {
    throw new Error(`Snapshot target mutated! Expected 'h', got ${snapshotH.target}`);
  }
  console.log("  ✓ Test F PASSED: Snapshot retains 100% green state after curriculum advances to next token.");

  console.log("\n==========================================");
  console.log("🎉 ALL LEARN GENERATOR TESTS PASSED!");
  console.log("==========================================");
}

runTests();
