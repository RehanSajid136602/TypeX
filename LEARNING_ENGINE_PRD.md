# TypeX Neuro-Motor Mastery & Adaptive Learning Engine PRD
**Version:** 2.0.0  
**Status:** Completed & Verified (All Phases 0–5 Passed)  
**Architect:** Principal C++17 Systems Architect & Staff Next.js Design Engineer

---

## 1. System Architecture Overview

TypeX is upgraded with an enterprise-grade **Neuro-Motor Mastery & Adaptive Learning Engine** (`learn` mode). The engine pairs low-level C++17 biomechanical telemetry with a minimalist, high-contrast reactive Next.js interface.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Next.js Frontend (/frontend)                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Navigation & ConfigBar: [time | words | learn]                   │  │
│  │ Learn Tracks: [unlock | trigrams | sfb | fingers | c++ symbols]  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ MasteryStrip: 26 Alphabet Keycaps + Active Target Live Readout   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ TypingArena with 3-Phase Lesson Engine & "3x Clean Lock-In" Drill│  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ KeyboardHUD: 60% ANSI Vector SVG, Biomechanical Guidance/Heatmap │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ MasteryDeltaView: Target Delta, 8-Finger Latencies, SFBs/Matrix  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Next.js API Routes (Proxy)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    Native C++17 Engine (/backend)                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Physical QWERTY Biomechanical Map & Transition Classifier        │  │
│  │ (Hands, Fingers, Rows, Alternation, In/Out Rolls, SFBs, Scissors)│  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Mastery Scoring (EMA), Spaced Repetition, & Confusion Matrix     │  │
│  │ (Flight Time EMA, Power Accuracy, 85% Mastery Unlock Gates)      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 3-Phase Lesson Synthesizer: Warmup -> Target/Repair -> Cadence   │  │
│  │ 5 Curriculum Tracks (Phonetic Unlock, Trigrams, SFB, Gym, C++)   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ JSON State Persistence: /backend/data/mastery_profile.json       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. API Specifications

| Method | Endpoint | Description | Status |
|---|---|---|---|
| `GET` | `/api/learn/status` | Complete mastery profile: 26 key statuses, 5 tracks, 8-finger stats, confusion matrix | Verified 200 OK |
| `GET` | `/api/learn/lesson?track={track}&count=25[&focusKey={k}]` | 3-Phase synthesized lesson with warmup, target/repair, cadence breakdown | Verified 200 OK |
| `POST` | `/api/learn/submit` | Ingests keystroke telemetry, updates EMAs, checks unlocks, returns delta report | Verified 200 OK |

---

## 3. High-Contrast Accessibility Mandate
Every keycap, guide label, finger badge, inactive control, and lock indicator strictly observes contrast standards across all 3 themes (`obsidian`, `tokyo`, `nordic`):
- Muted / Inactive / Locked states: minimum `opacity-65` and `#64748B` / `#7982A9` / `#818D9A` (never dark-on-dark invisible text).
- Active items: `opacity-100` in `var(--accent)` with glowing underdots/borders.
- Mastered items: `var(--typed)` foreground with `var(--accent)` 2px bottom milestone bar.

---

## 4. Phase-by-Phase Implementation Checklist

### Phase 0: Repository Audit & PRD Creation
- [x] Audit `/backend` routes, data directory, and C++ dependencies (`httplib.h`, `json.hpp`).
- [x] Audit `/frontend` state hooks, components, themes, and API route proxies.
- [x] Create `LEARNING_ENGINE_PRD.md` with architectural blueprint and checklist.

### Phase 1: C++17 Biomechanical & Neuro-Motor Mastery Engine (`/backend`)
- [x] Implement `backend/include/learning_engine.hpp` with QWERTY biomechanical map (`Finger`, `Hand`, `Row`).
- [x] Implement transition classifier `classifyTransition(char prev, char curr)` (`ALTERNATION`, `INWARD_ROLL`, `OUTWARD_ROLL`, `SAME_FINGER_BIGRAM`, `ROW_SCISSOR`).
- [x] Implement EMA flight time tracking, exponential accuracy scoring, and 85% confidence unlock gates.
- [x] Implement substitution confusion matrix (`"expected->actual"`) and per-finger telemetry.
- [x] Implement 5 curriculum tracks: `phonetic_unlock`, `trigram_chunks`, `sfb_destroyer`, `finger_gym`, and `cpp_symbols`.
- [x] Implement 3-phase lesson synthesizer (`Phase A: Warm-Up`, `Phase B: Target + Repair`, `Phase C: Speed Cadence`).
- [x] Implement state persistence to `/backend/data/mastery_profile.json` with auto-seeding.
- [x] Implement `/api/learn/status`, `/api/learn/lesson`, and `/api/learn/submit` HTTP endpoints in `backend/main.cpp`.
- [x] Compile C++ backend with `g++ -std=c++17 -O3 -Wall -Wextra -pthread` and verify zero warnings.

### Phase 2: Next.js Learning Mode & "3x Clean Lock-In" Repair Engine (`/frontend`)
- [x] Add `learn` mode to `TestMode` and create `LearnTrack` types in `frontend/src/types/typing.ts`.
- [x] Create Next.js API routes `frontend/src/app/api/learn/[...path]` proxying to C++ backend.
- [x] Update `ConfigBar.tsx` with primary mode selector (`time | words | learn`) and 5 curriculum track pills.
- [x] Create `MasteryStrip.tsx` with 26 alphabet keycaps, live target readout, and manual focus selection.
- [x] Integrate "3x Clean Lock-In" neural mistake repair state machine into `TypingArena.tsx`.
- [x] Implement smooth in-place transition to Neural Lock-In Drill with progress pips (`[ ● ● ○ ]`) and typo shake.

### Phase 3: Minimalist Vector Keyboard, Biomechanical Finger Guide & Heatmap (`/frontend`)
- [x] Create zero-lag pure SVG `KeyboardHUD.tsx` (60% ANSI layout with crisp hairline borders).
- [x] Implement Live Guided Mode: Next key illumination, Shift highlight, and biomechanical feedback badge (finger + transition type).
- [x] Implement Biomechanical Heatmap Mode with color-coded keycaps (Fast, Developing, Bottleneck) and hover tooltips.
- [x] Add top-bar toggle pill for Keyboard HUD visibility.

### Phase 4: Editorial "Mastery Delta" Post-Lesson View (`/frontend`)
- [x] Create `MasteryDeltaView.tsx` component rendered on lesson completion.
- [x] Build Hero Mastery Card showing confidence delta, animated progress bar, and unlock celebration banner.
- [x] Build 8-Finger Biomechanical Latency Strip with per-finger ms bars and weakest finger indicator.
- [x] Build Confusion Matrix & SFB bottleneck diagnostic cards with "Continue to Next Lesson (Enter)" affordance.
- [x] Wire seamless transition between lesson completion, delta report, and next lesson synthesis.

### Phase 5: Automated End-to-End Verification & Self-Confirmation
- [x] Verify clean C++ compilation on Linux with `-O3 -Wall -Wextra`.
- [x] Test `GET /api/learn/status` via `curl`.
- [x] Test `GET /api/learn/lesson` across `phonetic_unlock` and `cpp_symbols` tracks via `curl`.
- [x] Test `POST /api/learn/submit` with sample telemetry and verify `mastery_profile.json` persistence.
- [x] Verify zero regressions on legacy endpoints (`GET /api/words`, `POST /api/analyze`, `GET /api/health`, `GET /api/ghost`).
- [x] Run `npx tsc --noEmit` and `npm run build` in `/frontend` to verify clean build.
- [x] Update all checklist items to `- [x]` in `LEARNING_ENGINE_PRD.md`.
