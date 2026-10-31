#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <cassert>
#include <filesystem>
#include "../backend/include/learning_engine.hpp"

using namespace typex;

int main() {
    std::cout << "=== Running TypeX Learning Engine Test Suite ===" << std::endl;

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
    std::string testProfile = "/tmp/test_typex_mastery.json";
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

        std::vector<char> allowed(CURRICULUM_KEY_SEQUENCE.begin(), CURRICULUM_KEY_SEQUENCE.begin() + keyIdx + 1);
        std::unordered_set<char> allowedSet(allowed.begin(), allowed.end());

        for (int iter = 0; iter < 100; ++iter) {
            json lesson = engine.synthesizeLesson("phonetic_unlock", 25, targetKey, corpus);
            assert(lesson.contains("words"));
            std::vector<std::string> words = lesson["words"].get<std::vector<std::string>>();

            // Check word count >= 25
            assert(words.size() >= 25);

            int targetCharCount = 0;
            // 1. Strict alphabet containment: Every character in every word must be in allowedSet
            for (const auto& w : words) {
                for (char c : w) {
                    assert(allowedSet.count(c) > 0);
                    if (c == targetChar) targetCharCount++;
                }
            }

            // 2. Minimum 50 target characters per lesson
            assert(targetCharCount >= 50);

            // 3. Phase B target containment: Phase B words must contain target key
            auto pB = lesson["phaseBreakdown"]["targetDrill"].get<std::vector<size_t>>();
            for (size_t i = pB[0]; i <= pB[1] && i < words.size(); ++i) {
                assert(words[i].find(targetChar) != std::string::npos);
            }

            // 4. Distinct words check (for keyIdx > 1 where distinct vocabulary is rich)
            if (keyIdx > 1) {
                std::unordered_set<std::string> distinctWords(words.begin(), words.end());
                assert(distinctWords.size() == words.size());
            }
        }
        std::cout << "  ✓ Key '" << targetChar << "' (" << (keyIdx + 1) << "/26): 100 lessons passed all criteria." << std::endl;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: Gate Logic Unit Tests
    // ─────────────────────────────────────────────────────────────────────────
    std::cout << "\n[TEST 2] Testing 98% Unlock Gate Logic..." << std::endl;

    // Subtest 2A: 50/50 target attempts (100% accuracy) -> PASSES & ADVANCES
    {
        std::string pA = "/tmp/test_gate_pass.json";
        if (std::filesystem::exists(pA)) std::filesystem::remove(pA);
        MasteryEngine eng(pA);

        json keystrokes = json::array();
        for (int i = 0; i < 50; ++i) {
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
        assert(res["unlockedNewTarget"] == true);
        assert(res["newActiveTarget"] == "n");
        assert(res["targetAttempts"] == 50);
        assert(res["targetAccuracy"] == 100.0);
        std::cout << "  ✓ 50/50 correct: Gate passed, target advanced to 'n'." << std::endl;
    }

    // Subtest 2B: 49/50 target attempts (98.0% accuracy) -> PASSES & ADVANCES
    {
        std::string pB = "/tmp/test_gate_49.json";
        if (std::filesystem::exists(pB)) std::filesystem::remove(pB);
        MasteryEngine eng(pB);

        json keystrokes = json::array();
        // 49 correct, 1 error
        for (int i = 0; i < 49; ++i) {
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
        assert(res["unlockedNewTarget"] == true);
        assert(res["newActiveTarget"] == "n");
        assert(res["targetAttempts"] == 50);
        assert(res["targetAccuracy"] == 98.0);
        std::cout << "  ✓ 49/50 correct (98.0%): Gate passed, target advanced." << std::endl;
    }

    // Subtest 2C: 48/50 target attempts (96.0% accuracy) -> FAILS GATE
    {
        std::string pC = "/tmp/test_gate_48.json";
        if (std::filesystem::exists(pC)) std::filesystem::remove(pC);
        MasteryEngine eng(pC);

        json keystrokes = json::array();
        // 48 correct, 2 error
        for (int i = 0; i < 48; ++i) {
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
        assert(res["unlockedNewTarget"] == false);
        assert(res["newActiveTarget"] == "e");
        assert(res["targetAttempts"] == 50);
        assert(res["targetAccuracy"] == 96.0);
        std::cout << "  ✓ 48/50 correct (96.0%): Gate failed, target remained 'e'." << std::endl;
    }

    // Subtest 2D: Corrected error counts as error on first attempt
    {
        std::string pD = "/tmp/test_gate_corrected.json";
        if (std::filesystem::exists(pD)) std::filesystem::remove(pD);
        MasteryEngine eng(pD);

        json keystrokes = json::array();
        // 48 clean correct
        for (int i = 0; i < 48; ++i) {
            keystrokes.push_back({
                {"expected", "e"},
                {"actual", "e"},
                {"correct", true},
                {"isFirstAttempt", true},
                {"isDrill", false},
                {"flightMs", 120.0}
            });
        }
        // 49th: first-attempt error, backspace, then retry
        keystrokes.push_back({
            {"expected", "e"},
            {"actual", "i"},
            {"correct", false},
            {"isFirstAttempt", true},
            {"isDrill", false},
            {"flightMs", 210.0}
        });
        keystrokes.push_back({
            {"expected", "e"},
            {"actual", "e"},
            {"correct", true},
            {"isFirstAttempt", false}, // retyped after backspace
            {"isDrill", false},
            {"flightMs", 120.0}
        });
        // 50th: first-attempt error, backspace, retry
        keystrokes.push_back({
            {"expected", "e"},
            {"actual", "t"},
            {"correct", false},
            {"isFirstAttempt", true},
            {"isDrill", false},
            {"flightMs", 190.0}
        });
        keystrokes.push_back({
            {"expected", "e"},
            {"actual", "e"},
            {"correct", true},
            {"isFirstAttempt", false},
            {"isDrill", false},
            {"flightMs", 110.0}
        });

        json res = eng.submitTelemetry({
            {"track", "phonetic_unlock"},
            {"activeTarget", "e"},
            {"keystrokes", keystrokes}
        });

        // Despite fixing the word later, firstAttempt had 2 errors out of 50 -> 48/50 = 96.0% -> FAILS
        assert(res["passedGate"] == false);
        assert(res["targetAttempts"] == 50);
        assert(res["targetAccuracy"] == 96.0);
        std::cout << "  ✓ Corrected mistakes count as first-attempt errors: Gate failed (96.0%)." << std::endl;
    }

    // Subtest 2E: Exclude lock-in drill keystrokes from gate attempts
    {
        std::string pE = "/tmp/test_gate_drill_exclude.json";
        if (std::filesystem::exists(pE)) std::filesystem::remove(pE);
        MasteryEngine eng(pE);

        json keystrokes = json::array();
        // 30 normal keystrokes (all correct)
        for (int i = 0; i < 30; ++i) {
            keystrokes.push_back({
                {"expected", "e"},
                {"actual", "e"},
                {"correct", true},
                {"isFirstAttempt", true},
                {"isDrill", false},
                {"flightMs", 120.0}
            });
        }
        // 30 drill keystrokes (all correct)
        for (int i = 0; i < 30; ++i) {
            keystrokes.push_back({
                {"expected", "e"},
                {"actual", "e"},
                {"correct", true},
                {"isFirstAttempt", true},
                {"isDrill", true},
                {"flightMs", 100.0}
            });
        }

        json res = eng.submitTelemetry({
            {"track", "phonetic_unlock"},
            {"activeTarget", "e"},
            {"keystrokes", keystrokes}
        });

        // Target attempts must ONLY be 30 (drill keystrokes excluded). Since 30 < 50, gate is NOT passed.
        assert(res["targetAttempts"] == 30);
        assert(res["passedGate"] == false);
        assert(res["unlockedNewTarget"] == false);
        std::cout << "  ✓ Drill keystrokes excluded: Only 30/50 strokes counted, gate not prematurely passed." << std::endl;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: Schema Version 3 Migration
    // ─────────────────────────────────────────────────────────────────────────
    std::cout << "\n[TEST 3] Testing Schema Version 3 Migration..." << std::endl;
    {
        std::string pMig = "/tmp/test_schema_v2_migration.json";
        if (std::filesystem::exists(pMig)) std::filesystem::remove(pMig);

        // Create a realistic legacy v2 profile fixture (mastered e, n, i, t, r, l, s; active 'a')
        json v2Fixture = {
            {"version", 2},
            {"keyStats", {
                {"e", {{"confidence", 89.0}, {"attempts", 50}, {"errors", 2}, {"status", "mastered"}}},
                {"n", {{"confidence", 88.0}, {"attempts", 45}, {"errors", 1}, {"status", "mastered"}}},
                {"i", {{"confidence", 87.0}, {"attempts", 40}, {"errors", 2}, {"status", "mastered"}}},
                {"t", {{"confidence", 91.0}, {"attempts", 60}, {"errors", 3}, {"status", "mastered"}}},
                {"r", {{"confidence", 86.5}, {"attempts", 35}, {"errors", 1}, {"status", "mastered"}}},
                {"l", {{"confidence", 86.0}, {"attempts", 30}, {"errors", 2}, {"status", "mastered"}}},
                {"s", {{"confidence", 90.0}, {"attempts", 55}, {"errors", 2}, {"status", "mastered"}}},
                {"a", {{"confidence", 30.0}, {"attempts", 0}, {"errors", 0}, {"status", "active"}}}
            }},
            {"trackActiveTarget", {
                {"phonetic_unlock", "a"}
            }}
        };

        {
            std::ofstream out(pMig);
            out << v2Fixture.dump(2);
        }

        // Load into engine (which triggers migration)
        MasteryEngine migEngine(pMig);
        json exported = migEngine.exportToJson();

        assert(exported["version"] == 3);
        assert(exported["trackActiveTarget"]["phonetic_unlock"] == "a");

        // Verify all 7 previously mastered keys remain mastered
        const std::vector<std::string> expectedMastered = {"e", "n", "i", "t", "r", "l", "s"};
        for (const auto& k : expectedMastered) {
            assert(exported["keyStats"][k]["status"] == "mastered");
        }
        assert(exported["keyStats"]["a"]["status"] == "active");

        std::cout << "  ✓ Legacy v2 profile successfully migrated to v3; all 7 unlocked keys preserved." << std::endl;
    }

    std::cout << "\n=======================================================" << std::endl;
    std::cout << "🎉 ALL UNIT & INTEGRATION TESTS PASSED VERIFIED!" << std::endl;
    std::cout << "=======================================================" << std::endl;

    return 0;
}
