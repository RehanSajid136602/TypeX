#pragma once

// ─────────────────────────────────────────────────────────────────────────────
// TypeX authoritative scoring model.
//
// This header is the single source of truth for every score TypeX reports.
// `POST /api/analyze` (displayed result) and `POST /api/accounts/tests`
// (persisted result) both build a `ScoringInput` from the same request fields
// and call `computeScore()`, so identical submissions cannot disagree.
//
// Contract for the counters, enforced by `normalize()`:
//   correctChars       characters that are correct in the FINAL submitted text.
//                      Never a cumulative retype count, never above
//                      `finalCharsTyped` (target chars + completed spaces).
//   incorrectChars     characters present in the final text that differ from
//                      the target. Excludes everything that was backspaced.
//   extraChars         characters typed past the end of a target word that
//                      still exist in the final text.
//   correctedErrors    wrong keystrokes that were later deleted/replaced. Used
//                      for the accuracy penalty only, never for WPM.
//   uncorrectedErrors  wrong-or-extra characters still present at submission.
//   totalKeystrokes    every printable key press, including retypes and
//                      corrections. Only ever a denominator for accuracy.
//
// Formulas:
//   netWpm   = (correctChars / 5) / minutes
//   rawWpm   = ((correctChars + incorrectChars + extraChars) / 5) / minutes
//   accuracy = 1 - (uncorrectedErrors + 0.5 * correctedErrors) / totalKeystrokes
//
// with `netWpm <= rawWpm` guaranteed by clamping.
// ─────────────────────────────────────────────────────────────────────────────

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <numeric>
#include <string>
#include <unordered_map>
#include <vector>

namespace typex {
namespace scoring {

// Partial credit for a mistake the typist fixed: a corrected error costs half
// of an error that is still in the final text.
inline constexpr double CORRECTION_PENALTY = 0.5;

// Plausibility ceilings. A submission above either is rejected, not clamped.
inline constexpr double MAX_NET_WPM = 320.0;
inline constexpr double MAX_RAW_WPM = 350.0;

struct ScoringInput {
    double durationSeconds = 0.0;

    int correctChars = 0;
    int incorrectChars = 0;
    int extraChars = 0;

    int correctedErrors = 0;
    int uncorrectedErrors = -1;  // -1 = derive from incorrectChars + extraChars
    int totalKeystrokes = 0;

    // Characters of the target text (plus completed word spaces) that the
    // typist actually reached. Enables the anti-inflation clamp. 0 = unknown.
    int finalCharsTyped = 0;

    // Optional per-second raw keystroke counts, for consistency.
    std::vector<double> rawKeystrokesPerSecond;
};

struct ScoringResult {
    double netWpm = 0.0;
    double rawWpm = 0.0;
    double accuracy = 100.0;
    double consistency = 100.0;

    int correctChars = 0;
    int incorrectChars = 0;
    int extraChars = 0;
    int correctedErrors = 0;
    int uncorrectedErrors = 0;
    int totalKeystrokes = 0;
    int finalCharsTyped = 0;

    bool implausible = false;  // netWpm or rawWpm above the ceilings
};

// Clamp the counters into the contract described at the top of this file.
// Every rule here is defensive: a well-behaved client already satisfies it,
// but a stale or hostile payload cannot inflate the score.
inline void normalize(ScoringInput& in) {
    in.durationSeconds = std::max(0.0, in.durationSeconds);

    in.correctChars = std::max(0, in.correctChars);
    in.incorrectChars = std::max(0, in.incorrectChars);
    in.extraChars = std::max(0, in.extraChars);
    in.correctedErrors = std::max(0, in.correctedErrors);
    in.totalKeystrokes = std::max(0, in.totalKeystrokes);
    in.finalCharsTyped = std::max(0, in.finalCharsTyped);

    // extraChars is a subset of what the typist actually wrote; never let it
    // exceed the characters they produced in the final text.
    if (in.extraChars > in.incorrectChars) {
        in.extraChars = in.incorrectChars;
    }

    // A retype cannot inflate correctness beyond the text that was reached.
    if (in.finalCharsTyped > 0 && in.correctChars > in.finalCharsTyped) {
        in.correctChars = in.finalCharsTyped;
    }

    // Uncorrected errors are whatever is wrong in the final text.
    const int derivedUncorrected = in.incorrectChars + in.extraChars;
    if (in.uncorrectedErrors < 0) {
        in.uncorrectedErrors = derivedUncorrected;
    } else {
        // A caller that over-reports uncorrected errors (e.g. because it still
        // carries backspaced characters) may not be punished for them.
        in.uncorrectedErrors = std::clamp(in.uncorrectedErrors, 0, derivedUncorrected);
    }

    // Every character in the final text was produced by some keystroke, and
    // every corrected error cost at least one extra keystroke.
    const int productiveKeystrokes =
        in.correctChars + in.incorrectChars + in.extraChars + in.correctedErrors;
    if (in.totalKeystrokes < productiveKeystrokes) {
        in.totalKeystrokes = productiveKeystrokes;
    }
    if (in.totalKeystrokes == 0 && in.finalCharsTyped > 0) {
        in.totalKeystrokes = in.finalCharsTyped;
    }
}

// Coefficient of variation of per-second keystroke counts, as a 0-100 score.
inline double consistencyFromKeystrokes(const std::vector<double>& perSecond) {
    if (perSecond.empty()) return 100.0;
    const double sum = std::accumulate(perSecond.begin(), perSecond.end(), 0.0);
    const double mean = sum / static_cast<double>(perSecond.size());
    if (mean <= 0.0001) return 0.0;
    double varianceSum = 0.0;
    for (double v : perSecond) {
        varianceSum += (v - mean) * (v - mean);
    }
    const double stddev = std::sqrt(varianceSum / static_cast<double>(perSecond.size()));
    const double cv = (stddev / mean) * 100.0;
    return std::clamp(100.0 - cv, 0.0, 100.0);
}

// The one and only scorer. Both HTTP endpoints call exactly this.
inline ScoringResult computeScore(ScoringInput in) {
    normalize(in);

    ScoringResult out;
    out.correctChars = in.correctChars;
    out.incorrectChars = in.incorrectChars;
    out.extraChars = in.extraChars;
    out.correctedErrors = in.correctedErrors;
    out.uncorrectedErrors = in.uncorrectedErrors;
    out.totalKeystrokes = in.totalKeystrokes;
    out.finalCharsTyped = in.finalCharsTyped;

    // Guard the time base: a zero duration must not produce infinite WPM.
    const double minutes = std::max(in.durationSeconds / 60.0, 1.0 / 60.0);

    const double netNumerator = static_cast<double>(in.correctChars);
    const double rawNumerator = static_cast<double>(in.correctChars + in.incorrectChars + in.extraChars);

    out.netWpm = (netNumerator / 5.0) / minutes;
    out.rawWpm = (rawNumerator / 5.0) / minutes;

    // Net can never exceed raw: you cannot average faster than you typed.
    if (out.netWpm > out.rawWpm) out.netWpm = out.rawWpm;

    if (in.totalKeystrokes > 0) {
        const double penalty =
            static_cast<double>(in.uncorrectedErrors) + CORRECTION_PENALTY * static_cast<double>(in.correctedErrors);
        out.accuracy = std::clamp(1.0 - (penalty / static_cast<double>(in.totalKeystrokes)), 0.0, 1.0) * 100.0;
    } else {
        out.accuracy = 100.0;
    }

    out.consistency = consistencyFromKeystrokes(in.rawKeystrokesPerSecond);

    out.implausible = out.netWpm > MAX_NET_WPM || out.rawWpm > MAX_RAW_WPM;
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Final-text accounting.
//
// The frontend knows the target text and what was actually typed into each
// word. These helpers derive the contract counters from that ground truth, so
// the numbers never depend on how many times a character was retyped.
// ─────────────────────────────────────────────────────────────────────────────

struct WordOutcome {
    std::string target;  // expected word
    std::string typed;   // what is in the input box for this word
};

struct FinalTextCounts {
    int correctChars = 0;
    int incorrectChars = 0;
    int extraChars = 0;
    int finalCharsTyped = 0;
    // Characters that differ from the target, and are therefore also
    // uncorrected errors (target characters replaced or extra characters).
    int mismatchedChars = 0;
};

// Compare every completed/submitted word against its target, character by
// character, and count only what survives in the final text.
inline FinalTextCounts countFinalText(const std::vector<WordOutcome>& words, bool /*unused*/) {
    FinalTextCounts counts;

    for (const auto& w : words) {
        const std::string& target = w.target;
        const std::string& typed = w.typed;

        const size_t shared = std::min(target.size(), typed.size());
        for (size_t c = 0; c < shared; ++c) {
            if (typed[c] == target[c]) {
                counts.correctChars++;
            } else {
                counts.incorrectChars++;
                counts.mismatchedChars++;
            }
        }

        // Characters typed past the end of the target word are "extra".
        if (typed.size() > target.size()) {
            const int overflow = static_cast<int>(typed.size() - target.size());
            counts.extraChars += overflow;
            counts.mismatchedChars += overflow;
        }

        // The target position the typist actually reached. An under-typed word
        // still counts the characters it did produce; skipping it entirely
        // contributes nothing.
        counts.finalCharsTyped += static_cast<int>(std::min(target.size(), typed.size()));
    }

    return counts;
}

// Variant used by the completion path: a finished word consumes the separator
// space that follows it in the target text.
//
// Two payload shapes are supported:
//   * words only          - the separator is synthesised after each submitted word
//   * words interleaved with explicit " " entries - the caller's separators are
//     authoritative and no extra space is added
inline FinalTextCounts countFinalTextWithSpaces(const std::vector<WordOutcome>& words) {
    FinalTextCounts counts;

    // If the caller models separators explicitly, trust them and never invent a
    // second space after a word. Otherwise synthesise one per submitted word.
    bool hasExplicitSpaces = false;
    for (const auto& w : words) {
        if (w.target == " ") {
            hasExplicitSpaces = true;
            break;
        }
    }

    for (size_t i = 0; i < words.size(); ++i) {
        const std::string& target = words[i].target;
        const std::string& typed = words[i].typed;
        const bool isLast = (i + 1 == words.size());

        // A caller may model the separating space as its own entry. It is a
        // real character in the final text, so count it directly and do not
        // add a second phantom separator after it.
        if (target == " ") {
            if (!typed.empty()) {
                counts.correctChars++;
                counts.finalCharsTyped++;
            }
            continue;
        }

        const size_t shared = std::min(target.size(), typed.size());
        for (size_t c = 0; c < shared; ++c) {
            if (typed[c] == target[c]) {
                counts.correctChars++;
            } else {
                counts.incorrectChars++;
                counts.mismatchedChars++;
            }
        }
        if (typed.size() > target.size()) {
            const int overflow = static_cast<int>(typed.size() - target.size());
            counts.extraChars += overflow;
            counts.mismatchedChars += overflow;
        }
        counts.finalCharsTyped += static_cast<int>(std::min(target.size(), typed.size()));

        // The separator space after a word the typist submitted. A word is
        // submitted when it was typed exactly to its length and is not the
        // final, still-in-progress word. Over-typed words do not earn the
        // space: the typist never pressed it.
        const bool submitted = !isLast && !typed.empty() && typed.size() == target.size();
        if (submitted && !hasExplicitSpaces) {
            counts.correctChars++;
            counts.finalCharsTyped++;
        }
    }
    return counts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Keystroke-log aggregation: per-key attempts/errors, confusions, word errors.
// ─────────────────────────────────────────────────────────────────────────────

struct LogEntry {
    std::string key;    // as sent ("a", "Space", "Backspace")
    int64_t time = 0;   // epoch ms
    std::string expected;  // target character, empty when unknown
    bool hasCorrectFlag = false;
    bool correct = true;
};

struct KeyAggregate {
    std::string key;
    int attempts = 0;
    int errors = 0;
    int flightMsSum = 0;
    int flightN = 0;
};

struct Telemetry {
    std::vector<KeyAggregate> keyStats;
    std::vector<std::tuple<std::string, std::string, int>> confusions;  // expected, typed, count
    std::vector<std::pair<std::string, int>> wordErrors;                // word, count
};

inline std::string normalizeKeyName(const std::string& key) {
    if (key == "Space" || key == " ") return " ";
    return key;
}

// Builds per-key stats attributed to the EXPECTED key (so a mistake teaches us
// which key is weak), plus expected->actual confusion pairs.
inline Telemetry aggregateKeystrokes(const std::vector<LogEntry>& log) {
    Telemetry out;
    std::unordered_map<std::string, size_t> keyIndex;
    std::unordered_map<std::string, int> confusionCount;

    auto keyFor = [&](const std::string& k) -> KeyAggregate& {
        auto it = keyIndex.find(k);
        if (it != keyIndex.end()) return out.keyStats[it->second];
        KeyAggregate agg;
        agg.key = k;
        out.keyStats.push_back(agg);
        keyIndex[k] = out.keyStats.size() - 1;
        return out.keyStats.back();
    };

    int64_t prevTime = 0;
    for (const auto& e : log) {
        if (e.key == "Backspace" || e.key == "Delete") continue;

        const std::string actual = normalizeKeyName(e.key);
        // Attribute to the expected key when the client supplies it; otherwise
        // the pressed key is the best available attribution.
        const std::string attributed =
            e.expected.empty() ? actual : (e.expected == " " ? " " : e.expected);

        KeyAggregate& agg = keyFor(attributed);
        agg.attempts++;

        if (e.hasCorrectFlag && !e.correct) {
            agg.errors++;
            // Only record a confusion when we know both sides and they differ.
            if (!e.expected.empty() && actual != attributed) {
                confusionCount[attributed + "\x1f" + actual]++;
            }
        }

        if (prevTime > 0 && e.time > prevTime) {
            const int flight = std::clamp(static_cast<int>(e.time - prevTime), 10, 1500);
            agg.flightMsSum += flight;
            agg.flightN++;
        }
        if (e.time > 0) prevTime = e.time;
    }

    for (const auto& kv : confusionCount) {
        const size_t sep = kv.first.find('\x1f');
        if (sep == std::string::npos) continue;
        out.confusions.emplace_back(kv.first.substr(0, sep), kv.first.substr(sep + 1), kv.second);
    }
    std::sort(out.confusions.begin(), out.confusions.end());

    return out;
}

// A word is "missed" when the typist left a mistake in it: either a wrong
// character, an extra character, or an expected character left out.
inline std::vector<std::pair<std::string, int>> wordErrorsFromOutcomes(
    const std::vector<WordOutcome>& words) {
    std::vector<std::pair<std::string, int>> out;
    for (const auto& w : words) {
        if (w.target.empty()) continue;
        int errs = 0;
        const size_t shared = std::min(w.target.size(), w.typed.size());
        for (size_t c = 0; c < shared; ++c) {
            if (w.typed[c] != w.target[c]) errs++;
        }
        if (w.typed.size() > w.target.size()) {
            errs += static_cast<int>(w.typed.size() - w.target.size());
        }
        if (w.typed.size() < w.target.size()) {
            errs += static_cast<int>(w.target.size() - w.typed.size());
        }
        if (errs > 0) out.emplace_back(w.target, errs);
    }
    return out;
}

}  // namespace scoring
}  // namespace typex
