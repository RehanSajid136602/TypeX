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

// Single source of truth for the 98% accuracy unlock gate
inline constexpr double UNLOCK_ACCURACY = 98.0;
inline constexpr int MIN_TARGET_ATTEMPTS = 50;
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
    double confidence{0.0};
    int attempts{0};
    int errors{0};
    double emaFlightMs{220.0};
    int64_t lastPracticedEpoch{0};
    std::string status{"locked"}; // "mastered", "active", "unlocked", "locked"
    int firstAttemptAttempts{0};
    int firstAttemptErrors{0};
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
        j["version"] = 3;

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
                {"firstAttemptErrors", stat.firstAttemptErrors}
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

                if (loadedVer < 3) {
                    // Migration from v2: preserve mastered keys
                    if (conf >= 85.0) {
                        st = "mastered";
                    }
                }

                keyStats_[k] = {k, conf, att, err, ema, ep, st, fAtt, fErr};
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

        if (j.contains("repairedWordsPool") && j["repairedWordsPool"].is_array()) {
            repairedWordsPool_.clear();
            for (const auto& item : j["repairedWordsPool"]) {
                if (item.is_string()) {
                    repairedWordsPool_.push_back(item.get<std::string>());
                }
            }
        }

        // Ensure activeTarget in phonetic_unlock is properly aligned
        std::string activeT = trackActiveTarget_["phonetic_unlock"];
        if (keyStats_.count(activeT) && keyStats_[activeT].status == "mastered") {
            // Find next unmastered in sequence
            for (char c : CURRICULUM_KEY_SEQUENCE) {
                std::string s(1, c);
                if (!keyStats_.count(s) || keyStats_[s].status != "mastered") {
                    keyStats_[s].status = "active";
                    trackActiveTarget_["phonetic_unlock"] = s;
                    break;
                }
            }
        }
    }

    json synthesizeLesson(const std::string& track, size_t count, const std::string& focusKeyOverride, const std::vector<std::string>& corpus) {
        std::lock_guard<std::recursive_mutex> lock(mutex_);

        ensureBigramTable(corpus);

        std::string effectiveTrack = track.empty() ? "phonetic_unlock" : track;
        std::string activeTarget = getActiveTargetForTrack(effectiveTrack);
        if (!focusKeyOverride.empty()) {
            activeTarget = focusKeyOverride;
        }

        double targetConfidence = 40.0;
        if (keyStats_.count(activeTarget)) {
            targetConfidence = keyStats_[activeTarget].confidence;
        }

        std::vector<std::string> unlockedKeys = getUnlockedKeys();

        std::vector<std::string> lessonWords;
        lessonWords.reserve(count);
        bool isPatternDrill = false;

        if (effectiveTrack == "cpp_symbols") {
            synthesizeCppLesson(lessonWords, count, activeTarget);
        } else if (effectiveTrack == "phonetic_unlock") {
            synthesizeStrictLesson(lessonWords, count, activeTarget, isPatternDrill, corpus);
        } else {
            synthesizeTrackLesson(lessonWords, count, effectiveTrack, activeTarget, unlockedKeys, corpus);
        }

        size_t total = lessonWords.size();
        size_t pAEnd = std::min<size_t>(count / 5 > 0 ? (count / 5) - 1 : 0, total > 0 ? total - 1 : 0);
        size_t pBEnd = std::min<size_t>(pAEnd + (count * 3 / 5), total > 0 ? total - 1 : 0);
        size_t pCEnd = total > 0 ? total - 1 : 0;

        json res = {
            {"track", effectiveTrack},
            {"activeTarget", activeTarget},
            {"targetConfidence", std::round(targetConfidence * 10.0) / 10.0},
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
        std::string activeTarget = payload.value("activeTarget", "s");
        std::transform(activeTarget.begin(), activeTarget.end(), activeTarget.begin(), ::tolower);

        double prevConfidence = 0.0;
        if (keyStats_.count(activeTarget)) {
            prevConfidence = keyStats_[activeTarget].confidence;
        }

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
                    keyStats_[keyKey] = {keyKey, 0.0, 0, 0, 220.0, 0, "locked", 0, 0};
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

                if (flightMs > 10.0 && flightMs < 2000.0) {
                    ks.emaFlightMs = 0.85 * ks.emaFlightMs + 0.15 * flightMs;
                }

                // Confidence
                double speedScore = std::clamp((240.0 - ks.emaFlightMs) / 1.4, 0.0, 100.0);
                double accRatio = (ks.attempts > 0) ? std::clamp(1.0 - (static_cast<double>(ks.errors) / ks.attempts), 0.0, 1.0) : 1.0;
                double accScore = std::pow(accRatio, 2.5) * 100.0;
                ks.confidence = std::clamp((accScore * 0.65) + (speedScore * 0.35), 0.0, 100.0);
                ks.lastPracticedEpoch = std::chrono::duration_cast<std::chrono::seconds>(
                    std::chrono::system_clock::now().time_since_epoch()).count();

                // 98% Unlock Gate tracking: only evaluate non-drill first-attempt keystrokes for active target key
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

        // Record on key stat
        if (keyStats_.count(activeTarget)) {
            keyStats_[activeTarget].firstAttemptAttempts += targetAttempts;
            keyStats_[activeTarget].firstAttemptErrors += targetErrors;
        }

        std::string newActiveTarget = activeTarget;

        if (track == "phonetic_unlock") {
            if (targetAttempts >= MIN_TARGET_ATTEMPTS && targetAccuracy >= UNLOCK_ACCURACY) {
                passedGate = true;
                if (keyStats_.count(activeTarget)) {
                    keyStats_[activeTarget].status = "mastered";
                }
                auto nextOpt = advanceTrack(track, activeTarget);
                if (nextOpt.first) {
                    unlockedNewTarget = true;
                    newActiveTarget = nextOpt.second;
                }
            } else {
                passedGate = false;
                if (keyStats_.count(activeTarget) && keyStats_[activeTarget].status == "locked") {
                    keyStats_[activeTarget].status = "active";
                }
            }
        } else {
            // Other tracks
            double newConf = keyStats_.count(activeTarget) ? keyStats_[activeTarget].confidence : 0.0;
            if (newConf >= 85.0) {
                passedGate = true;
                if (keyStats_.count(activeTarget)) {
                    keyStats_[activeTarget].status = "mastered";
                }
                auto nextOpt = advanceTrack(track, activeTarget);
                if (nextOpt.first) {
                    unlockedNewTarget = true;
                    newActiveTarget = nextOpt.second;
                }
            }
        }

        saveProfile();

        double newConfidence = keyStats_.count(activeTarget) ? keyStats_[activeTarget].confidence : prevConfidence;

        json deltaReport = {
            {"previousConfidence", std::round(prevConfidence * 10.0) / 10.0},
            {"newConfidence", std::round(newConfidence * 10.0) / 10.0},
            {"confidenceDelta", std::round((newConfidence - prevConfidence) * 10.0) / 10.0},
            {"unlockedNewTarget", unlockedNewTarget},
            {"newActiveTarget", newActiveTarget},
            {"passedGate", passedGate},
            {"targetAttempts", targetAttempts},
            {"targetAccuracy", std::round(targetAccuracy * 10.0) / 10.0},
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

    // Bigram transition frequencies from corpus
    std::unordered_map<char, std::unordered_map<char, int>> bigramTable_;
    bool bigramTableBuilt_{false};

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
            keyStats_[s] = {s, 0.0, 0, 0, 220.0, 0, "locked", 0, 0};
        }

        // Strict key-by-key: first key 'e' is active, 0 keys unlocked initially
        keyStats_["e"] = {"e", 40.0, 0, 0, 220.0, 0, "active", 0, 0};

        trackActiveTarget_["phonetic_unlock"] = "e";
        trackActiveTarget_["trigram_chunks"] = "the";
        trackActiveTarget_["sfb_destroyer"] = "de";
        trackActiveTarget_["finger_gym"] = "L_PINKY";
        trackActiveTarget_["cpp_symbols"] = ";";
    }

    void loadProfile() {
        if (!std::filesystem::exists(profilePath_)) {
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
                if (keyStats_[nextStr].confidence == 0.0) {
                    keyStats_[nextStr].confidence = 25.0;
                }
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
        }
        return {false, currentTarget};
    }

    std::string getActiveTargetForTrack(const std::string& track) {
        if (trackActiveTarget_.count(track)) {
            return trackActiveTarget_[track];
        }
        if (track == "phonetic_unlock") return "e";
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
                    {"emaFlightMs", std::round(stat.emaFlightMs * 10.0) / 10.0},
                    {"attempts", stat.attempts},
                    {"errors", stat.errors},
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

    void synthesizeStrictLesson(
        std::vector<std::string>& out,
        size_t count,
        const std::string& targetStr,
        bool& outIsPatternDrill,
        const std::vector<std::string>& corpus
    ) {
        char key = targetStr.empty() ? 'e' : static_cast<char>(std::tolower(static_cast<unsigned char>(targetStr[0])));

        // Find position of key in sequence
        auto it = std::find(CURRICULUM_KEY_SEQUENCE.begin(), CURRICULUM_KEY_SEQUENCE.end(), key);
        size_t keyIdx = (it != CURRICULUM_KEY_SEQUENCE.end()) ? std::distance(CURRICULUM_KEY_SEQUENCE.begin(), it) : 0;

        std::vector<char> unlockedVec(CURRICULUM_KEY_SEQUENCE.begin(), CURRICULUM_KEY_SEQUENCE.begin() + keyIdx);
        std::vector<char> allowedVec(CURRICULUM_KEY_SEQUENCE.begin(), CURRICULUM_KEY_SEQUENCE.begin() + keyIdx + 1);

        std::unordered_set<char> unlockedSet(unlockedVec.begin(), unlockedVec.end());
        std::unordered_set<char> allowedSet(allowedVec.begin(), allowedVec.end());

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

        outIsPatternDrill = (realWords.size() < 40);

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

        // Phase A: Warm-Up (strictly unlocked letters only)
        std::shuffle(warmupReals.begin(), warmupReals.end(), rng);
        for (const auto& w : warmupReals) {
            if (phaseA.size() >= targetWarmupCount) break;
            if (!used.count(w)) {
                phaseA.push_back(w);
                used.insert(w);
            }
        }

        const auto& pAVec = unlockedVec.empty() ? allowedVec : unlockedVec;
        int retries = 0;
        while (phaseA.size() < targetWarmupCount && retries < 150) {
            retries++;
            std::string pw = generatePseudoWord(pAVec, '\0', 3, 5, false, rng);
            if (keyIdx <= 1 || !used.count(pw)) {
                phaseA.push_back(pw);
                used.insert(pw);
            }
        }

        // Phase B: Target Drill (contain target key 1-3 times)
        // Spaced repetition: inject up to 3 eligible repaired words
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
            std::string pw = generatePseudoWord(allowedVec, key, 3, 6, true, rng);
            if (keyIdx <= 1 || !used.count(pw)) {
                phaseB.push_back(pw);
                used.insert(pw);
            }
        }

        // Phase C: Cadence (rhythm & alternation)
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
            std::string pw = generatePseudoWord(allowedVec, key, 3, 5, reqT, rng);
            if (keyIdx <= 1 || !used.count(pw)) {
                phaseC.push_back(pw);
                used.insert(pw);
            }
        }

        // Target volume guarantee: at least 50 target letters across lesson
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
                extra = generatePseudoWord(allowedVec, key, 3, 6, true, rng);
                if (keyIdx > 1 && used.count(extra)) continue;
                used.insert(extra);
            }
            phaseB.push_back(extra);
            for (char c : extra) if (c == key) totalTargetChars++;
        }

        out.clear();
        out.insert(out.end(), phaseA.begin(), phaseA.end());
        out.insert(out.end(), phaseB.begin(), phaseB.end());
        out.insert(out.end(), phaseC.begin(), phaseC.end());
    }

    void synthesizeTrackLesson(
        std::vector<std::string>& out,
        size_t count,
        const std::string& track,
        const std::string& target,
        const std::vector<std::string>& unlockedKeys,
        const std::vector<std::string>& corpus
    ) {
        std::unordered_set<char> unlockedSet;
        for (const auto& k : unlockedKeys) {
            if (!k.empty()) unlockedSet.insert(k[0]);
        }
        for (char c : target) {
            unlockedSet.insert(c);
        }

        static thread_local std::mt19937 gen(std::random_device{}());

        std::vector<std::string> matching;
        for (const auto& word : corpus) {
            if (word.size() < 2 || word.size() > 8) continue;
            bool ok = true;
            for (char ch : word) {
                if (!unlockedSet.count(ch)) { ok = false; break; }
            }
            if (!ok) continue;

            if (word.find(target) != std::string::npos) {
                matching.push_back(word);
            }
        }

        if (matching.empty()) {
            for (const auto& word : corpus) {
                if (word.find(target) != std::string::npos) {
                    matching.push_back(word);
                }
            }
        }

        if (matching.empty()) {
            matching = {target + "ing", target + "er", target + "ed", "un" + target};
        }

        std::shuffle(matching.begin(), matching.end(), gen);
        for (size_t i = 0; i < count; ++i) {
            out.push_back(matching[i % matching.size()]);
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
            "count += 1;"
        };

        std::vector<std::string> matching;
        for (const auto& item : pool) {
            if (item.find(target) != std::string::npos) {
                matching.push_back(item);
            }
        }
        if (matching.empty()) matching = pool;

        for (size_t i = 0; i < count; ++i) {
            out.push_back(matching[i % matching.size()]);
        }
    }
};

} // namespace typex
