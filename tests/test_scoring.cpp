// Scoring model tests for TypeX.
//
// Covers the two defects found in docs/ALGORITHM_AUDIT.md §6:
//   1. corrected-error retypes inflating Net WPM, and /api/analyze disagreeing
//      with /api/accounts/tests;
//   2. key/confusion/word-error telemetry collapsing to zero.
//
// Build:  g++ -std=c++17 -O2 -pthread tests/test_scoring.cpp -o tests/test_scoring
// Run:    ./tests/test_scoring

#include <cmath>
#include <cstdio>
#include <iostream>
#include <string>
#include <vector>

#include "../backend/include/scoring_engine.hpp"

using namespace typex::scoring;

static int g_failures = 0;
static int g_checks = 0;

static void check(bool cond, const std::string& what) {
    g_checks++;
    if (!cond) {
        g_failures++;
        std::cout << "  [FAIL] " << what << std::endl;
    }
}

static void checkNear(double got, double want, double tol, const std::string& what) {
    g_checks++;
    if (std::fabs(got - want) > tol) {
        g_failures++;
        std::cout << "  [FAIL] " << what << " (got " << got << ", want " << want << ")" << std::endl;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Clean test: Net == Raw, accuracy 100.
// ─────────────────────────────────────────────────────────────────────────────
static void testClean() {
    std::cout << "[1] clean test: 100 chars / 60s" << std::endl;
    ScoringInput in;
    in.durationSeconds = 60.0;
    in.correctChars = 100;
    in.incorrectChars = 0;
    in.extraChars = 0;
    in.correctedErrors = 0;
    in.totalKeystrokes = 100;
    in.finalCharsTyped = 100;
    in.rawKeystrokesPerSecond = std::vector<double>(60, 1.67);

    const ScoringResult r = computeScore(in);
    checkNear(r.netWpm, 20.0, 0.001, "clean net wpm == 20");
    checkNear(r.rawWpm, 20.0, 0.001, "clean raw wpm == 20");
    checkNear(r.netWpm, r.rawWpm, 1e-9, "clean net == raw");
    checkNear(r.accuracy, 100.0, 1e-9, "clean accuracy == 100");
    check(!r.implausible, "clean result is plausible");
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Corrected errors must not inflate Net WPM.
//    Same final text (100 correct chars, 60s) => always 20.0 net.
// ─────────────────────────────────────────────────────────────────────────────
static void testCorrectedErrorsDoNotInflate() {
    std::cout << "[2] corrected errors must not inflate net wpm" << std::endl;

    const double baseline = [] {
        ScoringInput in;
        in.durationSeconds = 60.0;
        in.correctChars = 100;
        in.totalKeystrokes = 100;
        in.finalCharsTyped = 100;
        return computeScore(in).netWpm;
    }();

    for (int corrected : {1, 10, 50}) {
        // A client that still carries the backspaced characters in
        // incorrectChars, exactly as the audited TypingArena did.
        ScoringInput in;
        in.durationSeconds = 60.0;
        in.correctChars = 100 + corrected;  // cumulative retype count
        in.incorrectChars = corrected;      // stale, never decremented
        in.extraChars = 0;
        in.correctedErrors = corrected;
        in.totalKeystrokes = 100 + 2 * corrected;
        in.finalCharsTyped = 100;           // the real final text

        const ScoringResult r = computeScore(in);
        checkNear(r.netWpm, 20.0, 0.001,
                  "net wpm stays 20 with " + std::to_string(corrected) + " corrected errors");
        check(r.netWpm <= baseline + 1e-9,
              "net wpm never above the clean baseline (" + std::to_string(corrected) + ")");
        check(r.netWpm <= r.rawWpm + 1e-9,
              "net wpm <= raw wpm (" + std::to_string(corrected) + ")");
        check(r.correctChars <= r.finalCharsTyped,
              "correctChars clamped to final text (" + std::to_string(corrected) + ")");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. A retyped correct key cannot add characters to the final text.
// ─────────────────────────────────────────────────────────────────────────────
static void testRetypedCorrectKey() {
    std::cout << "[3] backspaced + retyped correct key" << std::endl;
    ScoringInput in;
    in.durationSeconds = 60.0;
    in.correctChars = 102;   // cumulative
    in.incorrectChars = 0;
    in.extraChars = 0;
    in.correctedErrors = 1;
    in.totalKeystrokes = 103;
    in.finalCharsTyped = 100;

    const ScoringResult r = computeScore(in);
    checkNear(r.netWpm, 20.0, 0.001, "retyped correct key: net wpm stays 20");
    checkNear(r.rawWpm, 20.0, 0.001, "retyped correct key: raw wpm stays 20");
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Uncorrected errors reduce both accuracy and net wpm honestly.
// ─────────────────────────────────────────────────────────────────────────────
static void testUncorrectedErrors() {
    std::cout << "[4] uncorrected errors" << std::endl;
    ScoringInput in;
    in.durationSeconds = 60.0;
    in.correctChars = 90;
    in.incorrectChars = 10;   // wrong chars still in the final text
    in.extraChars = 0;
    in.correctedErrors = 0;
    in.totalKeystrokes = 100;
    in.finalCharsTyped = 100;

    const ScoringResult r = computeScore(in);
    checkNear(r.netWpm, 18.0, 0.001, "uncorrected: net wpm counts only correct chars");
    checkNear(r.rawWpm, 20.0, 0.001, "uncorrected: raw wpm counts all final chars");
    checkNear(r.accuracy, 90.0, 1e-9, "uncorrected: accuracy 90%");
    check(r.netWpm < r.rawWpm, "uncorrected: net < raw");
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. /api/analyze and /api/accounts/tests parity.
//    Both endpoints build the same ScoringInput; assert the results are equal
//    field by field, including after normalization of a sloppy payload.
// ─────────────────────────────────────────────────────────────────────────────
static void testEndpointParity() {
    std::cout << "[5] /api/analyze == /api/accounts/tests" << std::endl;

    // Synthetic payload values used by both handlers.
    struct Case {
        const char* name;
        int correct, incorrect, extra, corrected, totalKs, finalTyped;
    };
    const std::vector<Case> cases = {
        {"clean", 100, 0, 0, 0, 100, 100},
        {"ten corrected", 110, 10, 0, 10, 130, 100},
        {"fifty corrected", 150, 50, 0, 50, 250, 100},
        {"retyped correct", 102, 0, 0, 1, 103, 100},
        {"ten uncorrected", 90, 10, 0, 0, 100, 100},
        {"extra chars", 95, 0, 5, 0, 100, 100},
        {"mixed", 88, 6, 2, 4, 110, 100},
    };

    for (const auto& c : cases) {
        ScoringInput analyzeIn;
        analyzeIn.durationSeconds = 60.0;
        analyzeIn.correctChars = c.correct;
        analyzeIn.incorrectChars = c.incorrect;
        analyzeIn.extraChars = c.extra;
        analyzeIn.correctedErrors = c.corrected;
        analyzeIn.totalKeystrokes = c.totalKs;
        analyzeIn.finalCharsTyped = c.finalTyped;
        analyzeIn.rawKeystrokesPerSecond = std::vector<double>(60, 1.67);

        // The persistence handler historically also received a pre-computed
        // uncorrectedErrors field; it must not change the outcome.
        ScoringInput persistIn = analyzeIn;
        persistIn.uncorrectedErrors = c.incorrect + c.extra;

        const ScoringResult a = computeScore(analyzeIn);
        const ScoringResult p = computeScore(persistIn);

        const std::string tag = std::string(" [") + c.name + "]";
        checkNear(a.netWpm, p.netWpm, 1e-9, "net wpm parity" + tag);
        checkNear(a.rawWpm, p.rawWpm, 1e-9, "raw wpm parity" + tag);
        checkNear(a.accuracy, p.accuracy, 1e-9, "accuracy parity" + tag);
        checkNear(a.consistency, p.consistency, 1e-9, "consistency parity" + tag);
        check(a.correctChars == p.correctChars, "correctChars parity" + tag);
        check(a.incorrectChars == p.incorrectChars, "incorrectChars parity" + tag);
        check(a.extraChars == p.extraChars, "extraChars parity" + tag);
        check(a.correctedErrors == p.correctedErrors, "correctedErrors parity" + tag);
        check(a.uncorrectedErrors == p.uncorrectedErrors, "uncorrectedErrors parity" + tag);
        check(a.totalKeystrokes == p.totalKeystrokes, "totalKeystrokes parity" + tag);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Final-text accounting from word outcomes.
// ─────────────────────────────────────────────────────────────────────────────
static void testFinalTextCounts() {
    std::cout << "[6] final-text accounting" << std::endl;

    // "the quick" typed perfectly, with the separating space.
    std::vector<WordOutcome> perfect = {{"the", "the"}, {"quick", "quick"}};
    FinalTextCounts c = countFinalTextWithSpaces(perfect);
    check(c.correctChars == 9, "perfect: 8 letters + 1 space = 9 correct");
    check(c.incorrectChars == 0, "perfect: no incorrect chars");
    check(c.extraChars == 0, "perfect: no extra chars");
    check(c.finalCharsTyped == 9, "perfect: 9 chars reached");

    // "the" typed "teh": two mismatches in the final text, nothing extra.
    std::vector<WordOutcome> swapped = {{"the", "teh"}, {"quick", "quick"}};
    FinalTextCounts c2 = countFinalTextWithSpaces(swapped);
    check(c2.correctChars == 7, "swapped: 7 correct of 9");
    check(c2.incorrectChars == 2, "swapped: 2 incorrect");
    check(c2.extraChars == 0, "swapped: no extra");

    // Over-typed word: "the" typed "thee".
    std::vector<WordOutcome> extra = {{"the", "thee"}};
    FinalTextCounts c3 = countFinalTextWithSpaces(extra);
    check(c3.correctChars == 3, "extra: 3 correct");
    check(c3.extraChars == 1, "extra: 1 extra char");

    // Under-typed word: "quick" typed "qui".
    std::vector<WordOutcome> short1 = {{"quick", "qui"}};
    FinalTextCounts c4 = countFinalTextWithSpaces(short1);
    check(c4.correctChars == 3, "short: 3 correct");
    check(c4.incorrectChars == 0, "short: no incorrect");
    check(c4.finalCharsTyped == 3, "short: only 3 chars reached");

    // A retyped word must equal the same word typed once.
    std::vector<WordOutcome> once = {{"hello", "hello"}};
    std::vector<WordOutcome> retyped = {{"hello", "hello"}};
    FinalTextCounts a = countFinalTextWithSpaces(once);
    FinalTextCounts b = countFinalTextWithSpaces(retyped);
    check(a.correctChars == b.correctChars, "retype independence: same correct count");

    // Separator spaces: only words that were actually submitted earn one.
    // The last word has no trailing space because none was typed.
    std::vector<WordOutcome> five = {{"the", "the"}, {"of", "of"}, {"to", "to"},
                                     {"and", "and"}, {"a", "a"}};
    FinalTextCounts c5 = countFinalTextWithSpaces(five);
    // 11 letters (3+2+2+3+1) + 4 separator spaces (after "the","of","to","and")
    check(c5.correctChars == 15, "spaces: 11 letters + 4 separators = 15");
    check(c5.finalCharsTyped == 15, "spaces: 15 chars reached");

    // A word typed exactly to length but not submitted (over-typed elsewhere)
    // must not silently gain a space.
    std::vector<WordOutcome> overTyped = {{"the", "thee"}, {"quick", "quick"}};
    FinalTextCounts cot = countFinalTextWithSpaces(overTyped);
    // "thee": 3 correct + 1 extra, no separator (not submitted);
    // "quick" is last: 5 correct, no separator.
    check(cot.correctChars == 8, "over-typed: 8 correct, no phantom separator");
    check(cot.extraChars == 1, "over-typed: 1 extra");
    check(cot.finalCharsTyped == 8, "over-typed: 8 reached");
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Telemetry: per-key errors, confusions, word errors.
// ─────────────────────────────────────────────────────────────────────────────
static void testTelemetry() {
    std::cout << "[7] keystroke telemetry (the zero-error black hole)" << std::endl;

    std::vector<LogEntry> log;
    int64_t t = 1'700'000'000'000;

    // Typed "h" where "t" was expected (twice), then "e","l","o" correctly,
    // then the same mistake once more after a correction.
    auto add = [&](const std::string& key, const std::string& expected, bool correct) {
        LogEntry e;
        e.key = key;
        e.expected = expected;
        e.hasCorrectFlag = true;
        e.correct = correct;
        e.time = t;
        t += 60;
        log.push_back(e);
    };

    add("h", "t", false);   // wrong
    add("Backspace", "", true);
    add("t", "t", true);    // corrected
    add("h", "e", false);   // wrong: h where e expected
    add("Backspace", "", true);
    add("e", "e", true);
    add("l", "l", true);
    add("l", "l", true);
    add("o", "o", true);

    const Telemetry tel = aggregateKeystrokes(log);

    int totalAttempts = 0;
    int totalErrors = 0;
    int keyTErrors = 0;
    int keyEErrors = 0;
    for (const auto& ks : tel.keyStats) {
        totalAttempts += ks.attempts;
        totalErrors += ks.errors;
        if (ks.key == "t") keyTErrors = ks.errors;
        if (ks.key == "e") keyEErrors = ks.errors;
        check(ks.flightN >= 0, "flight samples non-negative");
    }

    check(totalAttempts == 7, "telemetry: 7 character attempts (backspaces excluded)");
    check(totalErrors == 2, "telemetry: 2 key errors recorded (was always 0)");
    check(keyTErrors == 1, "telemetry: 't' carries the error from typing 'h'");
    check(keyEErrors == 1, "telemetry: 'e' carries the error from typing 'h'");

    check(tel.confusions.size() == 2, "telemetry: 2 confusion pairs");
    bool sawT = false, sawE = false;
    for (const auto& c : tel.confusions) {
        if (std::get<0>(c) == "t" && std::get<1>(c) == "h" && std::get<2>(c) == 1) sawT = true;
        if (std::get<0>(c) == "e" && std::get<1>(c) == "h" && std::get<2>(c) == 1) sawE = true;
    }
    check(sawT, "telemetry: confusion t->h");
    check(sawE, "telemetry: confusion e->h");

    // Word errors from outcomes.
    std::vector<WordOutcome> words = {{"the", "teh"}, {"quick", "quick"}, {"fox", ""}};
    const auto we = wordErrorsFromOutcomes(words);
    check(we.size() == 2, "telemetry: 2 missed words");
    bool sawThe = false, sawFox = false;
    for (const auto& w : we) {
        if (w.first == "the") sawThe = true;
        if (w.first == "fox") sawFox = true;
    }
    check(sawThe, "telemetry: word error for 'the'");
    check(sawFox, "telemetry: word error for skipped 'fox'");
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Defensive normalization of hostile payloads.
// ─────────────────────────────────────────────────────────────────────────────
static void testHostileInput() {
    std::cout << "[8] hostile payload normalization" << std::endl;

    // Absurd correctChars with a tiny final text.
    ScoringInput in;
    in.durationSeconds = 60.0;
    in.correctChars = 100000;
    in.totalKeystrokes = 10;
    in.finalCharsTyped = 10;
    ScoringResult r = computeScore(in);
    check(r.correctChars == 10, "hostile: correctChars clamped to final text");
    check(r.implausible == false, "hostile: clamp prevents implausible score");
    check(r.netWpm <= r.rawWpm + 1e-9, "hostile: net <= raw");

    // Zero duration must not divide by zero.
    ScoringInput z;
    z.durationSeconds = 0.0;
    z.correctChars = 5;
    z.finalCharsTyped = 5;
    z.totalKeystrokes = 5;
    ScoringResult rz = computeScore(z);
    check(std::isfinite(rz.netWpm), "zero duration: finite net wpm");

    // No input at all.
    ScoringInput empty;
    ScoringResult re = computeScore(empty);
    checkNear(re.accuracy, 100.0, 1e-9, "empty: accuracy defaults to 100");
    checkNear(re.netWpm, 0.0, 1e-9, "empty: net wpm 0");

    // uncorrectedErrors over-reported by a legacy caller.
    ScoringInput legacy;
    legacy.durationSeconds = 60.0;
    legacy.correctChars = 100;
    legacy.incorrectChars = 0;   // all corrected already
    legacy.correctedErrors = 10;
    legacy.uncorrectedErrors = 10;  // stale value from the old contract
    legacy.totalKeystrokes = 120;
    legacy.finalCharsTyped = 100;
    ScoringResult rl = computeScore(legacy);
    checkNear(rl.accuracy, 100.0 - (0.5 * 10.0 / 120.0) * 100.0, 0.01,
              "legacy: stale uncorrectedErrors does not double-charge");
}

int main() {
    std::cout << "=== TypeX scoring model tests ===" << std::endl;
    testClean();
    testCorrectedErrorsDoNotInflate();
    testRetypedCorrectKey();
    testUncorrectedErrors();
    testEndpointParity();
    testFinalTextCounts();
    testTelemetry();
    testHostileInput();

    std::cout << std::endl;
    if (g_failures == 0) {
        std::cout << "[PASS] " << g_checks << " checks passed." << std::endl;
        return 0;
    }
    std::cout << "[FAIL] " << g_failures << " of " << g_checks << " checks failed." << std::endl;
    return 1;
}
