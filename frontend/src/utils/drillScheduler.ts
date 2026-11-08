// ---------------------------------------------------------------------------
// TypeX Neural Lock-In Drill — Interleaved Active-Learning Scheduler
// ---------------------------------------------------------------------------

export interface DrillItem {
  id: string;
  word: string;
  isPadding: boolean;
}

export interface DrillState {
  targetWords: string[];
  paddingWords: string[];
  cleanCounts: Record<string, number>;
  queue: DrillItem[];
  isComplete: boolean;
}

const NEUTRAL_DISTRACTORS = [
  "focus",
  "tempo",
  "rhythm",
  "drift",
  "pulse",
  "align",
  "flow",
  "spark",
  "stride",
];

/**
 * Standard unbiased Fisher-Yates array shuffle.
 */
export function shuffleFisherYates<T>(array: T[], rng: () => number = Math.random): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Finds confusable padding words from the active corpus that contain the same
 * mistyped characters or bigrams as the missed target words.
 */
export function findConfusableWords(
  missedWords: string[],
  corpus: string[],
  countNeeded: number
): string[] {
  if (countNeeded <= 0) return [];

  const chars = new Set<string>();
  const bigrams = new Set<string>();

  for (const w of missedWords) {
    const lower = w.toLowerCase().trim();
    for (let i = 0; i < lower.length; i++) {
      chars.add(lower[i]);
      if (i < lower.length - 1) {
        bigrams.add(lower.slice(i, i + 2));
      }
    }
  }

  const missedLower = new Set(missedWords.map((w) => w.toLowerCase().trim()));
  const candidates: { word: string; score: number }[] = [];
  const seenCandidate = new Set<string>();

  for (const w of corpus) {
    const lower = w.toLowerCase().trim();
    if (!lower || missedLower.has(lower) || seenCandidate.has(lower)) continue;
    seenCandidate.add(lower);

    let score = 0;
    // Score bigram overlaps
    for (let i = 0; i < lower.length - 1; i++) {
      if (bigrams.has(lower.slice(i, i + 2))) score += 3;
    }
    // Score character overlaps
    for (let i = 0; i < lower.length; i++) {
      if (chars.has(lower[i])) score += 1;
    }
    // Bonus for similar word length
    const avgLen =
      missedWords.length > 0
        ? missedWords.reduce((acc, mw) => acc + mw.length, 0) / missedWords.length
        : 5;
    if (Math.abs(lower.length - avgLen) <= 2) score += 1;

    candidates.push({ word: lower, score });
  }

  // Sort by highest confusable score
  candidates.sort((a, b) => b.score - a.score);

  const result: string[] = [];
  for (const c of candidates) {
    result.push(c.word);
    if (result.length >= countNeeded) break;
  }

  // Fallback if corpus lacks enough matching words
  if (result.length < countNeeded) {
    for (const fb of NEUTRAL_DISTRACTORS) {
      if (!missedLower.has(fb) && !result.includes(fb)) {
        result.push(fb);
        if (result.length >= countNeeded) break;
      }
    }
  }

  return result;
}

/**
 * Generates an initial shuffled queue mixing all words together (single pass).
 * Guarantees that the same word never appears twice in a row (unless the pool
 * contains only 1 distinct word total).
 */
export function createInitialDrillQueue(
  targetWords: string[],
  paddingWords: string[] = [],
  rng: () => number = Math.random
): DrillItem[] {
  if (targetWords.length === 0) return [];

  let counter = 0;
  const pool: DrillItem[] = [
    ...targetWords.map((w) => ({
      id: `target-${w}-${counter++}`,
      word: w,
      isPadding: false,
    })),
    ...paddingWords.map((w) => ({
      id: `pad-${w}-${counter++}`,
      word: w,
      isPadding: true,
    })),
  ];

  if (pool.length <= 1) {
    return [pool[0]];
  }

  const roundItems = shuffleFisherYates(pool, rng);

  // Prevent duplicates inside roundItems
  for (let i = 1; i < roundItems.length; i++) {
    if (roundItems[i].word === roundItems[i - 1].word) {
      const swapIdx = roundItems.findIndex(
        (it, idx) => idx > i && it.word !== roundItems[i - 1].word
      );
      if (swapIdx > 0) {
        [roundItems[i], roundItems[swapIdx]] = [roundItems[swapIdx], roundItems[i]];
      }
    }
  }

  return roundItems;
}

/**
 * Helper to pick a distractor word from neutral distractor pool that isn't excluded.
 */
function pickDistractor(exclude: Set<string>): string {
  for (const fb of NEUTRAL_DISTRACTORS) {
    if (!exclude.has(fb)) return fb;
  }
  return "flow";
}

/**
 * Re-inserts a word into the queue 2-3 positions later.
 * Guarantees that the re-inserted word NEVER appears back-to-back with itself,
 * and maintains spacing so other words are practiced in between.
 */
export function reinsertDrillWord(
  queue: DrillItem[],
  item: DrillItem,
  minOffset: number = 2,
  maxOffset: number = 3,
  excludeWords: Set<string> = new Set(),
  rng: () => number = Math.random
): DrillItem[] {
  // Ensure no existing duplicate of this word remains in the queue
  const result = queue.filter((it) => it.word !== item.word);

  const freshItem: DrillItem = {
    ...item,
    id: `${item.word}-${Date.now()}-${Math.floor(rng() * 10000)}`,
  };

  const createSep = (additionalExclude: Set<string>): DrillItem => {
    const combinedExclude = new Set([...excludeWords, ...additionalExclude]);
    const word = pickDistractor(combinedExclude);
    return {
      id: `pad-sep-${Date.now()}-${Math.floor(rng() * 10000)}`,
      word,
      isPadding: true,
    };
  };

  // If queue is empty, pad with separators so freshItem is not immediately next
  if (result.length === 0) {
    const sep1 = createSep(new Set([freshItem.word]));
    const sep2 = createSep(new Set([freshItem.word, sep1.word]));
    return [sep1, sep2, freshItem];
  }

  // If front of queue is already freshItem.word, prepend a separator
  if (result[0].word === freshItem.word) {
    const sep = createSep(new Set([freshItem.word]));
    result.unshift(sep);
  }

  if (result.length === 1) {
    // result is [otherWord], pad so freshItem is 2 positions later
    const sep = createSep(new Set([freshItem.word, result[0].word]));
    return [result[0], sep, freshItem];
  }

  // Target index between minOffset and maxOffset (default 2 to 3)
  const targetOffset =
    Math.floor(rng() * (maxOffset - minOffset + 1)) + minOffset;

  const isConflict = (idx: number) => {
    const prev = result[idx - 1];
    const next = result[idx];
    return (
      (prev && prev.word === freshItem.word) ||
      (next && next.word === freshItem.word)
    );
  };

  // Try positions from 1 to result.length (never index 0)
  const validIndices: number[] = [];
  for (let pos = 1; pos <= result.length; pos++) {
    if (!isConflict(pos)) {
      validIndices.push(pos);
    }
  }

  if (validIndices.length > 0) {
    validIndices.sort(
      (a, b) => Math.abs(a - targetOffset) - Math.abs(b - targetOffset)
    );
    result.splice(validIndices[0], 0, freshItem);
    return result;
  }

  // If conflicts everywhere, append separator then freshItem
  const lastWord = result[result.length - 1]?.word;
  const sep = createSep(new Set([freshItem.word, lastWord]));
  result.push(sep, freshItem);
  return result;
}

/**
 * Initializes a clean, interleaved active-learning drill state.
 */
export function initDrillState(
  rawTargetWords: string[],
  corpus: string[] = [],
  rng: () => number = Math.random
): DrillState {
  const distinctTargets = Array.from(
    new Set(rawTargetWords.map((w) => w.trim().toLowerCase()).filter(Boolean))
  );

  if (distinctTargets.length === 0) {
    return {
      targetWords: [],
      paddingWords: [],
      cleanCounts: {},
      queue: [],
      isComplete: true,
    };
  }

  // If fewer than 3 distinct missed words, pad queue with confusable words
  const paddingNeeded = Math.max(0, 3 - distinctTargets.length);
  const paddingWords =
    paddingNeeded > 0
      ? findConfusableWords(distinctTargets, corpus, paddingNeeded)
      : [];

  const cleanCounts: Record<string, number> = {};
  for (const w of distinctTargets) {
    cleanCounts[w] = 0;
  }

  const queue = createInitialDrillQueue(distinctTargets, paddingWords, rng);

  return {
    targetWords: distinctTargets,
    paddingWords,
    cleanCounts,
    queue,
    isComplete: false,
  };
}

/**
 * Transitions the drill state upon a user typing outcome (clean or mistake).
 *
 * Invariants maintained:
 * 1. cleanCounts is the single source of truth.
 * 2. When cleanCounts[word] >= 3, ALL occurrences of word are purged from queue.
 * 3. Never shows an already-mastered word again.
 * 4. Padding words are not counted in N and never block completion.
 * 5. Drill finishes immediately when all target words reach >= 3 clean passes.
 * 6. Mistakes decrement clean count by 1 (min 0) and re-insert 2-3 positions later.
 * 7. Never shows the same word back-to-back (unless only 1 distinct word exists).
 */
export function recordDrillOutcome(
  state: DrillState,
  outcome: "clean" | "mistake",
  candidatePoolOrRng?: string[] | (() => number),
  maybeRng?: () => number
): DrillState {
  const rng =
    typeof candidatePoolOrRng === "function"
      ? candidatePoolOrRng
      : maybeRng || Math.random;

  if (state.isComplete || state.queue.length === 0) {
    return { ...state, isComplete: true, queue: [] };
  }

  const currentItem = state.queue[0];
  const word = currentItem.word;
  const isPadding = currentItem.isPadding;

  // Mastered words must NEVER be used as distractors or shown again
  const masteredSet = new Set(
    state.targetWords.filter((w) => (state.cleanCounts[w] || 0) >= 3)
  );
  const allTargetsSet = new Set(state.targetWords);

  if (outcome === "clean") {
    if (!isPadding) {
      const currentClean = state.cleanCounts[word] || 0;
      const nextClean = currentClean + 1;
      const newCleanCounts = { ...state.cleanCounts, [word]: nextClean };

      if (nextClean >= 3) {
        masteredSet.add(word);

        // Mastered! Purge ALL occurrences of ALL mastered words from the queue
        const remainingQueue = state.queue
          .slice(1)
          .filter((it) => !masteredSet.has(it.word));

        // Check if all target words are mastered
        const allDone = state.targetWords.every(
          (w) => (newCleanCounts[w] || 0) >= 3
        );
        if (allDone) {
          return {
            ...state,
            cleanCounts: newCleanCounts,
            queue: [],
            isComplete: true,
          };
        }

        // If remaining queue is empty but unmastered targets remain, replenish with unmastered targets
        let nextQueue = remainingQueue;
        if (nextQueue.length === 0) {
          const unmastered = state.targetWords.filter(
            (w) => (newCleanCounts[w] || 0) < 3
          );
          const safePadding = NEUTRAL_DISTRACTORS.filter((d) => !allTargetsSet.has(d));
          nextQueue = createInitialDrillQueue(
            unmastered,
            unmastered.length < 3 ? safePadding.slice(0, 3 - unmastered.length) : [],
            rng
          );
        } else {
          // Guard against back-to-back duplicate if filtering created one
          if (nextQueue.length > 1 && nextQueue[0].word === nextQueue[1].word) {
            const swapIdx = nextQueue.findIndex(
              (it, i) => i > 1 && it.word !== nextQueue[0].word
            );
            if (swapIdx > 1) {
              [nextQueue[1], nextQueue[swapIdx]] = [nextQueue[swapIdx], nextQueue[1]];
            }
          }
        }

        return {
          ...state,
          cleanCounts: newCleanCounts,
          queue: nextQueue,
          isComplete: false,
        };
      } else {
        // Clean pass but not yet mastered (clean < 3): re-insert 2-3 slots later
        const remainingQueue = state.queue
          .slice(1)
          .filter((it) => !masteredSet.has(it.word) && it.word !== word);
        const nextQueue = reinsertDrillWord(
          remainingQueue,
          currentItem,
          2,
          3,
          allTargetsSet,
          rng
        );

        return {
          ...state,
          cleanCounts: newCleanCounts,
          queue: nextQueue,
          isComplete: false,
        };
      }
    } else {
      // Padding word typed clean: does not affect mastery
      const allDone = state.targetWords.every(
        (w) => (state.cleanCounts[w] || 0) >= 3
      );
      if (allDone) {
        return {
          ...state,
          queue: [],
          isComplete: true,
        };
      }

      const remainingQueue = state.queue
        .slice(1)
        .filter((it) => !masteredSet.has(it.word));
      let nextQueue = remainingQueue;
      if (nextQueue.length === 0) {
        const unmastered = state.targetWords.filter(
          (w) => (state.cleanCounts[w] || 0) < 3
        );
        const safePadding = NEUTRAL_DISTRACTORS.filter((d) => !allTargetsSet.has(d));
        nextQueue = createInitialDrillQueue(
          unmastered,
          unmastered.length < 3 ? safePadding.slice(0, 3 - unmastered.length) : [],
          rng
        );
      }

      return {
        ...state,
        queue: nextQueue,
        isComplete: false,
      };
    }
  } else {
    // Mistake
    if (!isPadding) {
      const currentClean = state.cleanCounts[word] || 0;
      const nextClean = Math.max(0, currentClean - 1);
      const newCleanCounts = { ...state.cleanCounts, [word]: nextClean };

      const remainingQueue = state.queue
        .slice(1)
        .filter((it) => !masteredSet.has(it.word) && it.word !== word);
      const nextQueue = reinsertDrillWord(
        remainingQueue,
        currentItem,
        2,
        3,
        allTargetsSet,
        rng
      );

      return {
        ...state,
        cleanCounts: newCleanCounts,
        queue: nextQueue,
        isComplete: false,
      };
    } else {
      // Mistake on padding word: re-insert 2-3 slots later without changing target cleanCounts
      const remainingQueue = state.queue
        .slice(1)
        .filter((it) => !masteredSet.has(it.word));
      const nextQueue = reinsertDrillWord(
        remainingQueue,
        currentItem,
        2,
        3,
        allTargetsSet,
        rng
      );

      return {
        ...state,
        queue: nextQueue,
        isComplete: false,
      };
    }
  }
}
