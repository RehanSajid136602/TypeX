export type TestMode = "time" | "words" | "learn" | "competition";

export type LearnTrack =
  | "phonetic_unlock"
  | "trigram_chunks"
  | "sfb_destroyer"
  | "finger_gym"
  | "cpp_symbols";

export type TimeOption = 15 | 30 | 60 | 120;
export type WordsOption = 10 | 25 | 50 | 100;
export type LineCountOption = 2 | 3 | 4;

// Single source of truth for the tier selector and for validating the
// persisted choice in localStorage. Order drives the UI order.
export const DICTIONARY_TIERS = [
  "english_200",
  "english_1k",
  "english_5k",
  "english_10k",
  "english_25k",
] as const;

export type DictionaryTier = (typeof DICTIONARY_TIERS)[number];

/** Display label for a tier, e.g. "english_25k" -> "25k". */
export const tierLabel = (tier: DictionaryTier): string => tier.replace("english_", "");

export type ErrorBehavior = "free" | "stop" | "strict";

export type ThemeName = "obsidian" | "tokyo" | "nordic";

export interface KeyStatus {
  key: string;
  confidence: number;
  emaFlightMs: number;
  attempts: number;
  errors: number;
  status: "mastered" | "active" | "unlocked" | "locked";
}

export interface FingerStat {
  finger: string;
  avgMs: number;
  accuracy: number;
  keystrokes: number;
  errors: number;
}

export interface ConfusionItem {
  expected: string;
  actual: string;
  count: number;
}

export interface SfbBottleneck {
  bigram: string;
  avgMs: number;
  count: number;
}

export interface LearnLessonResponse {
  track: LearnTrack;
  activeTarget: string;
  targetConfidence: number;
  unlockedKeys: string[];
  words: string[];
  phaseBreakdown: {
    warmup: [number, number];
    targetDrill: [number, number];
    cadence: [number, number];
  };
}

export interface LearnKeystroke {
  expected: string;
  actual: string;
  flightMs: number;
  correct: boolean;
}

export interface LearnSubmitPayload {
  track: LearnTrack;
  activeTarget: string;
  durationSeconds: number;
  keystrokes: LearnKeystroke[];
  repairedWords?: string[];
}

export interface MasteryDeltaReport {
  previousConfidence: number;
  newConfidence: number;
  confidenceDelta: number;
  unlockedNewTarget: boolean;
  newActiveTarget: string;
  weakestFinger: {
    finger: string;
    avgMs: number;
    accuracy: number;
  };
  topConfusions: ConfusionItem[];
  sfbBottlenecks: SfbBottleneck[];
  keyStatuses: KeyStatus[];
}

export interface MasteryStatus {
  keyStatuses: KeyStatus[];
  fingerStats: Record<string, FingerStat>;
  topConfusions: ConfusionItem[];
  sfbBottlenecks: SfbBottleneck[];
  trackActiveTarget: Record<string, string>;
  weakestFinger: {
    finger: string;
    avgMs: number;
    accuracy: number;
  };
}

export interface TelemetryPayload {
  durationSeconds: number;
  correctChars: number;
  incorrectChars: number;
  extraChars: number;
  missedChars: number;
  rawKeystrokesPerSecond: number[];
}

export interface WordResult {
  original: string;
  typed: string;
}

export interface TelemetryResult {
  netWpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  perSecondWpm: number[];
  correctChars: number;
  incorrectChars: number;
  extraChars: number;
  missedChars: number;
  correctedErrors?: number;
  uncorrectedErrors?: number;
  totalKeystrokes?: number;
  durationSeconds: number;
  wordResults?: WordResult[];
  keystrokesLog?: { key: string; time: number }[];
  startedAt?: number;
}

export interface PersonalBest {
  wpm: number;
  accuracy: number;
  date: string;
}

export interface WordData {
  original: string;
  typed: string;
}

// ─── Competition Mode Types ──────────────────────────────────────────────────

export interface CompetitionConfig {
  eventName: string;
  timeLimitSeconds: number;
  paragraphWordCount: number;
  tier: DictionaryTier | string;
  batchSize: number;
  paragraphRule: "same_for_batch" | "random_per_contestant";
  batchRevealsEnabled?: boolean;
  syncWindowSeconds?: number;
  revealHoldSeconds?: number;
  revealMode?: "instant" | "batch";
}

export interface CompetitionParagraph {
  id: string;
  text: string;
  wordCount: number;
  avgWordLength: number;
  tier: string;
}

export interface ContestantResult {
  netWpm: number;
  rawWpm: number;
  accuracy: number;
  errors: number;
  correctedErrors?: number;
  totalKeystrokes?: number;
  consistency: number;
  durationSeconds: number;
  correctChars: number;
  incorrectChars: number;
  extraChars: number;
  missedChars: number;
  completedAtEpochMs: number;
  perSecondWpm?: number[];
}

export interface ResultRecord {
  id: string;
  contestantId: string;
  name: string;
  regId: string;
  department: string;
  batchIndex: number;
  netWpm: number;
  rawWpm: number;
  accuracy: number;
  errors: number;
  correctedErrors?: number;
  totalKeystrokes?: number;
  consistency: number;
  durationSeconds: number;
  correctChars: number;
  incorrectChars: number;
  extraChars: number;
  missedChars: number;
  completedAtEpochMs: number;
  perSecondWpm?: number[];
}

export interface RevealState {
  id: string;
  kind: "synced-batch";
  contestantIds: string[];
  startedAt: number;
  endsAt: number;
}

export interface Contestant {
  id: string;
  name: string;
  regId: string;
  department: string;
  batchIndex: number;
  status: "pending" | "typing" | "completed" | "absent" | "disqualified";
  assignedParagraphId?: string;
  assignedParagraphText?: string;
  hasResult: boolean;
  redoAllowed?: boolean;
  result?: ContestantResult;
}

export interface LiveTypingStream {
  contestantId: string;
  currentWpm: number;
  currentAccuracy: number;
  cursorPosition: number;
  totalChars: number;
  errorCount: number;
  elapsedSeconds: number;
  lastHeartbeatEpochMs: number;
}

export type RoundState = "idle" | "ready" | "countdown" | "typing" | "finished";
export type ProjectorView = "overall" | "batch" | "podium" | "live";

export interface CompetitionState {
  config: CompetitionConfig;
  paragraphs: CompetitionParagraph[];
  contestants: Contestant[];
  results?: ResultRecord[];
  reveal?: RevealState | null;
  serverTimeEpochMs?: number;
  currentBatchIndex: number;
  activeContestantId: string;
  roundState: RoundState;
  projectorView: ProjectorView;
  countdownStartTimeEpochMs: number;
  typingStartTimeEpochMs: number;
  liveStream: LiveTypingStream;
}

