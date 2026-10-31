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

### Order-4 Phonetic Markov Generator
- When fewer than 15 authentic English words in `english_10k` match the active alphabet filter, the engine employs an **Order-4 Phonetic Markov Generator** (3-character context) trained on the top 10k English words.
- Generates natural, pronounceable pseudo-words that strictly adhere to the unlocked alphabet and focus key.
- Real words from `english_10k` are prioritized by frequency; rare words from 25k are excluded from guided lessons.

## 4. Keybr Target Speed Gate & Accuracy Guardrail
Advancing through the curriculum uses Keybr's speed-first confidence algorithm with an accuracy guardrail:
- **Target Speed:** 35.0 WPM (`TARGET_SPEED_WPM = 35.0`), corresponding to a target keystroke latency of $\approx 342.9\text{ ms}$.
- **Speed Confidence:** Measured as $\text{targetTimeMs} / \text{emaFlightMs} \ge 1.0$ (bestSpeedConfidence $\ge 1.0$).
- **Sample Guardrail:** $\ge 20$ valid keystroke samples (`MIN_TARGET_ATTEMPTS = 20`).
- **Accuracy Guardrail:** $\ge 95.0\%$ first-attempt accuracy (`UNLOCK_ACCURACY = 95.0`).
- **Focus Progression:**
  - Starts learners with the 6 most frequent keys: `e, n, i, t, r, l`.
  - Automatically targets the weakest unmastered included key to eliminate bottlenecks.
  - Telemetry formula:
    $$\text{Accuracy}_{\text{target}} = \frac{\text{firstAttemptAttempts} - \text{firstAttemptErrors}}{\text{firstAttemptAttempts}} \times 100$$

## 5. Focus Mode & Distraction-Free Flow
- Focus mode activates immediately on the first keystroke of any session.
- Header, config bar, and footer smoothly dim to `opacity-0 pointer-events-none`.
- **Focus Mode Invariants:**
  - Survives Neural Lock-In Drill transitions without flashing the screen.
  - Survives idle pauses $> 10\text{s}$ (no mouse timer reveals chrome while user pauses).
  - Unintentional mouse jitter ($< 80\text{px}$) is ignored.
  - Restored only on deliberate swipe ($\ge 80\text{px}$ in $\le 300\text{ms}$), pressing `Escape`, or completing the test.

## 6. Profile Persistence & Schema Migration
- Mastery state is persisted in JSON and SQLite (`mastery_profiles` table).
- Automatically migrates profiles to schema **version 4**:
  - Preserves all previously mastered keys (`status = "mastered"`, bestSpeedConfidence $\ge 1.0$).
  - Tracks `samples`, `bestFlightMs`, `speedConfidence`, and `bestSpeedConfidence`.
  - Manages multi-track progression across `phonetic_unlock`, `trigram_chunks`, `sfb_destroyer`, `finger_gym`, and `cpp_symbols`.
