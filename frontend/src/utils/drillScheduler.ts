// ---------------------------------------------------------------------------
// TypeX Neural Lock-In Drill — Interleaved Active-Learning Scheduler
// ---------------------------------------------------------------------------

export interface DrillItem {
  id: string;
  word: string;
  isPadding: boolean;
}

/**
 * Standard unbiased Fisher-Yates array shuffle.
 */
export function shuffleFisherYates<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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
    const fallbacks = [
      "about",
      "other",
      "which",
      "their",
      "there",
      "would",
      "write",
      "could",
      "first",
      "water",
      "sound",
      "place",
    ];
    for (const fb of fallbacks) {
      if (!missedLower.has(fb) && !result.includes(fb)) {
        result.push(fb);
        if (result.length >= countNeeded) break;
      }
    }
  }

  return result;
}

/**
 * Generates an initial shuffled queue mixing all words together.
 * Guarantees that the same word never appears twice in a row (unless the pool
 * contains only 1 distinct word total).
 */
export function createInitialDrillQueue(
  targetWords: string[],
  paddingWords: string[] = []
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

  const queue: DrillItem[] = [];
  // Buffer 2 cycles of shuffled pool
  const rounds = 2;
  for (let r = 0; r < rounds; r++) {
    const roundItems = shuffleFisherYates(pool).map((item) => ({
      ...item,
      id: `${item.id}-r${r}`,
    }));

    // Prevent duplicate across round boundary
    if (
      queue.length > 0 &&
      roundItems[0].word === queue[queue.length - 1].word &&
      roundItems.length > 1
    ) {
      const swapIdx = roundItems.findIndex(
        (it) => it.word !== queue[queue.length - 1].word
      );
      if (swapIdx > 0) {
        [roundItems[0], roundItems[swapIdx]] = [roundItems[swapIdx], roundItems[0]];
      }
    }

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

    queue.push(...roundItems);
  }

  return queue;
}

/**
 * Helper to pick a distractor word from candidate pool or fallbacks that isn't excluded.
 */
function pickDistractor(exclude: Set<string>, pool: string[]): string {
  for (const w of pool) {
    if (!exclude.has(w)) return w;
  }
  const fallbacks = ["focus", "tempo", "rhythm", "drift", "pulse", "align"];
  for (const fb of fallbacks) {
    if (!exclude.has(fb)) return fb;
  }
  return "flow";
}

/**
 * Re-inserts a word into the queue 2-3 positions later.
 * Guarantees that the re-inserted word NEVER appears back-to-back with itself,
 * and maintains spacing so other words are practiced in between.
 *
 * @param queue Current remaining queue (after removing the active word)
 * @param item The DrillItem to re-insert
 * @param minOffset Minimum slots later (default 2)
 * @param maxOffset Maximum slots later (default 3)
 * @param candidatePool Optional pool of candidate words to pick separators from
 */
export function reinsertDrillWord(
  queue: DrillItem[],
  item: DrillItem,
  minOffset: number = 2,
  maxOffset: number = 3,
  candidatePool: string[] = []
): DrillItem[] {
  const result = [...queue];
  const freshItem: DrillItem = {
    ...item,
    id: `${item.word}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  };

  const createSep = (exclude: Set<string>): DrillItem => {
    const word = pickDistractor(exclude, candidatePool);
    return {
      id: `pad-sep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
    Math.floor(Math.random() * (maxOffset - minOffset + 1)) + minOffset;

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
