#pragma once

#include <string>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <cmath>
#include <chrono>
#include <algorithm>
#include <random>
#include <mutex>
#include <fstream>
#include <iostream>
#include <filesystem>
#include <sstream>
#include <iomanip>
#include "json.hpp"

using json = nlohmann::json;

namespace typex {

// Single source of truth for phonetic unlock curriculum progression
inline constexpr const char* CURRICULUM_KEY_ORDER = "enitrlsady chg mupb kvwf zxqj";
inline constexpr size_t CURRICULUM_KEY_COUNT = 26;

// Keybr-style guided curriculum constants.
// The unlock gate is speed-first (confidence >= 1.0 at the target speed) with
// a small accuracy/sample guardrail so TypeX's free error mode cannot game it.
inline constexpr double TARGET_SPEED_WPM = 35.0;
inline constexpr double UNLOCK_ACCURACY = 95.0;
inline constexpr int MIN_TARGET_ATTEMPTS = 20;
inline constexpr int MIN_ALPHABET_SIZE = 6;
inline constexpr size_t MIN_REAL_WORDS = 15;
inline constexpr int QUAD_ALPHABET = 27;  // 0 = space, 1..26 = a..z
inline const std::vector<char> CURRICULUM_KEY_SEQUENCE = {
    'e','n','i','t','r','l','s','a','o','d','y','c','h','g','m','u','p','b','k','v','w','f','z','x','q','j'
};

enum class Finger {
    L_PINKY,
    L_RING,
    L_MIDDLE,
    L_INDEX,
    R_INDEX,
    R_MIDDLE,
    R_RING,
    R_PINKY,
    NONE
};

inline std::string fingerToString(Finger f) {
    switch (f) {
        case Finger::L_PINKY:  return "L_PINKY";
        case Finger::L_RING:   return "L_RING";
        case Finger::L_MIDDLE: return "L_MIDDLE";
        case Finger::L_INDEX:  return "L_INDEX";
        case Finger::R_INDEX:  return "R_INDEX";
        case Finger::R_MIDDLE: return "R_MIDDLE";
        case Finger::R_RING:   return "R_RING";
        case Finger::R_PINKY:  return "R_PINKY";
        default:               return "NONE";
    }
}

enum class Hand {
    LEFT,
    RIGHT,
    NONE
};

enum class Row {
    NUMBER,
    TOP,
    HOME,
    BOTTOM,
    SPACE
};

enum class TransitionType {
    SAME_FINGER_BIGRAM,
    SAME_HAND_ROLL,
    ALTERNATION,
    LATERAL_STRETCH,
    NONE
};

struct KeyLocation {
    char key{'\0'};
    Finger finger{Finger::NONE};
    Hand hand{Hand::NONE};
    Row row{Row::HOME};
    int column{0};
};

class BiomechanicalMap {
public:
    BiomechanicalMap() {
        initKeyMap();
    }

    KeyLocation getKeyInfo(char c) const {
        char lower = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        auto it = map_.find(lower);
        if (it != map_.end()) {
            return it->second;
        }
        return {c, Finger::NONE, Hand::NONE, Row::HOME, 0};
    }

    TransitionType classifyTransition(char from, char to) const {
        KeyLocation locA = getKeyInfo(from);
        KeyLocation locB = getKeyInfo(to);

        if (locA.finger == Finger::NONE || locB.finger == Finger::NONE) {
            return TransitionType::NONE;
        }

        // Space transitions
        if (from == ' ' || to == ' ') {
            return TransitionType::ALTERNATION;
        }

        // Alternation: opposite hands
        if (locA.hand != locB.hand) {
            return TransitionType::ALTERNATION;
        }

        // Same hand
        if (locA.finger == locB.finger) {
            // Same key repeated
            if (from == to) {
                return TransitionType::NONE;
            }
            return TransitionType::SAME_FINGER_BIGRAM;
        }

        // Lateral stretch on same hand (col delta > 2)
        int colDelta = std::abs(locA.column - locB.column);
        if (colDelta > 2) {
            return TransitionType::LATERAL_STRETCH;
        }

        // Same hand roll
        return TransitionType::SAME_HAND_ROLL;
    }

private:
    std::unordered_map<char, KeyLocation> map_;

    void initKeyMap() {
        // Number row
        map_['`'] = {'`', Finger::L_PINKY, Hand::LEFT, Row::NUMBER, 0};
        map_['~'] = {'~', Finger::L_PINKY, Hand::LEFT, Row::NUMBER, 0};
        map_['1'] = {'1', Finger::L_PINKY, Hand::LEFT, Row::NUMBER, 1};
        map_['!'] = {'!', Finger::L_PINKY, Hand::LEFT, Row::NUMBER, 1};
        map_['2'] = {'2', Finger::L_RING, Hand::LEFT, Row::NUMBER, 2};
        map_['@'] = {'@', Finger::L_RING, Hand::LEFT, Row::NUMBER, 2};
        map_['3'] = {'3', Finger::L_MIDDLE, Hand::LEFT, Row::NUMBER, 3};
        map_['#'] = {'#', Finger::L_MIDDLE, Hand::LEFT, Row::NUMBER, 3};
        map_['4'] = {'4', Finger::L_INDEX, Hand::LEFT, Row::NUMBER, 4};
        map_['$'] = {'$', Finger::L_INDEX, Hand::LEFT, Row::NUMBER, 4};
        map_['5'] = {'5', Finger::L_INDEX, Hand::LEFT, Row::NUMBER, 5};
        map_['%'] = {'%', Finger::L_INDEX, Hand::LEFT, Row::NUMBER, 5};
        map_['6'] = {'6', Finger::R_INDEX, Hand::RIGHT, Row::NUMBER, 6};
        map_['^'] = {'^', Finger::R_INDEX, Hand::RIGHT, Row::NUMBER, 6};
        map_['7'] = {'7', Finger::R_INDEX, Hand::RIGHT, Row::NUMBER, 7};
        map_['&'] = {'&', Finger::R_INDEX, Hand::RIGHT, Row::NUMBER, 7};
        map_['8'] = {'8', Finger::R_MIDDLE, Hand::RIGHT, Row::NUMBER, 8};
        map_['*'] = {'*', Finger::R_MIDDLE, Hand::RIGHT, Row::NUMBER, 8};
        map_['9'] = {'9', Finger::R_RING, Hand::RIGHT, Row::NUMBER, 9};
        map_['('] = {'(', Finger::R_RING, Hand::RIGHT, Row::NUMBER, 9};
        map_['0'] = {'0', Finger::R_PINKY, Hand::RIGHT, Row::NUMBER, 10};
        map_[')'] = {')', Finger::R_PINKY, Hand::RIGHT, Row::NUMBER, 10};
        map_['-'] = {'-', Finger::R_PINKY, Hand::RIGHT, Row::NUMBER, 11};
        map_['_'] = {'_', Finger::R_PINKY, Hand::RIGHT, Row::NUMBER, 11};
        map_['='] = {'=', Finger::R_PINKY, Hand::RIGHT, Row::NUMBER, 12};
        map_['+'] = {'+', Finger::R_PINKY, Hand::RIGHT, Row::NUMBER, 12};

        // Top Row
        map_['q'] = {'q', Finger::L_PINKY, Hand::LEFT, Row::TOP, 1};
        map_['w'] = {'w', Finger::L_RING, Hand::LEFT, Row::TOP, 2};
        map_['e'] = {'e', Finger::L_MIDDLE, Hand::LEFT, Row::TOP, 3};
        map_['r'] = {'r', Finger::L_INDEX, Hand::LEFT, Row::TOP, 4};
        map_['t'] = {'t', Finger::L_INDEX, Hand::LEFT, Row::TOP, 5};
        map_['y'] = {'y', Finger::R_INDEX, Hand::RIGHT, Row::TOP, 6};
        map_['u'] = {'u', Finger::R_INDEX, Hand::RIGHT, Row::TOP, 7};
        map_['i'] = {'i', Finger::R_MIDDLE, Hand::RIGHT, Row::TOP, 8};
        map_['o'] = {'o', Finger::R_RING, Hand::RIGHT, Row::TOP, 9};
        map_['p'] = {'p', Finger::R_PINKY, Hand::RIGHT, Row::TOP, 10};
        map_['['] = {'[', Finger::R_PINKY, Hand::RIGHT, Row::TOP, 11};
        map_['{'] = {'{', Finger::R_PINKY, Hand::RIGHT, Row::TOP, 11};
        map_[']'] = {']', Finger::R_PINKY, Hand::RIGHT, Row::TOP, 12};
        map_['}'] = {'}', Finger::R_PINKY, Hand::RIGHT, Row::TOP, 12};
        map_['\\'] = {'\\', Finger::R_PINKY, Hand::RIGHT, Row::TOP, 13};
        map_['|'] = {'|', Finger::R_PINKY, Hand::RIGHT, Row::TOP, 13};

        // Home Row
        map_['a'] = {'a', Finger::L_PINKY, Hand::LEFT, Row::HOME, 1};
        map_['s'] = {'s', Finger::L_RING, Hand::LEFT, Row::HOME, 2};
        map_['d'] = {'d', Finger::L_MIDDLE, Hand::LEFT, Row::HOME, 3};
        map_['f'] = {'f', Finger::L_INDEX, Hand::LEFT, Row::HOME, 4};
        map_['g'] = {'g', Finger::L_INDEX, Hand::LEFT, Row::HOME, 5};
        map_['h'] = {'h', Finger::R_INDEX, Hand::RIGHT, Row::HOME, 6};
        map_['j'] = {'j', Finger::R_INDEX, Hand::RIGHT, Row::HOME, 7};
        map_['k'] = {'k', Finger::R_MIDDLE, Hand::RIGHT, Row::HOME, 8};
        map_['l'] = {'l', Finger::R_RING, Hand::RIGHT, Row::HOME, 9};
        map_[';'] = {';', Finger::R_PINKY, Hand::RIGHT, Row::HOME, 10};
        map_[':'] = {':', Finger::R_PINKY, Hand::RIGHT, Row::HOME, 10};
        map_['\''] = {'\'', Finger::R_PINKY, Hand::RIGHT, Row::HOME, 11};
        map_['"'] = {'"', Finger::R_PINKY, Hand::RIGHT, Row::HOME, 11};

        // Bottom Row
        map_['z'] = {'z', Finger::L_PINKY, Hand::LEFT, Row::BOTTOM, 1};
        map_['x'] = {'x', Finger::L_RING, Hand::LEFT, Row::BOTTOM, 2};
        map_['c'] = {'c', Finger::L_MIDDLE, Hand::LEFT, Row::BOTTOM, 3};
        map_['v'] = {'v', Finger::L_INDEX, Hand::LEFT, Row::BOTTOM, 4};
        map_['b'] = {'b', Finger::L_INDEX, Hand::LEFT, Row::BOTTOM, 5};
        map_['n'] = {'n', Finger::R_INDEX, Hand::RIGHT, Row::BOTTOM, 6};
        map_['m'] = {'m', Finger::R_INDEX, Hand::RIGHT, Row::BOTTOM, 7};
        map_[','] = {',', Finger::R_MIDDLE, Hand::RIGHT, Row::BOTTOM, 8};
        map_['<'] = {'<', Finger::R_MIDDLE, Hand::RIGHT, Row::BOTTOM, 8};
        map_['.'] = {'.', Finger::R_RING, Hand::RIGHT, Row::BOTTOM, 9};
        map_['>'] = {'>', Finger::R_RING, Hand::RIGHT, Row::BOTTOM, 9};
        map_['/'] = {'/', Finger::R_PINKY, Hand::RIGHT, Row::BOTTOM, 10};
        map_['?'] = {'?', Finger::R_PINKY, Hand::RIGHT, Row::BOTTOM, 10};

        // Space
        map_[' '] = {' ', Finger::NONE, Hand::NONE, Row::BOTTOM, 5};
    }
};

struct KeyStat {
    std::string key;
    double confidence{0.0};          // legacy 0..100 display score
    int attempts{0};
    int errors{0};
    double emaFlightMs{220.0};       // keybr-style smoothed time-to-type (alpha 0.1)
    int64_t lastPracticedEpoch{0};
    std::string status{"locked"};    // "mastered", "active", "unlocked", "locked"
    int firstAttemptAttempts{0};
    int firstAttemptErrors{0};
    int samples{0};                  // valid time-to-type samples
    double bestFlightMs{0.0};        // best-ever smoothed time-to-type
    double speedConfidence{0.0};     // targetTime / emaFlightMs
    double bestSpeedConfidence{0.0}; // targetTime / bestFlightMs
};

struct FingerTelemetry {
    std::string finger;
    double avgMs{210.0};
    double accuracy{95.0};
    int keystrokes{0};
    int errors{0};
};

class MasteryEngine {
public:
    MasteryEngine(const std::string& profilePath)
        : profilePath_(profilePath) {
        initDefaultProfile();
        loadProfile();
    }

    BiomechanicalMap& bioMap() {
        return bioMap_;
    }

    const BiomechanicalMap& bioMap() const {
        return bioMap_;
    }

    json getStatus() {
        std::lock_guard<std::recursive_mutex> lock(mutex_);
        return buildStatusJson();
    }

    json exportToJson() {
        std::lock_guard<std::recursive_mutex> lock(mutex_);
        json j;
        j["version"] = 4;
        j["targetSpeedWpm"] = std::round(targetSpeedWpm_ * 10.0) / 10.0;
        j["recoverKeys"] = recoverKeys_;

        json keysJson = json::object();
        for (const auto& [k, stat] : keyStats_) {
            keysJson[k] = {
                {"confidence", std::round(stat.confidence * 10.0) / 10.0},
                {"attempts", stat.attempts},
                {"errors", stat.errors},
                {"emaFlightMs", std::round(stat.emaFlightMs * 10.0) / 10.0},
                {"lastPracticedEpoch", stat.lastPracticedEpoch},
                {"status", stat.status},
                {"firstAttemptAttempts", stat.firstAttemptAttempts},
                {"firstAttemptErrors", stat.firstAttemptErrors},
                {"samples", stat.samples},
                {"bestFlightMs", std::round(stat.bestFlightMs * 10.0) / 10.0},
                {"speedConfidence", std::round(stat.speedConfidence * 1000.0) / 1000.0},
                {"bestSpeedConfidence", std::round(stat.bestSpeedConfidence * 1000.0) / 1000.0}
            };
        }
        j["keyStats"] = keysJson;

        json fJson = json::object();
        for (const auto& [k, stat] : fingerStats_) {
            fJson[k] = {
                {"avgMs", std::round(stat.avgMs * 10.0) / 10.0},
                {"accuracy", std::round(stat.accuracy * 10.0) / 10.0},
                {"keystrokes", stat.keystrokes},
                {"errors", stat.errors}
            };
        }
        j["fingerStats"] = fJson;

        json confJson = json::object();
        for (const auto& [k, cnt] : confusionCounts_) {
            confJson[k] = cnt;
        }
        j["confusionCounts"] = confJson;

        json sfbJson = json::object();
        for (const auto& [k, item] : sfbStats_) {
            sfbJson[k] = {
                {"avgMs", std::round(item.avgMs * 10.0) / 10.0},
                {"count", item.count}
            };
        }
        j["sfbStats"] = sfbJson;

        json trJson = json::object();
        for (const auto& [k, target] : trackActiveTarget_) {
            trJson[k] = target;
        }
        j["trackActiveTarget"] = trJson;

        json tpJson = json::object();
        for (const auto& [k, idx] : trackProgress_) {
            tpJson[k] = idx;
        }
        j["trackProgress"] = tpJson;

        json repPoolJson = json::array();
        for (const auto& w : repairedWordsPool_) {
            repPoolJson.push_back(w);
        }
        j["repairedWordsPool"] = repPoolJson;

        return j;
    }

    void loadFromJson(const json& j) {
        std::lock_guard<std::recursive_mutex> lock(mutex_);
        initDefaultProfile();

        int loadedVer = j.value("version", 2);
        targetSpeedWpm_ = std::clamp(j.value("targetSpeedWpm", TARGET_SPEED_WPM), 10.0, 200.0);
        recoverKeys_ = j.value("recoverKeys", false);

        if (j.contains("keyStats") && j["keyStats"].is_object()) {
            for (auto& [k, v] : j["keyStats"].items()) {
                std::string st = v.value("status", "locked");
                double conf = v.value("confidence", 0.0);
                int att = v.value("attempts", 0);
                int err = v.value("errors", 0);
                double ema = v.value("emaFlightMs", 220.0);
                int64_t ep = v.value("lastPracticedEpoch", (int64_t)0);
                int fAtt = v.value("firstAttemptAttempts", 0);
                int fErr = v.value("firstAttemptErrors", 0);
                int samples = v.value("samples", att > 0 ? att : 0);
                double bestFlight = v.value("bestFlightMs", 0.0);

                if (loadedVer < 3) {
                    // Migration from v2: preserve mastered keys
                    if (conf >= 85.0) {
                        st = "mastered";
                    }
                }

                if (bestFlight <= 0.0) {
                    if (st == "mastered") {
                        bestFlight = targetTimeMs();
                    } else if (att > 0 && ema > 0.0) {
                        bestFlight = ema;
                    }
                }

                keyStats_[k] = {
                    k, conf, att, err, ema, ep, st, fAtt, fErr,
                    samples, bestFlight,
                    v.value("speedConfidence", 0.0),
                    v.value("bestSpeedConfidence", 0.0)
                };
            }
        }

        if (j.contains("fingerStats") && j["fingerStats"].is_object()) {
            for (auto& [k, v] : j["fingerStats"].items()) {
                fingerStats_[k] = {
                    k,
                    v.value("avgMs", 210.0),
                    v.value("accuracy", 95.0),
                    v.value("keystrokes", 0),
                    v.value("errors", 0)
                };
            }
        }

        if (j.contains("confusionCounts") && j["confusionCounts"].is_object()) {
            for (auto& [k, v] : j["confusionCounts"].items()) {
                confusionCounts_[k] = v.get<int>();
            }
        }

        if (j.contains("sfbStats") && j["sfbStats"].is_object()) {
            for (auto& [k, v] : j["sfbStats"].items()) {
                sfbStats_[k] = {
                    k,
                    v.value("avgMs", 220.0),
                    v.value("count", 0)
                };
            }
        }

        if (j.contains("trackActiveTarget") && j["trackActiveTarget"].is_object()) {
            for (auto& [k, v] : j["trackActiveTarget"].items()) {
                trackActiveTarget_[k] = v.get<std::string>();
            }
        }

        if (j.contains("trackProgress") && j["trackProgress"].is_object()) {
            for (auto& [k, v] : j["trackProgress"].items()) {
                if (v.is_number_integer()) {
                    trackProgress_[k] = v.get<int>();
                }
            }
        }

        if (j.contains("repairedWordsPool") && j["repairedWordsPool"].is_array()) {
            repairedWordsPool_.clear();
            for (const auto& item : j["repairedWordsPool"]) {
                if (item.is_string()) {
                    repairedWordsPool_.push_back(item.get<std::string>());
                }
            }
        }

        // Normalize migration state: keep all previously mastered keys, make
        // sure the minimum alphabet is present, then recompute the weakest-key
        // focus from the loaded statistics.
        normalizeProfile();
        trackActiveTarget_["phonetic_unlock"] = computeFocusKey();
    }

    json synthesizeLesson(const std::string& track, size_t count, const std::string& focusKeyOverride, const std::vector<std::string>& corpus) {
        std::lock_guard<std::recursive_mutex> lock(mutex_);

        ensureQuadModel(corpus);

        std::string effectiveTrack = track.empty() ? "phonetic_unlock" : track;
        if (count == 0) count = 25;
        count = std::min<size_t>(count, 100);

        // The guided curriculum can unlock the next key as soon as every
        // included key is at target speed.
        if (effectiveTrack == "phonetic_unlock") {
            maybeUnlockNextKey();
        }

        std::string activeTarget = getActiveTargetForTrack(effectiveTrack);
        if (!focusKeyOverride.empty()) {
            activeTarget = normalizeTarget(effectiveTrack, focusKeyOverride);
            if (effectiveTrack == "phonetic_unlock") {
                trackActiveTarget_[effectiveTrack] = activeTarget;
            }
        }

        std::vector<std::string> unlockedKeys = getUnlockedKeys();
        std::vector<std::string> lessonWords;
        lessonWords.reserve(count);
        bool isPatternDrill = false;

        if (effectiveTrack == "cpp_symbols") {
            synthesizeCppLesson(lessonWords, count, activeTarget);
        } else if (effectiveTrack == "phonetic_unlock") {
            synthesizeGuidedLesson(lessonWords, count, activeTarget, isPatternDrill, corpus);
        } else if (effectiveTrack == "finger_gym") {
            synthesizeFingerLesson(lessonWords, count, activeTarget, isPatternDrill, corpus);
        } else {
            synthesizeTrackLesson(lessonWords, count, effectiveTrack, activeTarget, isPatternDrill, corpus);
        }

        // Never hand the client an empty lesson.
        if (lessonWords.empty()) {
            std::string fallback = normalizeTarget(effectiveTrack, activeTarget);
            if (fallback.empty()) fallback = "e";
            while (lessonWords.size() < count) lessonWords.push_back(fallback);
        }

        size_t total = lessonWords.size();
        size_t pAEnd = std::min<size_t>(count / 5 > 0 ? (count / 5) - 1 : 0, total > 0 ? total - 1 : 0);
        size_t pBEnd = std::min<size_t>(pAEnd + (count * 3 / 5), total > 0 ? total - 1 : 0);
        size_t pCEnd = total > 0 ? total - 1 : 0;

        double targetConfidence = trackTargetConfidence(effectiveTrack, activeTarget);

        json res = {
            {"track", effectiveTrack},
            {"activeTarget", activeTarget},
            {"focusKey", activeTarget},
            {"targetConfidence", std::round(targetConfidence * 10.0) / 10.0},
            {"targetSpeedWpm", std::round(targetSpeedWpm_ * 10.0) / 10.0},
            {"unlockedKeys", unlockedKeys},
            {"words", lessonWords},
            {"isPatternDrill", isPatternDrill},
            {"phaseBreakdown", {
                {"warmup", {0, pAEnd}},
                {"targetDrill", {pAEnd + 1, pBEnd}},
                {"cadence", {pBEnd + 1, pCEnd}}
            }}
        };

        return res;
    }

    json submitTelemetry(const json& payload) {
        std::lock_guard<std::recursive_mutex> lock(mutex_);

        std::string track = payload.value("track", "phonetic_unlock");
        std::string rawTarget = payload.value("activeTarget", "e");
        std::string activeTarget = normalizeTarget(track, rawTarget);

        double prevConfidence = trackTargetConfidence(track, activeTarget);

        bool isDrill = payload.value("isDrill", false);

        int targetLessonAttempts = 0;
        int targetLessonErrors = 0;
        std::vector<std::string> missedWords;
        std::unordered_set<std::string> missedWordsSet;

        if (payload.contains("missedWords") && payload["missedWords"].is_array()) {
            for (const auto& w : payload["missedWords"]) {
                if (w.is_string()) {
                    std::string wordStr = w.get<std::string>();
                    if (missedWordsSet.insert(wordStr).second) {
                        missedWords.push_back(wordStr);
                        // Add to repaired words pool
                        repairedWordsPool_.push_back(wordStr);
                        if (repairedWordsPool_.size() > 50) {
                            repairedWordsPool_.erase(repairedWordsPool_.begin());
                        }
                    }
                }
            }
        }

        if (payload.contains("repairedWords") && payload["repairedWords"].is_array()) {
            for (const auto& w : payload["repairedWords"]) {
                if (w.is_string()) {
                    repairedWordsPool_.push_back(w.get<std::string>());
                    if (repairedWordsPool_.size() > 50) {
                        repairedWordsPool_.erase(repairedWordsPool_.begin());
                    }
                }
            }
        }

        if (payload.contains("keystrokes") && payload["keystrokes"].is_array()) {
            char prevChar = '\0';
            for (const auto& item : payload["keystrokes"]) {
                std::string expStr = item.value("expected", "");
                std::string actStr = item.value("actual", "");
                double flightMs = item.value("flightMs", 180.0);
                bool correct = item.value("correct", true);
                bool isDrillStroke = item.value("isDrill", isDrill);
                bool isFirstAttempt = item.value("isFirstAttempt", true);

                if (expStr.empty()) continue;
                char expChar = expStr[0];
                std::string keyKey = expStr;
                std::transform(keyKey.begin(), keyKey.end(), keyKey.begin(), ::tolower);

                // Update KeyStat general stats
                if (!keyStats_.count(keyKey)) {
                    keyStats_[keyKey] = {keyKey, 0.0, 0, 0, 220.0, 0, "locked", 0, 0, 0, 0.0, 0.0, 0.0};
                }
                auto& ks = keyStats_[keyKey];
                ks.attempts += 1;
                if (!correct) {
                    ks.errors += 1;
                    if (!actStr.empty() && actStr != expStr) {
                        std::string confKey = expStr + "->" + actStr;
                        confusionCounts_[confKey] += 1;
                    }
                }

                if (isFirstAttempt) {
                    ks.firstAttemptAttempts += 1;
                    if (!correct) ks.firstAttemptErrors += 1;
                }

                if (flightMs > 10.0 && flightMs < 2000.0) {
                    ks.samples += 1;
                    if (ks.emaFlightMs <= 0.0 || ks.samples == 1) {
                        ks.emaFlightMs = flightMs;
                    } else {
                        ks.emaFlightMs = 0.90 * ks.emaFlightMs + 0.10 * flightMs;
                    }
                    if (ks.bestFlightMs <= 0.0 || ks.emaFlightMs < ks.bestFlightMs) {
                        ks.bestFlightMs = ks.emaFlightMs;
                    }
                }

                recomputeConfidences(ks);
                ks.lastPracticedEpoch = std::chrono::duration_cast<std::chrono::seconds>(
                    std::chrono::system_clock::now().time_since_epoch()).count();

                // Target tracking for current active target
                if (!isDrillStroke && keyKey == activeTarget && isFirstAttempt) {
                    targetLessonAttempts += 1;
                    if (!correct) {
                        targetLessonErrors += 1;
                    }
                }

                // Finger Telemetry
                KeyLocation loc = bioMap_.getKeyInfo(expChar);
                if (loc.finger != Finger::NONE) {
                    std::string fName = fingerToString(loc.finger);
                    if (fingerStats_.count(fName)) {
                        auto& ft = fingerStats_[fName];
                        ft.keystrokes += 1;
                        if (!correct) ft.errors += 1;
                        if (flightMs > 10.0 && flightMs < 2000.0) {
                            ft.avgMs = 0.90 * ft.avgMs + 0.10 * flightMs;
                        }
                        ft.accuracy = (ft.keystrokes > 0)
                            ? std::clamp(100.0 * (1.0 - static_cast<double>(ft.errors) / ft.keystrokes), 0.0, 100.0)
                            : 100.0;
                    }
                }

                // Bigram / SFB tracking
                if (prevChar != '\0') {
                    TransitionType trans = bioMap_.classifyTransition(prevChar, expChar);
                    if (trans == TransitionType::SAME_FINGER_BIGRAM) {
                        std::string bg = "";
                        bg += static_cast<char>(std::tolower(static_cast<unsigned char>(prevChar)));
                        bg += static_cast<char>(std::tolower(static_cast<unsigned char>(expChar)));
                        if (sfbStats_.count(bg)) {
                            sfbStats_[bg].avgMs = 0.85 * sfbStats_[bg].avgMs + 0.15 * flightMs;
                            sfbStats_[bg].count += 1;
                        } else {
                            sfbStats_[bg] = {bg, flightMs, 1};
                        }
                    }
                }

                prevChar = expChar;
            }
        }

        // Gate evaluation
        bool unlockedNewTarget = false;
        bool passedGate = false;
        double targetAccuracy = 0.0;
        int targetAttempts = targetLessonAttempts;
        int targetErrors = targetLessonErrors;

        if (targetAttempts > 0) {
            targetAccuracy = (1.0 - static_cast<double>(targetErrors) / targetAttempts) * 100.0;
        }

        std::string newActiveTarget = activeTarget;

        if (track == "phonetic_unlock") {
            auto it = keyStats_.find(activeTarget);
            if (it != keyStats_.end()) {
                auto& ks = it->second;
                if (keyReady(ks)) {
                    passedGate = true;
                    ks.status = "mastered";
                    unlockedNewTarget = maybeUnlockNextKey();
                    newActiveTarget = computeFocusKey();
                    trackActiveTarget_["phonetic_unlock"] = newActiveTarget;
                } else {
                    passedGate = false;
                    unlockedNewTarget = false;
                    if (ks.status == "locked") ks.status = "active";
                    newActiveTarget = computeFocusKey();
                    trackActiveTarget_["phonetic_unlock"] = newActiveTarget;
                }
                targetAccuracy = firstAttemptAccuracy(ks);
                targetAttempts = ks.firstAttemptAttempts;
            }
        } else if (track == "finger_gym") {
            auto it = fingerStats_.find(activeTarget);
            if (it != fingerStats_.end()) {
                const auto& ft = it->second;
                double speedRatio = targetTimeMs() / std::max(1.0, ft.avgMs);
                targetAccuracy = ft.accuracy;
                targetAttempts = ft.keystrokes;
                if (ft.keystrokes >= 20 && ft.accuracy >= 95.0 && speedRatio >= 0.90) {
                    passedGate = true;
                    auto adv = advanceTrack(track, activeTarget);
                    unlockedNewTarget = adv.first;
                    newActiveTarget = adv.second;
                }
            }
        } else if (track == "trigram_chunks" || track == "sfb_destroyer") {
            double conf = trackTargetConfidence(track, activeTarget);
            if (conf >= 85.0 && targetAttempts >= 10) {
                passedGate = true;
                auto adv = advanceTrack(track, activeTarget);
                unlockedNewTarget = adv.first;
                newActiveTarget = adv.second;
            }
        } else if (track == "cpp_symbols") {
            if (targetAttempts >= 5 && targetAccuracy >= 90.0) {
                passedGate = true;
                auto adv = advanceTrack(track, activeTarget);
                unlockedNewTarget = adv.first;
                newActiveTarget = adv.second;
            }
        }

        saveProfile();

        double newConfidence = trackTargetConfidence(track, newActiveTarget);

        json deltaReport = {
            {"previousConfidence", std::round(prevConfidence * 10.0) / 10.0},
            {"newConfidence", std::round(newConfidence * 10.0) / 10.0},
            {"confidenceDelta", std::round((newConfidence - prevConfidence) * 10.0) / 10.0},
            {"unlockedNewTarget", unlockedNewTarget},
            {"newActiveTarget", newActiveTarget},
            {"passedGate", passedGate},
            {"targetAttempts", targetAttempts},
            {"targetAccuracy", std::round(targetAccuracy * 10.0) / 10.0},
            {"targetSpeedWpm", std::round(targetSpeedWpm_ * 10.0) / 10.0},
            {"missedWords", missedWords},
            {"weakestFinger", getWeakestFingerJson()},
            {"topConfusions", getTopConfusionsJson(3)},
            {"sfbBottlenecks", getSfbBottlenecksJson(3)},
            {"keyStatuses", getKeyStatusesJson()}
        };

        return deltaReport;
    }

    std::string generateCoverageReportText(const std::vector<std::string>& corpus) {
        std::lock_guard<std::recursive_mutex> lock(mutex_);
        std::ostringstream ss;
        ss << "Key  | Target | Unlocked Set                   | Real Words | Mode          \n";
        ss << "------------------------------------------------------------------------\n";

        for (size_t i = 0; i < CURRICULUM_KEY_SEQUENCE.size(); ++i) {
            char k = CURRICULUM_KEY_SEQUENCE[i];
            std::unordered_set<char> unlocked(CURRICULUM_KEY_SEQUENCE.begin(), CURRICULUM_KEY_SEQUENCE.begin() + i + 1);
            std::string unlStr(CURRICULUM_KEY_SEQUENCE.begin(), CURRICULUM_KEY_SEQUENCE.begin() + i + 1);

            int realCount = 0;
            for (const auto& w : corpus) {
                if (w.size() < 2 || w.size() > 8) continue;
                bool ok = true;
                for (char c : w) if (!unlocked.count(c)) { ok = false; break; }
                if (!ok) continue;
                if (w.find(k) != std::string::npos) realCount++;
            }

            std::string mode = (realCount >= 40) ? "Real Words" : "Pattern Drill";
            ss << std::left << std::setw(4) << (i + 1) << " | "
               << std::setw(6) << k << " | "
               << std::setw(30) << unlStr << " | "
               << std::setw(10) << realCount << " | "
               << std::setw(14) << mode << "\n";
        }
        return ss.str();
    }

    json generateCoverageReportJson(const std::vector<std::string>& corpus) {
        std::lock_guard<std::recursive_mutex> lock(mutex_);
        json rows = json::array();

        for (size_t i = 0; i < CURRICULUM_KEY_SEQUENCE.size(); ++i) {
            char k = CURRICULUM_KEY_SEQUENCE[i];
            std::unordered_set<char> unlocked(CURRICULUM_KEY_SEQUENCE.begin(), CURRICULUM_KEY_SEQUENCE.begin() + i + 1);
            std::string unlStr(CURRICULUM_KEY_SEQUENCE.begin(), CURRICULUM_KEY_SEQUENCE.begin() + i + 1);

            int realCount = 0;
            for (const auto& w : corpus) {
                if (w.size() < 2 || w.size() > 8) continue;
                bool ok = true;
                for (char c : w) if (!unlocked.count(c)) { ok = false; break; }
                if (!ok) continue;
                if (w.find(k) != std::string::npos) realCount++;
            }

            rows.push_back({
                {"step", i + 1},
                {"target", std::string(1, k)},
                {"unlockedKeys", unlStr},
                {"realWordCount", realCount},
                {"isPatternDrill", realCount < 40}
            });
        }
        return rows;
    }

private:
    std::string profilePath_;
    std::recursive_mutex mutex_;
    BiomechanicalMap bioMap_;

    // In-memory state
    std::unordered_map<std::string, KeyStat> keyStats_;
    std::unordered_map<std::string, FingerTelemetry> fingerStats_;
    std::unordered_map<std::string, int> confusionCounts_;

    struct SfbItem {
        std::string bigram;
        double avgMs;
        int count;
    };
    std::unordered_map<std::string, SfbItem> sfbStats_;

    // Bigram transition frequencies from corpus (legacy fallback only)
    std::unordered_map<char, std::unordered_map<char, int>> bigramTable_;
    bool bigramTableBuilt_{false};

    // Order-4 phonetic model (3-character context), trained from the top 10k
    // frequency-ranked English words. 27 symbols: 0 = space, 1..26 = a..z.
    std::vector<uint32_t> quadCounts_;
    bool quadModelBuilt_{false};

    double targetSpeedWpm_{TARGET_SPEED_WPM};
    bool recoverKeys_{false};

    // Track progression index for drill tracks (cpp snippets etc.)
    std::unordered_map<std::string, int> trackProgress_;

    // Spaced repetition queue for missed words
    std::vector<std::string> repairedWordsPool_;

    // Track progression
    const std::vector<std::string> trigramChunks_ = {
        "the", "ing", "and", "tion", "ent", "for", "ter", "tha", "ere", "ate",
        "ver", "his", "con", "res", "pro", "com", "all", "nce", "men", "ith",
        "ted", "ers", "sti", "out", "ave", "not", "ess", "sta", "ect", "rea"
    };

    const std::vector<std::string> sfbPairs_ = {
        "de", "ed", "ce", "ec", "mu", "um", "un", "nu", "sw", "ws",
        "fr", "rf", "ju", "uj", "ki", "ik", "lo", "ol", "my", "ym"
    };

    std::unordered_map<std::string, std::string> trackActiveTarget_;

    // ── Keybr-style confidence helpers ──────────────────────────────────────

    double targetTimeMs() const {
        // 1 word = 5 characters, so WPM -> characters/minute -> ms/character.
        return 60000.0 / (std::max(10.0, targetSpeedWpm_) * 5.0);
    }

    static int quadSymbol(char c) {
        if (c == ' ') return 0;
        unsigned char u = static_cast<unsigned char>(c);
        if (u >= 'A' && u <= 'Z') u = static_cast<unsigned char>(u - 'A' + 'a');
        if (u >= 'a' && u <= 'z') return static_cast<int>(u - 'a') + 1;
        return -1;
    }

    static char quadChar(int symbol) {
        if (symbol <= 0) return ' ';
        return static_cast<char>('a' + (symbol - 1));
    }

    size_t quadIndex(int a, int b, int c, int next) const {
        return ((static_cast<size_t>(a) * QUAD_ALPHABET + b) * QUAD_ALPHABET + c) * QUAD_ALPHABET + next;
    }

    static double firstAttemptAccuracy(const KeyStat& stat) {
        int attempts = stat.firstAttemptAttempts > 0 ? stat.firstAttemptAttempts : stat.attempts;
        int errors = stat.firstAttemptAttempts > 0 ? stat.firstAttemptErrors : stat.errors;
        if (attempts <= 0) return 0.0;
        return std::clamp(100.0 * (1.0 - static_cast<double>(errors) / attempts), 0.0, 100.0);
    }

    bool keyReady(const KeyStat& stat) const {
        if (stat.status == "mastered") return true;
        if (stat.samples < MIN_TARGET_ATTEMPTS) return false;
        if (stat.bestFlightMs <= 0.0) return false;
        return stat.bestSpeedConfidence >= 1.0 &&
               firstAttemptAccuracy(stat) >= UNLOCK_ACCURACY;
    }

    void recomputeConfidences(KeyStat& stat) const {
        stat.speedConfidence = (stat.samples > 0 && stat.emaFlightMs > 0.0)
            ? targetTimeMs() / stat.emaFlightMs
            : 0.0;
        stat.bestSpeedConfidence = (stat.bestFlightMs > 0.0)
            ? targetTimeMs() / stat.bestFlightMs
            : 0.0;
        stat.confidence = std::clamp(stat.speedConfidence * 100.0, 0.0, 100.0);
    }

    void normalizeProfile() {
        for (char c : CURRICULUM_KEY_SEQUENCE) {
            std::string s(1, c);
            if (!keyStats_.count(s)) {
                keyStats_[s] = {s, 0.0, 0, 0, 220.0, 0, "locked", 0, 0, 0, 0.0, 0.0, 0.0};
            }
        }

        int included = 0;
        for (char c : CURRICULUM_KEY_SEQUENCE) {
            std::string s(1, c);
            const auto& st = keyStats_[s];
            if (st.status == "mastered" || st.status == "active" || st.status == "unlocked") {
                included++;
            }
        }

        // Keybr starts with the six most frequent letters.
        if (included < MIN_ALPHABET_SIZE) {
            for (char c : CURRICULUM_KEY_SEQUENCE) {
                if (included >= MIN_ALPHABET_SIZE) break;
                std::string s(1, c);
                auto& st = keyStats_[s];
                if (st.status == "locked") {
                    st.status = "active";
                    included++;
                }
            }
        }

        for (auto& [k, st] : keyStats_) {
            // A previously mastered key must stay mastered across migrations.
            if (st.status == "mastered" && st.bestFlightMs <= 0.0) {
                st.bestFlightMs = targetTimeMs();
            }
            recomputeConfidences(st);
            if (st.status == "mastered" && st.bestSpeedConfidence < 1.0) {
                st.bestFlightMs = targetTimeMs();
                st.bestSpeedConfidence = 1.0;
            }
        }
    }

    std::string computeFocusKey() const {
        std::vector<std::string> included = getUnlockedKeys();
        if (included.empty()) return "e";

        // Prefer keys that are still being learned. Mastered keys are already
        // at target speed and should not steal focus from an active key.
        std::string weakest;
        double weakestValue = 2.0;
        for (const auto& s : included) {
            auto it = keyStats_.find(s);
            if (it == keyStats_.end()) continue;
            const auto& st = it->second;
            if (st.status == "mastered") continue;
            double value = recoverKeys_ ? st.speedConfidence : st.bestSpeedConfidence;
            if (value < weakestValue) {
                weakestValue = value;
                weakest = s;
            }
        }
        if (!weakest.empty()) return weakest;

        // Everything is mastered: keep the last unlocked key as the focus.
        return included.back();
    }

    bool maybeUnlockNextKey() {
        for (auto& [k, st] : keyStats_) {
            if (st.status == "active" || st.status == "unlocked") {
                if (keyReady(st)) st.status = "mastered";
            }
        }

        std::vector<std::string> included = getUnlockedKeys();
        if (included.size() < MIN_ALPHABET_SIZE) {
            for (char c : CURRICULUM_KEY_SEQUENCE) {
                if (included.size() >= MIN_ALPHABET_SIZE) break;
                std::string s(1, c);
                auto& st = keyStats_[s];
                if (st.status == "locked") {
                    st.status = "active";
                    included.push_back(s);
                }
            }
            return true;
        }

        bool allReady = true;
        for (const auto& s : included) {
            auto it = keyStats_.find(s);
            if (it == keyStats_.end() || !keyReady(it->second)) {
                allReady = false;
                break;
            }
        }
        if (!allReady) return false;

        for (char c : CURRICULUM_KEY_SEQUENCE) {
            std::string s(1, c);
            auto& st = keyStats_[s];
            if (st.status == "locked") {
                st.status = "active";
                recomputeConfidences(st);
                trackActiveTarget_["phonetic_unlock"] = s;
                return true;
            }
        }
        return false;
    }

    std::string normalizeTarget(const std::string& track, const std::string& target) const {
        if (track == "finger_gym") {
            std::string upper = target;
            std::transform(upper.begin(), upper.end(), upper.begin(), ::toupper);
            return upper.empty() ? "L_PINKY" : upper;
        }
        if (track == "cpp_symbols") {
            return target.empty() ? ";" : target;
        }
        std::string lower = target;
        std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);
        return lower;
    }

    double trackTargetConfidence(const std::string& track, const std::string& target) const {
        if (track == "phonetic_unlock") {
            auto it = keyStats_.find(target);
            if (it == keyStats_.end()) return 0.0;
            return std::clamp(it->second.bestSpeedConfidence * 100.0, 0.0, 999.0);
        }
        if (track == "trigram_chunks" || track == "sfb_destroyer") {
            double weakest = 999.0;
            bool any = false;
            for (char c : target) {
                std::string s(1, static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
                auto it = keyStats_.find(s);
                if (it == keyStats_.end()) return 0.0;
                any = true;
                weakest = std::min(weakest, it->second.bestSpeedConfidence);
            }
            return any ? std::clamp(weakest * 100.0, 0.0, 999.0) : 0.0;
        }
        if (track == "finger_gym") {
            auto it = fingerStats_.find(target);
            if (it == fingerStats_.end() || it->second.keystrokes <= 0) return 0.0;
            double conf = targetTimeMs() / std::max(1.0, it->second.avgMs);
            return std::clamp(conf * 100.0, 0.0, 999.0);
        }
        return 0.0;
    }

    std::vector<char> keysForFinger(const std::string& finger) const {
        if (finger == "L_PINKY")  return {'q', 'a', 'z'};
        if (finger == "L_RING")   return {'w', 's', 'x'};
        if (finger == "L_MIDDLE") return {'e', 'd', 'c'};
        if (finger == "L_INDEX")  return {'r', 'f', 'v', 't', 'g', 'b'};
        if (finger == "R_INDEX")  return {'y', 'h', 'n', 'u', 'j', 'm'};
        if (finger == "R_MIDDLE") return {'i', 'k'};
        if (finger == "R_RING")   return {'o', 'l'};
        if (finger == "R_PINKY")  return {'p'};
        return {};
    }

    std::string nextFingerTarget(const std::string& current) const {
        static const std::vector<std::string> order = {
            "L_PINKY", "L_RING", "L_MIDDLE", "L_INDEX",
            "R_INDEX", "R_MIDDLE", "R_RING", "R_PINKY"
        };
        auto it = std::find(order.begin(), order.end(), current);
        if (it == order.end() || it + 1 == order.end()) return order.front();
        return *(it + 1);
    }

    void ensureBigramTable(const std::vector<std::string>& corpus) {
        if (bigramTableBuilt_ && !bigramTable_.empty()) return;
        for (const auto& w : corpus) {
            if (w.size() >= 2) {
                for (size_t i = 0; i < w.size() - 1; ++i) {
                    char a = static_cast<char>(std::tolower(static_cast<unsigned char>(w[i])));
                    char b = static_cast<char>(std::tolower(static_cast<unsigned char>(w[i+1])));
                    if (a >= 'a' && a <= 'z' && b >= 'a' && b <= 'z') {
                        bigramTable_[a][b]++;
                    }
                }
            }
        }
        bigramTableBuilt_ = true;
    }

    std::string generatePseudoWord(
        const std::vector<char>& allowedVec,
        char target,
        size_t minLen,
        size_t maxLen,
        bool requireTarget,
        std::mt19937& rng
    ) {
        if (allowedVec.empty()) return "";
        if (allowedVec.size() == 1) {
            std::uniform_int_distribution<size_t> lenDist(minLen, maxLen);
            return std::string(lenDist(rng), allowedVec[0]);
        }

        std::uniform_int_distribution<size_t> lenDist(minLen, maxLen);
        std::uniform_int_distribution<size_t> charDist(0, allowedVec.size() - 1);

        for (int attempt = 0; attempt < 30; ++attempt) {
            size_t targetLen = lenDist(rng);
            std::string res;
            res.reserve(targetLen);

            char curr = (requireTarget && (rng() % 10 < 4) && target != '\0')
                ? target
                : allowedVec[charDist(rng)];
            res.push_back(curr);

            while (res.size() < targetLen) {
                auto it = bigramTable_.find(curr);
                std::vector<std::pair<char, int>> cands;
                if (it != bigramTable_.end()) {
                    for (char c : allowedVec) {
                        auto it2 = it->second.find(c);
                        if (it2 != it->second.end() && it2->second > 0) {
                            cands.push_back({c, it2->second});
                        }
                    }
                }
                if (!cands.empty()) {
                    int totalW = 0;
                    for (const auto& p : cands) totalW += p.second;
                    std::uniform_int_distribution<int> wDist(1, totalW);
                    int r = wDist(rng);
                    char nextC = cands[0].first;
                    for (const auto& p : cands) {
                        r -= p.second;
                        if (r <= 0) { nextC = p.first; break; }
                    }
                    curr = nextC;
                } else {
                    curr = allowedVec[charDist(rng)];
                }
                res.push_back(curr);
            }

            if (requireTarget && target != '\0') {
                int tc = 0;
                for (char c : res) if (c == target) tc++;
                if (tc >= 1 && tc <= 3) return res;
            } else {
                return res;
            }
        }

        // Fallback
        size_t targetLen = lenDist(rng);
        std::string fallback;
        fallback.reserve(targetLen);
        if (requireTarget && target != '\0') fallback.push_back(target);
        while (fallback.size() < targetLen) fallback.push_back(allowedVec[charDist(rng)]);
        return fallback;
    }

    void initDefaultProfile() {
        // Init finger telemetry
        std::vector<Finger> fingers = {
            Finger::L_PINKY, Finger::L_RING, Finger::L_MIDDLE, Finger::L_INDEX,
            Finger::R_INDEX, Finger::R_MIDDLE, Finger::R_RING, Finger::R_PINKY
        };
        for (auto f : fingers) {
            std::string name = fingerToString(f);
            fingerStats_[name] = {name, 210.0, 95.0, 0, 0};
        }

        // Init 26 letters as locked
        for (char c : CURRICULUM_KEY_SEQUENCE) {
            std::string s(1, c);
            keyStats_[s] = {s, 0.0, 0, 0, 220.0, 0, "locked", 0, 0, 0, 0.0, 0.0, 0.0};
        }

        // Keybr starts with 6 most frequent keys (e, n, i, t, r, l)
        for (int i = 0; i < MIN_ALPHABET_SIZE && i < static_cast<int>(CURRICULUM_KEY_SEQUENCE.size()); ++i) {
            std::string s(1, CURRICULUM_KEY_SEQUENCE[i]);
            keyStats_[s].status = "active";
            keyStats_[s].emaFlightMs = 220.0;
        }

        targetSpeedWpm_ = TARGET_SPEED_WPM;
        recoverKeys_ = false;

        trackActiveTarget_["phonetic_unlock"] = "e";
        trackActiveTarget_["trigram_chunks"] = "the";
        trackActiveTarget_["sfb_destroyer"] = "de";
        trackActiveTarget_["finger_gym"] = "L_PINKY";
        trackActiveTarget_["cpp_symbols"] = ";";
    }

    void loadProfile() {
        if (!std::filesystem::exists(profilePath_)) {
            normalizeProfile();
            trackActiveTarget_["phonetic_unlock"] = computeFocusKey();
            saveProfile();
            return;
        }

        try {
            std::ifstream f(profilePath_);
            if (!f.is_open()) return;
            json j = json::parse(f);
            loadFromJson(j);
        } catch (const std::exception& e) {
            std::cerr << "[WARN] Failed to load mastery profile: " << e.what() << ". Using defaults." << std::endl;
        }
    }

    void saveProfile() {
        try {
            std::filesystem::path p(profilePath_);
            if (p.has_parent_path()) {
                std::filesystem::create_directories(p.parent_path());
            }

            json j = exportToJson();
            std::ofstream out(profilePath_);
            if (out.is_open()) {
                out << j.dump(2);
            }
        } catch (const std::exception& e) {
            std::cerr << "[ERROR] Failed to save mastery profile: " << e.what() << std::endl;
        }
    }

    std::pair<bool, std::string> advanceTrack(const std::string& track, const std::string& currentTarget) {
        if (track == "phonetic_unlock") {
            char curr = currentTarget.empty() ? 'e' : currentTarget[0];
            auto it = std::find(CURRICULUM_KEY_SEQUENCE.begin(), CURRICULUM_KEY_SEQUENCE.end(), curr);
            if (it != CURRICULUM_KEY_SEQUENCE.end() && it + 1 != CURRICULUM_KEY_SEQUENCE.end()) {
                char nextC = *(it + 1);
                std::string nextStr(1, nextC);
                keyStats_[nextStr].status = "active";
                recomputeConfidences(keyStats_[nextStr]);
                trackActiveTarget_["phonetic_unlock"] = nextStr;
                return {true, nextStr};
            }
        } else if (track == "trigram_chunks") {
            auto it = std::find(trigramChunks_.begin(), trigramChunks_.end(), currentTarget);
            if (it != trigramChunks_.end() && it + 1 != trigramChunks_.end()) {
                std::string nextChunk = *(it + 1);
                trackActiveTarget_["trigram_chunks"] = nextChunk;
                return {true, nextChunk};
            }
        } else if (track == "sfb_destroyer") {
            auto it = std::find(sfbPairs_.begin(), sfbPairs_.end(), currentTarget);
            if (it != sfbPairs_.end() && it + 1 != sfbPairs_.end()) {
                std::string nextPair = *(it + 1);
                trackActiveTarget_["sfb_destroyer"] = nextPair;
                return {true, nextPair};
            }
        } else if (track == "finger_gym") {
            std::string nextFinger = nextFingerTarget(currentTarget);
            trackActiveTarget_["finger_gym"] = nextFinger;
            return {true, nextFinger};
        } else if (track == "cpp_symbols") {
            static const std::vector<std::string> cppSymbols = {
                ";", "->", "::", "[]", "{}", "()", "&&", "||", "<<", ">>", "!=", "=="
            };
            auto it = std::find(cppSymbols.begin(), cppSymbols.end(), currentTarget);
            if (it != cppSymbols.end() && it + 1 != cppSymbols.end()) {
                std::string nextSym = *(it + 1);
                trackActiveTarget_["cpp_symbols"] = nextSym;
                return {true, nextSym};
            }
        }
        return {false, currentTarget};
    }

    std::string getActiveTargetForTrack(const std::string& track) {
        if (trackActiveTarget_.count(track) && !trackActiveTarget_[track].empty()) {
            return trackActiveTarget_[track];
        }
        if (track == "phonetic_unlock") return computeFocusKey();
        if (track == "trigram_chunks") return "the";
        if (track == "sfb_destroyer") return "de";
        if (track == "finger_gym") return "L_PINKY";
        if (track == "cpp_symbols") return ";";
        return "e";
    }

    std::vector<std::string> getUnlockedKeys() const {
        std::vector<std::string> keys;
        for (char c : CURRICULUM_KEY_SEQUENCE) {
            std::string s(1, c);
            if (keyStats_.count(s)) {
                if (keyStats_.at(s).status == "mastered" || keyStats_.at(s).status == "unlocked" || keyStats_.at(s).status == "active") {
                    keys.push_back(s);
                }
            }
        }
        if (keys.empty()) keys = {"e"};
        return keys;
    }

    json buildStatusJson() {
        json j;
        j["keyStatuses"] = getKeyStatusesJson();
        j["fingerStats"] = getFingerStatsJson();
        j["topConfusions"] = getTopConfusionsJson(5);
        j["sfbBottlenecks"] = getSfbBottlenecksJson(5);
        j["trackActiveTarget"] = trackActiveTarget_;
        j["weakestFinger"] = getWeakestFingerJson();
        j["targetSpeedWpm"] = std::round(targetSpeedWpm_ * 10.0) / 10.0;
        return j;
    }

    json getKeyStatusesJson() const {
        json arr = json::array();
        for (char c : CURRICULUM_KEY_SEQUENCE) {
            std::string s(1, c);
            if (keyStats_.count(s)) {
                const auto& stat = keyStats_.at(s);
                arr.push_back({
                    {"key", s},
                    {"confidence", std::round(stat.confidence * 10.0) / 10.0},
                    {"speedConfidence", std::round(stat.speedConfidence * 1000.0) / 1000.0},
                    {"bestSpeedConfidence", std::round(stat.bestSpeedConfidence * 1000.0) / 1000.0},
                    {"emaFlightMs", std::round(stat.emaFlightMs * 10.0) / 10.0},
                    {"bestFlightMs", std::round(stat.bestFlightMs * 10.0) / 10.0},
                    {"attempts", stat.attempts},
                    {"errors", stat.errors},
                    {"samples", stat.samples},
                    {"status", stat.status},
                    {"firstAttemptAttempts", stat.firstAttemptAttempts},
                    {"firstAttemptErrors", stat.firstAttemptErrors}
                });
            }
        }
        return arr;
    }

    json getFingerStatsJson() const {
        json obj = json::object();
        for (const auto& [k, v] : fingerStats_) {
            obj[k] = {
                {"finger", k},
                {"avgMs", std::round(v.avgMs * 10.0) / 10.0},
                {"accuracy", std::round(v.accuracy * 10.0) / 10.0},
                {"keystrokes", v.keystrokes},
                {"errors", v.errors}
            };
        }
        return obj;
    }

    json getWeakestFingerJson() const {
        std::string weakest = "L_PINKY";
        double highestPenalty = -1.0;
        double weakestMs = 210.0;
        double weakestAcc = 95.0;

        for (const auto& [name, stat] : fingerStats_) {
            double penalty = (stat.avgMs / 2.0) + ((100.0 - stat.accuracy) * 3.0);
            if (penalty > highestPenalty) {
                highestPenalty = penalty;
                weakest = name;
                weakestMs = stat.avgMs;
                weakestAcc = stat.accuracy;
            }
        }

        return {
            {"finger", weakest},
            {"avgMs", std::round(weakestMs * 10.0) / 10.0},
            {"accuracy", std::round(weakestAcc * 10.0) / 10.0}
        };
    }

    json getTopConfusionsJson(size_t limit) const {
        std::vector<std::pair<std::string, int>> vec(confusionCounts_.begin(), confusionCounts_.end());
        std::sort(vec.begin(), vec.end(), [](const auto& a, const auto& b) {
            return a.second > b.second;
        });

        json arr = json::array();
        for (size_t i = 0; i < limit && i < vec.size(); ++i) {
            std::string pair = vec[i].first;
            size_t arrow = pair.find("->");
            std::string exp = (arrow != std::string::npos) ? pair.substr(0, arrow) : pair;
            std::string act = (arrow != std::string::npos) ? pair.substr(arrow + 2) : "";
            arr.push_back({
                {"expected", exp},
                {"actual", act},
                {"count", vec[i].second}
            });
        }
        return arr;
    }

    json getSfbBottlenecksJson(size_t limit) const {
        std::vector<SfbItem> vec;
        for (const auto& [k, v] : sfbStats_) {
            vec.push_back(v);
        }
        std::sort(vec.begin(), vec.end(), [](const auto& a, const auto& b) {
            return a.avgMs > b.avgMs;
        });

        json arr = json::array();
        for (size_t i = 0; i < limit && i < vec.size(); ++i) {
            arr.push_back({
                {"bigram", vec[i].bigram},
                {"avgMs", std::round(vec[i].avgMs * 10.0) / 10.0},
                {"count", vec[i].count}
            });
        }
        return arr;
    }

    void ensureQuadModel(const std::vector<std::string>& corpus) {
        if (quadModelBuilt_ && !quadCounts_.empty()) return;
        size_t totalEntries = static_cast<size_t>(QUAD_ALPHABET) * QUAD_ALPHABET * QUAD_ALPHABET * QUAD_ALPHABET;
        quadCounts_.assign(totalEntries, 0);

        for (const auto& w : corpus) {
            if (w.empty()) continue;
            int c1 = 0, c2 = 0, c3 = 0;
            for (char ch : w) {
                int sym = quadSymbol(ch);
                if (sym < 1 || sym > 26) continue;
                quadCounts_[quadIndex(c1, c2, c3, sym)]++;
                c1 = c2; c2 = c3; c3 = sym;
            }
            quadCounts_[quadIndex(c1, c2, c3, 0)]++;
        }
        quadModelBuilt_ = true;
    }

    std::string generateQuadWord(
        const std::unordered_set<char>& allowedSet,
        char focusChar,
        size_t minLen,
        size_t maxLen,
        std::mt19937& rng
    ) {
        if (allowedSet.empty()) return "";
        if (!quadModelBuilt_ || quadCounts_.empty()) {
            std::vector<char> v(allowedSet.begin(), allowedSet.end());
            return generatePseudoWord(v, focusChar, minLen, maxLen, focusChar != '\0', rng);
        }

        for (int attempt = 0; attempt < 40; ++attempt) {
            int c1 = 0, c2 = 0, c3 = 0;
            std::string word;
            word.reserve(maxLen);

            while (word.size() < maxLen) {
                std::vector<std::pair<int, uint32_t>> cands;
                uint64_t sumW = 0;

                for (int next = 0; next < QUAD_ALPHABET; ++next) {
                    if (next == 0) {
                        if (word.size() < minLen) continue;
                    } else {
                        char ch = quadChar(next);
                        if (!allowedSet.count(ch)) continue;
                    }

                    uint32_t cnt = quadCounts_[quadIndex(c1, c2, c3, next)];
                    if (cnt > 0) {
                        cands.push_back({next, cnt});
                        sumW += cnt;
                    }
                }

                if (sumW > 0) {
                    std::uniform_int_distribution<uint64_t> dist(1, sumW);
                    uint64_t r = dist(rng);
                    int chosenNext = cands[0].first;
                    for (const auto& p : cands) {
                        if (r <= p.second) {
                            chosenNext = p.first;
                            break;
                        }
                        r -= p.second;
                    }

                    if (chosenNext == 0) {
                        break;
                    } else {
                        char nextCh = quadChar(chosenNext);
                        word.push_back(nextCh);
                        c1 = c2; c2 = c3; c3 = chosenNext;
                    }
                } else {
                    if (word.size() >= minLen && (rng() % 2 == 0)) {
                        break;
                    }
                    char nextCh = '\0';
                    if (focusChar != '\0' && word.find(focusChar) == std::string::npos && (rng() % 3 == 0)) {
                        nextCh = focusChar;
                    } else {
                        std::vector<char> v(allowedSet.begin(), allowedSet.end());
                        nextCh = v[rng() % v.size()];
                    }
                    word.push_back(nextCh);
                    c1 = c2; c2 = c3; c3 = quadSymbol(nextCh);
                }
            }

            if (word.size() >= minLen) {
                if (focusChar == '\0' || word.find(focusChar) != std::string::npos) {
                    return word;
                }
            }
        }

        std::vector<char> v(allowedSet.begin(), allowedSet.end());
        return generatePseudoWord(v, focusChar, minLen, maxLen, focusChar != '\0', rng);
    }

    void synthesizeGuidedLesson(
        std::vector<std::string>& out,
        size_t count,
        const std::string& targetStr,
        bool& outIsPatternDrill,
        const std::vector<std::string>& corpus
    ) {
        char key = targetStr.empty() ? 'e' : static_cast<char>(std::tolower(static_cast<unsigned char>(targetStr[0])));

        std::vector<std::string> unlockedKeys = getUnlockedKeys();
        std::unordered_set<char> allowedSet;
        for (const auto& s : unlockedKeys) {
            if (!s.empty()) allowedSet.insert(s[0]);
        }
        allowedSet.insert(key);

        std::vector<std::string> realWords;
        std::vector<std::string> warmupReals;

        for (const auto& w : corpus) {
            if (w.size() < 2 || w.size() > 8) continue;
            bool ok = true;
            for (char c : w) {
                if (!allowedSet.count(c)) { ok = false; break; }
            }
            if (!ok) continue;

            int tc = 0;
            for (char c : w) if (c == key) tc++;

            if (tc >= 1 && tc <= 3) {
                realWords.push_back(w);
            } else if (tc == 0) {
                warmupReals.push_back(w);
            }
        }

        outIsPatternDrill = (realWords.size() < MIN_REAL_WORDS);

        static thread_local std::mt19937 rng(std::random_device{}());

        size_t targetTotal = std::max<size_t>(count, 25);
        size_t targetWarmupCount = std::max<size_t>(4, targetTotal / 5);
        size_t targetDrillCount = std::max<size_t>(15, (targetTotal * 3) / 5);
        size_t targetCadenceCount = targetTotal > (targetWarmupCount + targetDrillCount)
            ? targetTotal - (targetWarmupCount + targetDrillCount)
            : 5;

        std::vector<std::string> phaseA, phaseB, phaseC;
        std::unordered_set<std::string> used;

        // Spaced repetition injection from repairedWordsPool_
        std::vector<std::string> eligibleRepairs;
        for (const auto& w : repairedWordsPool_) {
            bool ok = true;
            for (char c : w) if (!allowedSet.count(c)) { ok = false; break; }
            if (ok) eligibleRepairs.push_back(w);
        }

        // Phase A: Warm-Up (unlocked letters, prioritize non-focus)
        std::shuffle(warmupReals.begin(), warmupReals.end(), rng);
        for (const auto& w : warmupReals) {
            if (phaseA.size() >= targetWarmupCount) break;
            if (!used.count(w)) {
                phaseA.push_back(w);
                used.insert(w);
            }
        }

        std::unordered_set<char> nonTargetAllowed = allowedSet;
        if (nonTargetAllowed.size() > 1) nonTargetAllowed.erase(key);

        int retries = 0;
        while (phaseA.size() < targetWarmupCount && retries < 150) {
            retries++;
            std::string pw = generateQuadWord(nonTargetAllowed, '\0', 3, 5, rng);
            if (!pw.empty() && (allowedSet.size() <= 2 || !used.count(pw))) {
                phaseA.push_back(pw);
                used.insert(pw);
            }
        }

        // Phase B: Target Drill (contain focus key 1-3 times)
        for (const auto& w : eligibleRepairs) {
            if (phaseB.size() >= 3) break;
            if (w.find(key) != std::string::npos && !used.count(w)) {
                phaseB.push_back(w);
                used.insert(w);
            }
        }

        std::shuffle(realWords.begin(), realWords.end(), rng);
        for (const auto& w : realWords) {
            if (phaseB.size() >= targetDrillCount) break;
            if (!used.count(w)) {
                phaseB.push_back(w);
                used.insert(w);
            }
        }

        retries = 0;
        while (phaseB.size() < targetDrillCount && retries < 300) {
            retries++;
            std::string pw = generateQuadWord(allowedSet, key, 3, 6, rng);
            if (!pw.empty() && (allowedSet.size() <= 2 || !used.count(pw))) {
                phaseB.push_back(pw);
                used.insert(pw);
            }
        }

        // Phase C: Cadence (flow, combination of unlocked keys)
        std::vector<std::string> cadencePool;
        for (const auto& w : realWords) if (!used.count(w)) cadencePool.push_back(w);
        for (const auto& w : warmupReals) if (!used.count(w)) cadencePool.push_back(w);
        std::shuffle(cadencePool.begin(), cadencePool.end(), rng);

        for (const auto& w : cadencePool) {
            if (phaseC.size() >= targetCadenceCount) break;
            phaseC.push_back(w);
            used.insert(w);
        }

        retries = 0;
        while (phaseC.size() < targetCadenceCount && retries < 150) {
            retries++;
            bool reqT = (rng() % 2 == 0);
            std::string pw = generateQuadWord(allowedSet, reqT ? key : '\0', 3, 5, rng);
            if (!pw.empty() && (allowedSet.size() <= 2 || !used.count(pw))) {
                phaseC.push_back(pw);
                used.insert(pw);
            }
        }

        // Target volume: ensure at least MIN_TARGET_ATTEMPTS (20) target letters across lesson
        int totalTargetChars = 0;
        for (const auto& w : phaseB) for (char c : w) if (c == key) totalTargetChars++;
        for (const auto& w : phaseC) for (char c : w) if (c == key) totalTargetChars++;

        retries = 0;
        while (totalTargetChars < MIN_TARGET_ATTEMPTS && retries < 300) {
            retries++;
            std::string extra = "";
            for (const auto& w : realWords) {
                if (!used.count(w)) {
                    extra = w;
                    used.insert(w);
                    break;
                }
            }
            if (extra.empty()) {
                extra = generateQuadWord(allowedSet, key, 3, 6, rng);
                if (allowedSet.size() > 2 && used.count(extra)) continue;
                if (!extra.empty()) used.insert(extra);
            }
            if (!extra.empty()) {
                phaseB.push_back(extra);
                for (char c : extra) if (c == key) totalTargetChars++;
            }
        }

        out.clear();
        out.insert(out.end(), phaseA.begin(), phaseA.end());
        out.insert(out.end(), phaseB.begin(), phaseB.end());
        out.insert(out.end(), phaseC.begin(), phaseC.end());
    }

    void synthesizeFingerLesson(
        std::vector<std::string>& out,
        size_t count,
        const std::string& targetFinger,
        bool& outIsPatternDrill,
        const std::vector<std::string>& corpus
    ) {
        std::vector<char> fKeys = keysForFinger(targetFinger);
        if (fKeys.empty()) {
            fKeys = {'q', 'a', 'z'};
        }
        std::unordered_set<char> fKeySet(fKeys.begin(), fKeys.end());

        static thread_local std::mt19937 rng(std::random_device{}());

        // Find words from corpus that contain finger keys
        std::vector<std::pair<std::string, int>> rankedWords;
        for (const auto& w : corpus) {
            if (w.size() < 2 || w.size() > 9) continue;
            int density = 0;
            for (char c : w) {
                if (fKeySet.count(static_cast<char>(std::tolower(static_cast<unsigned char>(c))))) {
                    density++;
                }
            }
            if (density > 0) {
                rankedWords.push_back({w, density});
            }
        }

        std::sort(rankedWords.begin(), rankedWords.end(), [](const auto& a, const auto& b) {
            return a.second > b.second;
        });

        outIsPatternDrill = (rankedWords.size() < 10);

        out.clear();
        std::unordered_set<std::string> used;

        size_t takeTop = std::min<size_t>(rankedWords.size(), 200);
        std::vector<std::string> topPool;
        for (size_t i = 0; i < takeTop; ++i) {
            topPool.push_back(rankedWords[i].first);
        }
        std::shuffle(topPool.begin(), topPool.end(), rng);

        for (const auto& w : topPool) {
            if (out.size() >= count) break;
            if (!used.count(w)) {
                out.push_back(w);
                used.insert(w);
            }
        }

        // Fill remaining with finger key pattern drills (no malformed tokens!)
        while (out.size() < count) {
            std::string pat;
            size_t patLen = 3 + (rng() % 3);
            for (size_t i = 0; i < patLen; ++i) {
                pat.push_back(fKeys[rng() % fKeys.size()]);
            }
            out.push_back(pat);
        }
    }

    void synthesizeTrackLesson(
        std::vector<std::string>& out,
        size_t count,
        const std::string& track,
        const std::string& target,
        bool& outIsPatternDrill,
        const std::vector<std::string>& corpus
    ) {
        static thread_local std::mt19937 gen(std::random_device{}());

        std::string lowerTarget = target;
        std::transform(lowerTarget.begin(), lowerTarget.end(), lowerTarget.begin(), ::tolower);

        std::vector<std::string> matching;
        for (const auto& word : corpus) {
            if (word.size() < 2 || word.size() > 10) continue;
            if (word.find(lowerTarget) != std::string::npos) {
                matching.push_back(word);
            }
        }

        outIsPatternDrill = (matching.size() < 10);

        out.clear();
        std::unordered_set<std::string> used;

        if (!matching.empty()) {
            std::shuffle(matching.begin(), matching.end(), gen);
            for (const auto& w : matching) {
                if (out.size() >= count) break;
                if (!used.count(w)) {
                    out.push_back(w);
                    used.insert(w);
                }
            }
        }

        while (out.size() < count) {
            if (!matching.empty()) {
                out.push_back(matching[gen() % matching.size()]);
            } else {
                std::string fallback = lowerTarget;
                if (track == "trigram_chunks") {
                    fallback = "the" + lowerTarget;
                }
                out.push_back(fallback);
            }
        }
    }

    void synthesizeCppLesson(std::vector<std::string>& out, size_t count, const std::string& target) {
        std::vector<std::string> pool = {
            "vec[i]++;",
            "ptr->val;",
            "std::move(x);",
            "if (a && b)",
            "std::cout << x;",
            "res.status = 200;",
            "for (int i = 0; i < n; ++i)",
            "auto it = map.find(k);",
            "if (ptr != nullptr)",
            "vec.push_back(val);",
            "std::string s = \"\";",
            "while (x <= max_val)",
            "data[idx] = val;",
            "return res.dump();",
            "std::vector<int> v;",
            "int sum = 0;",
            "std::clamp(x, 0, 100);",
            "if (x >= 0 && y >= 0)",
            "std::cin >> input;",
            "count += 1;",
            "int* p = nullptr;",
            "bool ok = (x != y);",
            "val = (a || b);",
            "std::unique_ptr<Node> root;",
            "void update(int val) {",
            "for (auto& item : list) {"
        };

        std::vector<std::string> matching;
        for (const auto& item : pool) {
            if (item.find(target) != std::string::npos) {
                matching.push_back(item);
            }
        }
        if (matching.empty()) matching = pool;

        out.clear();
        for (size_t i = 0; i < count; ++i) {
            out.push_back(matching[i % matching.size()]);
        }
    }
};

} // namespace typex
