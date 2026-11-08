import {
  CURRICULUM_KEY_SEQUENCE,
  TARGET_SPEED_WPM,
  UNLOCK_ACCURACY,
  MIN_TARGET_ATTEMPTS,
  KeyStatus,
  MasteryGateSnapshot,
} from "@/types/typing";
import { MONKEYTYPE_ENGLISH_1K } from "@/utils/monkeytypeWordlists";

const VOWELS = new Set(["a", "e", "i", "o", "u", "y"]);

/**
 * Returns the single-source-of-truth gate evaluation for a given KeyStatus.
 *
 * Target gate criteria:
 * - Status is already "mastered" -> true
 * - Target strokes >= MIN_TARGET_ATTEMPTS (20)
 * - Best flight time > 0 and speed confidence >= 1.0 (>= 100% at 35 WPM)
 * - First attempt accuracy >= UNLOCK_ACCURACY (95.0%)
 */
export function isGateAchieved(stat?: KeyStatus | null): boolean {
  if (!stat) return false;
  if (stat.status === "mastered") return true;

  const attempts = Math.max(
    stat.samples || 0,
    stat.firstAttemptAttempts || 0,
    stat.attempts || 0
  );
  if (attempts < MIN_TARGET_ATTEMPTS) return false;

  const bestFlight = stat.bestFlightMs ?? 0;
  if (bestFlight <= 0) return false;

  const speedConf =
    stat.bestSpeedConfidence !== undefined
      ? stat.bestSpeedConfidence
      : stat.confidence !== undefined
      ? stat.confidence / 100
      : 0;

  const fAttempts =
    stat.firstAttemptAttempts && stat.firstAttemptAttempts > 0
      ? stat.firstAttemptAttempts
      : attempts;
  const fErrors = stat.firstAttemptErrors ?? stat.errors ?? 0;
  const accuracy = fAttempts > 0 ? (1 - fErrors / fAttempts) * 100 : 100;

  return speedConf >= 1.0 && accuracy >= UNLOCK_ACCURACY;
}

/**
 * Retrieves the next letter in the guided curriculum sequence.
 * Returns null if curriculum is complete (after 'j').
 */
export function getNextCurriculumTarget(currentTarget: string): string | null {
  const t = currentTarget.toLowerCase();
  const idx = CURRICULUM_KEY_SEQUENCE.indexOf(t as (typeof CURRICULUM_KEY_SEQUENCE)[number]);
  if (idx === -1) {
    return CURRICULUM_KEY_SEQUENCE[0];
  }
  if (idx + 1 < CURRICULUM_KEY_SEQUENCE.length) {
    return CURRICULUM_KEY_SEQUENCE[idx + 1];
  }
  return null; // Curriculum complete after 'j'
}

/**
 * Captures ONE frozen snapshot from the gate function for a target letter.
 * Clamps percentage to 0-100, forces 100% in green when achieved is true,
 * and preserves exact keystrokes done/required and accuracy.
 */
export function createMasteryGateSnapshot(
  target: string,
  stat?: KeyStatus | null,
  advancingToToken?: string
): MasteryGateSnapshot {
  const achieved = isGateAchieved(stat);
  const attempts = Math.max(
    stat?.samples || 0,
    stat?.firstAttemptAttempts || 0,
    stat?.attempts || 0
  );
  const fAttempts =
    stat?.firstAttemptAttempts && stat.firstAttemptAttempts > 0
      ? stat.firstAttemptAttempts
      : attempts;
  const fErrors = stat?.firstAttemptErrors ?? stat?.errors ?? 0;
  const accuracy = fAttempts > 0 ? (1 - fErrors / fAttempts) * 100 : 100;

  const speedConf =
    stat?.bestSpeedConfidence !== undefined
      ? stat.bestSpeedConfidence
      : stat?.confidence !== undefined
      ? stat.confidence / 100
      : 0;

  // When achieved, percentage is strictly 100%; below the gate, show actual amber progress (0-99%)
  const rawPercentage = Math.round(speedConf * 100);
  const percentage = achieved
    ? 100
    : Math.min(99, Math.max(0, rawPercentage));

  const nextToken = advancingToToken || getNextCurriculumTarget(target) || undefined;

  return {
    target: target.toLowerCase(),
    percentage,
    achieved,
    keystrokesDone: attempts,
    keystrokesRequired: MIN_TARGET_ATTEMPTS,
    accuracy: Math.round(accuracy * 10) / 10,
    advancingToToken: nextToken,
  };
}

/**
 * Returns all letters unlocked up to and including the current target.
 */
export function getAllowedLettersForTarget(currentTarget: string): string[] {
  const t = currentTarget.toLowerCase();
  const idx = CURRICULUM_KEY_SEQUENCE.indexOf(t as (typeof CURRICULUM_KEY_SEQUENCE)[number]);
  if (idx === -1) {
    return Array.from(CURRICULUM_KEY_SEQUENCE);
  }
  return CURRICULUM_KEY_SEQUENCE.slice(0, idx + 1);
}

/**
 * Generates a pronounceable pseudo-word from the allowed letter set,
 * guaranteeing strict containment (zero locked letters) and placing the target
 * letter in varied positions (start, middle, end).
 */
export function generatePseudoWord(
  allowedSet: Set<string>,
  target: string,
  requireTarget: boolean = true,
  rng: () => number = Math.random
): string {
  const allowedList = Array.from(allowedSet);
  if (allowedList.length === 0) return target;

  const vowels = allowedList.filter((c) => VOWELS.has(c));
  const consonants = allowedList.filter((c) => !VOWELS.has(c));

  // Fallback to any allowed character if specific consonant/vowel is empty
  const vPool = vowels.length > 0 ? vowels : allowedList;
  const cPool = consonants.length > 0 ? consonants : allowedList;

  const patterns = [
    "CVC", "VCV", "CVV",
    "CVCV", "CVCC", "CCVC", "VCVC",
    "CVCVC", "CCVCV", "CVCCV",
  ];

  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const pattern = pick(patterns);

  const t = target.toLowerCase();
  const isTargetVowel = VOWELS.has(t);

  let targetSlot = -1;
  if (requireTarget && t.length === 1) {
    const matchingSlots: number[] = [];
    for (let i = 0; i < pattern.length; i++) {
      if (isTargetVowel && pattern[i] === "V") matchingSlots.push(i);
      else if (!isTargetVowel && pattern[i] === "C") matchingSlots.push(i);
    }
    targetSlot =
      matchingSlots.length > 0
        ? pick(matchingSlots)
        : Math.floor(rng() * pattern.length);
  }

  const chars: string[] = [];
  for (let i = 0; i < pattern.length; i++) {
    if (i === targetSlot) {
      chars.push(t);
    } else if (pattern[i] === "V") {
      chars.push(pick(vPool));
    } else {
      chars.push(pick(cPool));
    }
  }

  return chars.join("");
}

/**
 * Pure generator function for Learn Mode practice batches.
 *
 * Guarantees:
 * 1. At least 80% of words in every batch contain the target letter.
 * 2. Target-less filler words (up to 20%) are spread evenly through the interior
 *    of the batch (never clustered at the start or end).
 * 3. Strict containment: Every word uses only unlocked letters plus the target.
 *    A locked letter must never appear.
 * 4. Word source order: Real words first, pseudo-words if real-word pool is too small.
 * 5. Repetition prevention: No word repeats within the last 15 words, and no single
 *    word takes more than ~10% of a batch.
 * 6. Diversity: Words with multiple target occurrences or varied positions are preferred.
 */
export function generateLearnBatch(
  unlockedLetters: string[] | Set<string>,
  target: string,
  size: number = 10,
  rng: () => number = Math.random,
  recentWords: string[] = [],
  corpus: readonly string[] = MONKEYTYPE_ENGLISH_1K
): string[] {
  if (size <= 0) return [];

  const t = target.toLowerCase();
  const unlockedSet = new Set(
    Array.from(unlockedLetters).map((c) => c.toLowerCase())
  );
  const allowedSet = new Set([...unlockedSet, t]);

  // 1. Separate real words from corpus
  const realTargetWords: string[] = [];
  const realFillerWords: string[] = [];

  for (const raw of corpus) {
    const w = raw.toLowerCase().trim();
    if (w.length < 2 || w.length > 8) continue;

    let valid = true;
    for (const c of w) {
      if (!allowedSet.has(c)) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;

    if (w.includes(t)) {
      realTargetWords.push(w);
    } else if (unlockedSet.size > 0) {
      let fillerValid = true;
      for (const c of w) {
        if (!unlockedSet.has(c)) {
          fillerValid = false;
          break;
        }
      }
      if (fillerValid) realFillerWords.push(w);
    }
  }

  // Prefer words where target appears more than once or at varied positions
  const sortedTargetReals = [...realTargetWords].sort((a, b) => {
    const countA = (a.match(new RegExp(t, "g")) || []).length;
    const countB = (b.match(new RegExp(t, "g")) || []).length;
    return countB - countA;
  });

  const minTargetCount = Math.ceil(size * 0.8);
  const maxFillerCount = size - minTargetCount;
  const maxWordFreq = Math.max(1, Math.round(size * 0.1));

  const slidingWindow: string[] = [...recentWords.slice(-15)];
  const batchWordCounts: Record<string, number> = {};

  const canUseWord = (w: string): boolean => {
    if (!w) return false;
    if (slidingWindow.includes(w)) return false;
    if ((batchWordCounts[w] || 0) >= maxWordFreq) return false;
    return true;
  };

  const pickTargetWord = (): string => {
    // 1. Real target words (with randomized slice of candidates)
    const shuffledReals = [...sortedTargetReals];
    for (let i = shuffledReals.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffledReals[i], shuffledReals[j]] = [shuffledReals[j], shuffledReals[i]];
    }

    for (const rw of shuffledReals) {
      if (canUseWord(rw)) return rw;
    }

    // 2. Pronounceable pseudo-word with target
    for (let attempt = 0; attempt < 50; attempt++) {
      const pw = generatePseudoWord(allowedSet, t, true, rng);
      if (canUseWord(pw) && pw.includes(t)) return pw;
    }

    // Fallback if heavily constrained
    const fallbackLen = Math.floor(rng() * 3) + 3;
    let fallback = t;
    const allowedArr = Array.from(allowedSet);
    while (fallback.length < fallbackLen) {
      fallback += allowedArr[Math.floor(rng() * allowedArr.length)];
    }
    return fallback;
  };

  const pickFillerWord = (): string => {
    if (unlockedSet.size === 0) {
      return pickTargetWord();
    }

    const shuffledFillers = [...realFillerWords];
    for (let i = shuffledFillers.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffledFillers[i], shuffledFillers[j]] = [shuffledFillers[j], shuffledFillers[i]];
    }

    for (const fw of shuffledFillers) {
      if (canUseWord(fw)) return fw;
    }

    // Pseudo-word filler (made ONLY from unlocked letters, never target)
    for (let attempt = 0; attempt < 50; attempt++) {
      const pw = generatePseudoWord(unlockedSet, "", false, rng);
      if (canUseWord(pw) && !pw.includes(t)) return pw;
    }

    // If no filler can be generated without repetition, use a target word
    return pickTargetWord();
  };

  // Determine filler positions evenly spaced through the interior (never index 0 or size - 1)
  const fillerIndices = new Set<number>();
  if (maxFillerCount > 0 && size >= 4 && unlockedSet.size > 0) {
    const step = size / (maxFillerCount + 1);
    for (let i = 1; i <= maxFillerCount; i++) {
      const idx = Math.min(size - 2, Math.max(1, Math.round(i * step) - 1));
      fillerIndices.add(idx);
    }
  }

  const batch: string[] = [];
  for (let i = 0; i < size; i++) {
    const isFiller = fillerIndices.has(i);
    const word = isFiller ? pickFillerWord() : pickTargetWord();
    batch.push(word);
    slidingWindow.push(word);
    if (slidingWindow.length > 15) slidingWindow.shift();
    batchWordCounts[word] = (batchWordCounts[word] || 0) + 1;
  }

  return batch;
}
