#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <cassert>
#include <filesystem>
#include "../backend/include/learning_engine.hpp"

using namespace typex;

int main() {
    std::cout << "=== Running TypeX Learning Engine Test Suite (Keybr V4) ===" << std::endl;

    // Load authentic wordlists
    std::vector<std::string> corpus;
    std::ifstream f10("backend/data/english_10k.txt");
    std::string line;
    while (std::getline(f10, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        if (!line.empty()) corpus.push_back(line);
    }
    std::ifstream f25("backend/data/english_25k.txt");
    while (std::getline(f25, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        if (!line.empty()) corpus.push_back(line);
    }
    std::sort(corpus.begin(), corpus.end());
    corpus.erase(std::unique(corpus.begin(), corpus.end()), corpus.end());

    std::cout << "[INFO] Loaded corpus with " << corpus.size() << " unique words." << std::endl;

    // Use isolated temp test profile
    std::string testProfile = "/tmp/test_typex_mastery_v4.json";
    if (std::filesystem::exists(testProfile)) {
        std::filesystem::remove(testProfile);
    }

    MasteryEngine engine(testProfile);

    // ─────────────────────────────────────────────────────────────────────────
    // Test 1: Generator 100 lessons per key for all 26 keys
    // ─────────────────────────────────────────────────────────────────────────
    std::cout << "\n[TEST 1] Testing Lesson Synthesis (100 lessons x 26 keys)..." << std::endl;
    for (size_t keyIdx = 0; keyIdx < CURRICULUM_KEY_SEQUENCE.size(); ++keyIdx) {
        char targetChar = CURRICULUM_KEY_SEQUENCE[keyIdx];
        std::string targetKey(1, targetChar);

        for (int iter = 0; iter < 100; ++iter) {
            json lesson = engine.synthesizeLesson("phonetic_unlock", 25, targetKey, corpus);
            assert(lesson.contains("words"));
            std::vector<std::string> words = lesson["words"].get<std::vector<std::string>>();

            // Check word count >= 25
            assert(words.size() >= 25);

            int targetCharCount = 0;
            for (const auto& w : words) {
                for (char c : w) {
                    if (c == targetChar) targetCharCount++;
                }
            }

            // Minimum 20 target characters per lesson (keybr target attempts guardrail)
            assert(targetCharCount >= MIN_TARGET_ATTEMPTS);

            // Phase B target drill containment: Phase B words must contain target key
            auto pB = lesson["phaseBreakdown"]["targetDrill"].get<std::vector<size_t>>();
            for (size_t i = pB[0]; i <= pB[1] && i < words.size(); ++i) {
                assert(words[i].find(targetChar) != std::string::npos);
            }
        }
        std::cout << "  ✓ Key '" << targetChar << "' (" << (keyIdx + 1) << "/26): 100 lessons passed all criteria." << std::endl;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: Keybr Target Speed & Gate Logic Unit Tests
    // ─────────────────────────────────────────────────────────────────────────
    std::cout << "\n[TEST 2] Testing Keybr Target Speed Gate Logic (35 WPM / 95% Accuracy)..." << std::endl;

    // Subtest 2A: 20/20 target attempts at 120ms flight (100% accuracy, speed confidence > 1.0) -> PASSES & ADVANCES
    {
        std::string pA = "/tmp/test_gate_pass_v4.json";
        if (std::filesystem::exists(pA)) std::filesystem::remove(pA);
        MasteryEngine eng(pA);

        json keystrokes = json::array();
        for (int i = 0; i < 20; ++i) {
            keystrokes.push_back({
                {"expected", "e"},
                {"actual", "e"},
                {"correct", true},
                {"isFirstAttempt", true},
                {"isDrill", false},
                {"flightMs", 120.0}
            });
        }
        json res = eng.submitTelemetry({
            {"track", "phonetic_unlock"},
            {"activeTarget", "e"},
            {"keystrokes", keystrokes}
        });

        assert(res["passedGate"] == true);
        assert(res["targetAttempts"] == 20);
        assert(res["targetAccuracy"] == 100.0);
        std::cout << "  ✓ 20/20 correct at 120ms: Keybr target speed passed." << std::endl;
    }

    // Subtest 2B: 19/20 target attempts at 120ms (95.0% accuracy) -> PASSES
    {
        std::string pB = "/tmp/test_gate_19_v4.json";
        if (std::filesystem::exists(pB)) std::filesystem::remove(pB);
        MasteryEngine eng(pB);

        json keystrokes = json::array();
        for (int i = 0; i < 19; ++i) {
            keystrokes.push_back({
                {"expected", "e"},
                {"actual", "e"},
                {"correct", true},
                {"isFirstAttempt", true},
                {"isDrill", false},
                {"flightMs", 120.0}
            });
        }
        keystrokes.push_back({
            {"expected", "e"},
            {"actual", "r"},
            {"correct", false},
            {"isFirstAttempt", true},
            {"isDrill", false},
            {"flightMs", 180.0}
        });

        json res = eng.submitTelemetry({
            {"track", "phonetic_unlock"},
            {"activeTarget", "e"},
            {"keystrokes", keystrokes}
        });

        assert(res["passedGate"] == true);
        assert(res["targetAttempts"] == 20);
        assert(res["targetAccuracy"] == 95.0);
        std::cout << "  ✓ 19/20 correct (95.0%): Gate passed at 95% guardrail." << std::endl;
    }

    // Subtest 2C: 18/20 target attempts at 120ms (90.0% accuracy) -> FAILS GATE (< 95%)
    {
        std::string pC = "/tmp/test_gate_18_v4.json";
        if (std::filesystem::exists(pC)) std::filesystem::remove(pC);
        MasteryEngine eng(pC);

        json keystrokes = json::array();
        for (int i = 0; i < 18; ++i) {
            keystrokes.push_back({
                {"expected", "e"},
                {"actual", "e"},
                {"correct", true},
                {"isFirstAttempt", true},
                {"isDrill", false},
                {"flightMs", 120.0}
            });
        }
        for (int i = 0; i < 2; ++i) {
            keystrokes.push_back({
                {"expected", "e"},
                {"actual", "r"},
                {"correct", false},
                {"isFirstAttempt", true},
                {"isDrill", false},
                {"flightMs", 180.0}
            });
        }

        json res = eng.submitTelemetry({
            {"track", "phonetic_unlock"},
            {"activeTarget", "e"},
            {"keystrokes", keystrokes}
        });

        assert(res["passedGate"] == false);
        assert(res["targetAttempts"] == 20);
        assert(res["targetAccuracy"] == 90.0);
        std::cout << "  ✓ 18/20 correct (90.0%): Gate failed due to accuracy guardrail (<95%)." << std::endl;
    }

    // Subtest 2D: 20/20 target attempts but slow flight time (500ms > 342.8ms target) -> FAILS SPEED GATE
    {
        std::string pD = "/tmp/test_gate_slow_v4.json";
        if (std::filesystem::exists(pD)) std::filesystem::remove(pD);
        MasteryEngine eng(pD);

        json keystrokes = json::array();
        for (int i = 0; i < 20; ++i) {
            keystrokes.push_back({
                {"expected", "e"},
                {"actual", "e"},
                {"correct", true},
                {"isFirstAttempt", true},
                {"isDrill", false},
                {"flightMs", 500.0} // Slower than 35 WPM threshold (342.8ms)
            });
        }

        json res = eng.submitTelemetry({
            {"track", "phonetic_unlock"},
            {"activeTarget", "e"},
            {"keystrokes", keystrokes}
        });

        assert(res["passedGate"] == false);
        std::cout << "  ✓ 20/20 correct at 500ms: Gate failed due to speed confidence < 1.0." << std::endl;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: Finger Gym & Drill Tracks
    // ─────────────────────────────────────────────────────────────────────────
    std::cout << "\n[TEST 3] Testing Finger Gym & Drill Tracks..." << std::endl;
    {
        // Test finger gym synthesis for L_PINKY: should never contain "unL_PINKY" or "L_PINKYer"
        json fingerLesson = engine.synthesizeLesson("finger_gym", 25, "L_PINKY", corpus);
        assert(fingerLesson.contains("words"));
        std::vector<std::string> fWords = fingerLesson["words"].get<std::vector<std::string>>();
        assert(fWords.size() == 25);

        for (const auto& w : fWords) {
            assert(w.find("L_PINKY") == std::string::npos);
            assert(w.find("unL_") == std::string::npos);
        }
        std::cout << "  ✓ Finger Gym generates clean authentic words without malformed tokens." << std::endl;

        // Test Trigram, SFB, and C++ symbols synthesis
        json trigramLesson = engine.synthesizeLesson("trigram_chunks", 25, "the", corpus);
        assert(trigramLesson["words"].size() == 25);

        json sfbLesson = engine.synthesizeLesson("sfb_destroyer", 25, "de", corpus);
        assert(sfbLesson["words"].size() == 25);

        json cppLesson = engine.synthesizeLesson("cpp_symbols", 25, ";", corpus);
        assert(cppLesson["words"].size() == 25);

        std::cout << "  ✓ All 5 tracks synthesize valid 25-word lessons." << std::endl;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 4: Schema Version 4 Migration & Mastered Keys Preservation
    // ─────────────────────────────────────────────────────────────────────────
    std::cout << "\n[TEST 4] Testing Schema Version 4 Migration..." << std::endl;
    {
        std::string pMig = "/tmp/test_schema_v3_to_v4_migration.json";
        if (std::filesystem::exists(pMig)) std::filesystem::remove(pMig);

        // Realistic v3 fixture with mastered e,n,i,t,r,l,s and active a
        json v3Fixture = {
            {"version", 3},
            {"keyStats", {
                {"e", {{"confidence", 89.0}, {"attempts", 50}, {"errors", 2}, {"status", "mastered"}}},
                {"n", {{"confidence", 88.0}, {"attempts", 45}, {"errors", 1}, {"status", "mastered"}}},
                {"i", {{"confidence", 87.0}, {"attempts", 40}, {"errors", 2}, {"status", "mastered"}}},
                {"t", {{"confidence", 91.0}, {"attempts", 60}, {"errors", 3}, {"status", "mastered"}}},
                {"r", {{"confidence", 86.5}, {"attempts", 35}, {"errors", 1}, {"status", "mastered"}}},
                {"l", {{"confidence", 86.0}, {"attempts", 30}, {"errors", 2}, {"status", "mastered"}}},
                {"s", {{"confidence", 90.0}, {"attempts", 55}, {"errors", 2}, {"status", "mastered"}}},
                {"a", {{"confidence", 57.0}, {"attempts", 59}, {"errors", 3}, {"firstAttemptAttempts", 50}, {"firstAttemptErrors", 3}, {"status", "active"}}}
            }},
            {"trackActiveTarget", {
                {"phonetic_unlock", "a"}
            }}
        };

        {
            std::ofstream out(pMig);
            out << v3Fixture.dump(2);
        }

        MasteryEngine migEngine(pMig);
        json exported = migEngine.exportToJson();

        assert(exported["version"] == 4);
        assert(exported["targetSpeedWpm"] == 35.0);

        // Verify all 7 previously mastered keys remain mastered and have bestSpeedConfidence >= 1.0
        const std::vector<std::string> expectedMastered = {"e", "n", "i", "t", "r", "l", "s"};
        for (const auto& k : expectedMastered) {
            assert(exported["keyStats"][k]["status"] == "mastered");
            assert(exported["keyStats"][k]["bestSpeedConfidence"] >= 1.0);
        }
        // Key 'a' has 47/50 = 94% accuracy, so it remains active (unmastered under 95% guardrail)
        assert(exported["keyStats"]["a"]["status"] == "active");
        assert(exported["trackActiveTarget"]["phonetic_unlock"] == "a");

        std::cout << "  ✓ Profile successfully migrated to v4; all 7 mastered keys preserved at target speed." << std::endl;
    }

    std::cout << "\n=======================================================" << std::endl;
    std::cout << "🎉 ALL UNIT & INTEGRATION TESTS PASSED VERIFIED!" << std::endl;
    std::cout << "=======================================================" << std::endl;

    return 0;
}
