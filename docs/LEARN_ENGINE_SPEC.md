# TypeX Learn Engine Specification

## 1. Overview
The TypeX Learn Engine implements a strict key-by-key neuromuscular typing curriculum designed to build automatic muscle memory. Unlike generic typing curricula that introduce arbitrary vocabulary or premature full-keyboard words, TypeX strictly gates access so learners only encounter letters they have mastered.

## 2. Curriculum Key Order & Progression
Keys are introduced one by one according to optimal English digraph frequency and finger biomechanics:
```
e → n → i → t → r → l → s → a → o → d → y → c → h → g → m → u → p → b → k → v → w → f → z → x → q → j
```
Total keys: **26**.

At each stage $i \in [1, 26]$:
- Let $K_{\text{unlocked}} = \{k_1, k_2, \dots, k_{i-1}\}$.
- Let $k_{\text{target}} = k_i$.
- Allowed character set: $\Sigma_{\text{allowed}} = K_{\text{unlocked}} \cup \{k_{\text{target}}\}$.
- **Invariant:** Every word $W$ presented in the lesson strictly satisfies:
  $$\forall c \in W, \quad c \in \Sigma_{\text{allowed}}$$
  **No word ever contains a locked character.**

## 3. Lesson Synthesis & 3-Phase Structure
Lessons consist of 3 pedagogical phases:
1. **Phase A · Flow Warm-Up (~20% of lesson):**
   - Composed exclusively of words from $K_{\text{unlocked}}$.
   - Awakens muscle memory and finger dexterity for already mastered keys.
   - For key 1 (`e`), synthesizes single-key cadence tokens (`e`, `ee`, `eee`).
2. **Phase B · Target Key Isolation & Drill (~60% of lesson):**
   - Every word strictly contains $k_{\text{target}}$ between 1 and 3 times.
   - Interleaves spaced repetition words from previously missed attempts (`repairedWordsPool_`).
   - Guarantees a minimum of **50 target key characters** per lesson so the unlock gate requirement can always be achieved in a single clean run.
3. **Phase C · Rhythm & Cadence (~20% of lesson):**
   - Alternating flow words and target words to balance speed, finger recovery, and fluid transitions.

### Markov Bigram Fallback (Pattern Drill)
- If the available dictionary count of real English words satisfying $\Sigma_{\text{allowed}}$ is $< 40$, the engine activates the **Markov Bigram Pseudo-Word Generator**.
- Uses an authentic English bigram transition matrix normalized over the allowed alphabet $\Sigma_{\text{allowed}}$.
- Words are flagged with `isPatternDrill: true`, and the UI displays a specialized **Pattern Drill** badge.
- When $\ge 40$ real words exist (from key `l` onward), authentic vocabulary from `english_10k` and `english_25k` is used exclusively.

## 4. 98% First-Attempt Unlock Gate
Advancing to the next key requires rigorous neuromuscular consistency:
- **Accuracy Threshold:** $\ge 98.0\%$ first-attempt accuracy (`UNLOCK_ACCURACY = 98.0`).
- **Target Keystroke Volume:** $\ge 50$ first-attempt target key strokes (`MIN_TARGET_ATTEMPTS = 50`).
- **First-Attempt Strictness:**
  - Backspacing and correcting an error does **not** erase the mistake; the key index is permanently marked as an error.
  - Drill keystrokes (from the Neural Lock-In Drill) are tagged `isDrill: true` and **excluded** from gate calculations.
  - Telemetry formula:
    $$\text{Accuracy}_{\text{target}} = \frac{\text{firstAttemptAttempts} - \text{firstAttemptErrors}}{\text{firstAttemptAttempts}} \times 100$$
    - 50/50 target strokes (100.0%) $\to$ **PASS** (unlocks next key).
    - 49/50 target strokes (98.0%) $\to$ **PASS** (unlocks next key).
    - 48/50 target strokes (96.0%) $\to$ **FAIL** (target remains locked, missed words queued for spaced repetition).

## 5. Focus Mode & Distraction-Free Flow
- Focus mode activates immediately on the first keystroke of any session.
- Header, config bar, and footer smoothly dim to `opacity-0 pointer-events-none`.
- **Focus Mode Invariants:**
  - Survives Neural Lock-In Drill transitions without flashing the screen.
  - Survives idle pauses $> 10\text{s}$ (no mouse timer reveals chrome while user pauses).
  - Unintentional mouse jitter ($< 80\text{px}$) is ignored.
  - Restored only on deliberate swipe ($\ge 80\text{px}$ in $\le 300\text{ms}$), pressing `Escape`, or completing the test.

## 6. Profile Persistence & Schema Migration
- Mastery state is persisted in SQLite (`mastery_profiles` table).
- Automatically migrates profiles to schema **version 3**:
  - Preserves all previously mastered keys (`status = "mastered"`, confidence score).
  - Adds `firstAttemptAttempts` and `firstAttemptErrors` tracking fields.
