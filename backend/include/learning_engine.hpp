#pragma once

#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <algorithm>
#include <cmath>
#include <chrono>
#include <mutex>
#include <random>
#include <filesystem>
#include <cctype>

#include "json.hpp"

using json = nlohmann::json;

namespace typex {

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

inline std::string handToString(Hand h) {
    switch (h) {
        case Hand::LEFT:  return "LEFT";
        case Hand::RIGHT: return "RIGHT";
        default:          return "NONE";
    }
}

enum class Row {
    NUMBER,
    TOP,
    HOME,
    BOTTOM,
    NONE
};

struct KeyLocation {
    char key;
    Finger finger;
    Hand hand;
    Row row;
    int col; // 0 to 13
};

enum class TransitionType {
    ALTERNATION,
    INWARD_ROLL,
    OUTWARD_ROLL,
    SAME_FINGER_BIGRAM,
    ROW_SCISSOR,
    NORMAL
};

inline std::string transitionToString(TransitionType t) {
    switch (t) {
        case TransitionType::ALTERNATION:        return "ALTERNATION";
        case TransitionType::INWARD_ROLL:        return "INWARD_ROLL";
        case TransitionType::OUTWARD_ROLL:       return "OUTWARD_ROLL";
        case TransitionType::SAME_FINGER_BIGRAM: return "SAME_FINGER_BIGRAM";
        case TransitionType::ROW_SCISSOR:        return "ROW_SCISSOR";
        default:                                 return "NORMAL";
    }
}

class BiomechanicalMap {
public:
    BiomechanicalMap() {
        initMap();
    }

    KeyLocation getKeyInfo(char c) const {
        char lower = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        auto it = map_.find(lower);
        if (it != map_.end()) {
            return it->second;
        }
        // Check for non-alphabet symbol directly
        auto itSym = map_.find(c);
        if (itSym != map_.end()) {
            return itSym->second;
        }
        return {c, Finger::NONE, Hand::NONE, Row::NONE, 0};
    }

    TransitionType classifyTransition(char prev, char curr) const {
        KeyLocation p = getKeyInfo(prev);
        KeyLocation c = getKeyInfo(curr);

        if (p.hand == Hand::NONE || c.hand == Hand::NONE) {
            return TransitionType::NORMAL;
        }

        if (p.hand != c.hand) {
            return TransitionType::ALTERNATION;
        }

        // Same hand
        char pLow = static_cast<char>(std::tolower(static_cast<unsigned char>(prev)));
        char cLow = static_cast<char>(std::tolower(static_cast<unsigned char>(curr)));

        if (p.finger == c.finger && pLow != cLow) {
            return TransitionType::SAME_FINGER_BIGRAM;
        }

        int rowP = static_cast<int>(p.row);
        int rowC = static_cast<int>(c.row);
        if (std::abs(rowP - rowC) >= 2) {
            return TransitionType::ROW_SCISSOR;
        }

        // Roll detection
        if (p.hand == Hand::LEFT) {
            if (p.col < c.col) return TransitionType::INWARD_ROLL;  // e.g. s->d->f
            if (p.col > c.col) return TransitionType::OUTWARD_ROLL; // e.g. f->d->s
        } else if (p.hand == Hand::RIGHT) {
            if (p.col > c.col) return TransitionType::INWARD_ROLL;  // e.g. l->k->j
            if (p.col < c.col) return TransitionType::OUTWARD_ROLL; // e.g. j->k->l
        }

        return TransitionType::NORMAL;
    }

private:
    std::unordered_map<char, KeyLocation> map_;

    void initMap() {
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
        std::lock_guard<std::mutex> lock(mutex_);
        return buildStatusJson();
    }

    json exportToJson() {
        std::lock_guard<std::mutex> lock(mutex_);
        json j;
        j["version"] = 2;

        json keysJson = json::object();
        for (const auto& [k, stat] : keyStats_) {
            keysJson[k] = {
                {"confidence", std::round(stat.confidence * 10.0) / 10.0},
                {"attempts", stat.attempts},
                {"errors", stat.errors},
                {"emaFlightMs", std::round(stat.emaFlightMs * 10.0) / 10.0},
                {"lastPracticedEpoch", stat.lastPracticedEpoch},
                {"status", stat.status}
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

        return j;
    }

    void loadFromJson(const json& j) {
        std::lock_guard<std::mutex> lock(mutex_);
        initDefaultProfile();

        if (j.contains("keyStats") && j["keyStats"].is_object()) {
            for (auto& [k, v] : j["keyStats"].items()) {
                keyStats_[k] = {
                    k,
                    v.value("confidence", 0.0),
                    v.value("attempts", 0),
                    v.value("errors", 0),
                    v.value("emaFlightMs", 220.0),
                    v.value("lastPracticedEpoch", (int64_t)0),
                    v.value("status", "locked")
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
    }

    json synthesizeLesson(const std::string& track, size_t count, const std::string& focusKeyOverride, const std::vector<std::string>& corpus) {
        std::lock_guard<std::mutex> lock(mutex_);

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

        // 3-Phase synthesis
        std::vector<std::string> lessonWords;
        lessonWords.reserve(count);

        if (effectiveTrack == "cpp_symbols") {
            synthesizeCppLesson(lessonWords, count, activeTarget);
        } else {
            synthesizeTextLesson(lessonWords, count, effectiveTrack, activeTarget, unlockedKeys, corpus);
        }

        size_t total = lessonWords.size();
        size_t pAEnd = std::min<size_t>(4, total > 0 ? total - 1 : 0);
        size_t pBEnd = std::min<size_t>(19, total > 0 ? total - 1 : 0);
        size_t pCEnd = total > 0 ? total - 1 : 0;

        json res = {
            {"track", effectiveTrack},
            {"activeTarget", activeTarget},
            {"targetConfidence", std::round(targetConfidence * 10.0) / 10.0},
            {"unlockedKeys", unlockedKeys},
            {"words", lessonWords},
            {"phaseBreakdown", {
                {"warmup", {0, pAEnd}},
                {"targetDrill", {pAEnd + 1, pBEnd}},
                {"cadence", {pBEnd + 1, pCEnd}}
            }}
        };

        return res;
    }

    json submitTelemetry(const json& payload) {
        std::lock_guard<std::mutex> lock(mutex_);

        std::string track = payload.value("track", "phonetic_unlock");
        std::string activeTarget = payload.value("activeTarget", "s");

        double prevConfidence = 0.0;
        if (keyStats_.count(activeTarget)) {
            prevConfidence = keyStats_[activeTarget].confidence;
        }

        if (payload.contains("keystrokes") && payload["keystrokes"].is_array()) {
            char prevChar = '\0';
            for (const auto& item : payload["keystrokes"]) {
                std::string expStr = item.value("expected", "");
                std::string actStr = item.value("actual", "");
                double flightMs = item.value("flightMs", 180.0);
                bool correct = item.value("correct", true);

                if (expStr.empty()) continue;
                char expChar = expStr[0];
                std::string keyKey = expStr;
                std::transform(keyKey.begin(), keyKey.end(), keyKey.begin(), ::tolower);

                // Update KeyStat
                if (!keyStats_.count(keyKey)) {
                    keyStats_[keyKey] = {keyKey, 0.0, 0, 0, 220.0, 0, "locked"};
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

                // Calculate confidence
                double speedScore = std::clamp((240.0 - ks.emaFlightMs) / 1.4, 0.0, 100.0);
                double accRatio = (ks.attempts > 0) ? std::clamp(1.0 - (static_cast<double>(ks.errors) / ks.attempts), 0.0, 1.0) : 1.0;
                double accScore = std::pow(accRatio, 2.5) * 100.0;
                ks.confidence = std::clamp((accScore * 0.65) + (speedScore * 0.35), 0.0, 100.0);
                ks.lastPracticedEpoch = std::chrono::duration_cast<std::chrono::seconds>(
                    std::chrono::system_clock::now().time_since_epoch()).count();

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

        // Check if active target mastered and needs advancing
        double newConfidence = prevConfidence;
        bool unlockedNewTarget = false;
        std::string newActiveTarget = activeTarget;

        if (keyStats_.count(activeTarget)) {
            newConfidence = keyStats_[activeTarget].confidence;
            if (newConfidence >= 85.0) {
                keyStats_[activeTarget].status = "mastered";
                // Unlock next in sequence
                auto nextOpt = advanceTrack(track, activeTarget);
                if (nextOpt.first) {
                    unlockedNewTarget = true;
                    newActiveTarget = nextOpt.second;
                }
            } else if (keyStats_[activeTarget].status == "locked") {
                keyStats_[activeTarget].status = "active";
            }
        }

        saveProfile();

        // Prepare delta report
        json deltaReport = {
            {"previousConfidence", std::round(prevConfidence * 10.0) / 10.0},
            {"newConfidence", std::round(newConfidence * 10.0) / 10.0},
            {"confidenceDelta", std::round((newConfidence - prevConfidence) * 10.0) / 10.0},
            {"unlockedNewTarget", unlockedNewTarget},
            {"newActiveTarget", newActiveTarget},
            {"weakestFinger", getWeakestFingerJson()},
            {"topConfusions", getTopConfusionsJson(3)},
            {"sfbBottlenecks", getSfbBottlenecksJson(3)},
            {"keyStatuses", getKeyStatusesJson()}
        };

        return deltaReport;
    }

private:
    std::string profilePath_;
    std::mutex mutex_;
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

    // Track progression
    const std::vector<char> phoneticSeq_ = {
        'e','n','i','t','r','l','s','a','o','d','y','c','h','g','m','u','p','b','k','v','w','f','z','x','q','j'
    };

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

        // Init 26 letters
        for (char c = 'a'; c <= 'z'; ++c) {
            std::string s(1, c);
            keyStats_[s] = {s, 0.0, 0, 0, 220.0, 0, "locked"};
        }

        // First 6 core letters unlocked at confidence 86.0
        std::vector<char> core = {'e', 'n', 'i', 't', 'r', 'l'};
        for (char c : core) {
            std::string s(1, c);
            keyStats_[s] = {s, 86.0, 25, 1, 115.0, 0, "mastered"};
        }

        // 's' is active target
        keyStats_["s"] = {"s", 40.0, 6, 2, 192.0, 0, "active"};

        trackActiveTarget_["phonetic_unlock"] = "s";
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

            if (j.contains("keyStats") && j["keyStats"].is_object()) {
                for (auto& [k, v] : j["keyStats"].items()) {
                    keyStats_[k] = {
                        k,
                        v.value("confidence", 0.0),
                        v.value("attempts", 0),
                        v.value("errors", 0),
                        v.value("emaFlightMs", 220.0),
                        v.value("lastPracticedEpoch", (int64_t)0),
                        v.value("status", "locked")
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
        } catch (const std::exception& e) {
            std::cerr << "[WARN] Failed to load mastery profile: " << e.what() << ". Using defaults." << std::endl;
        }
    }

    void saveProfile() {
        try {
            // Ensure directory exists
            std::filesystem::path p(profilePath_);
            if (p.has_parent_path()) {
                std::filesystem::create_directories(p.parent_path());
            }

            json j;
            j["version"] = 2;

            json keysJson = json::object();
            for (const auto& [k, stat] : keyStats_) {
                keysJson[k] = {
                    {"confidence", std::round(stat.confidence * 10.0) / 10.0},
                    {"attempts", stat.attempts},
                    {"errors", stat.errors},
                    {"emaFlightMs", std::round(stat.emaFlightMs * 10.0) / 10.0},
                    {"lastPracticedEpoch", stat.lastPracticedEpoch},
                    {"status", stat.status}
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
            char curr = currentTarget.empty() ? 's' : currentTarget[0];
            auto it = std::find(phoneticSeq_.begin(), phoneticSeq_.end(), curr);
            if (it != phoneticSeq_.end() && it + 1 != phoneticSeq_.end()) {
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
        if (track == "phonetic_unlock") return "s";
        if (track == "trigram_chunks") return "the";
        if (track == "sfb_destroyer") return "de";
        if (track == "finger_gym") return "L_PINKY";
        if (track == "cpp_symbols") return ";";
        return "s";
    }

    std::vector<std::string> getUnlockedKeys() const {
        std::vector<std::string> keys;
        for (char c : phoneticSeq_) {
            std::string s(1, c);
            if (keyStats_.count(s)) {
                if (keyStats_.at(s).status == "mastered" || keyStats_.at(s).status == "unlocked" || keyStats_.at(s).status == "active") {
                    keys.push_back(s);
                }
            }
        }
        if (keys.empty()) keys = {"e", "n", "i", "t", "r", "l", "s"};
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
        for (char c : phoneticSeq_) {
            std::string s(1, c);
            if (keyStats_.count(s)) {
                const auto& stat = keyStats_.at(s);
                arr.push_back({
                    {"key", s},
                    {"confidence", std::round(stat.confidence * 10.0) / 10.0},
                    {"emaFlightMs", std::round(stat.emaFlightMs * 10.0) / 10.0},
                    {"attempts", stat.attempts},
                    {"errors", stat.errors},
                    {"status", stat.status}
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

    void synthesizeTextLesson(
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
        if (!target.empty()) {
            unlockedSet.insert(target[0]);
        }

        static thread_local std::mt19937 gen(1337);

        // Find words matching criteria
        std::vector<std::string> warmupCandidates;
        std::vector<std::string> targetCandidates;
        std::vector<std::string> cadenceCandidates;

        for (const auto& word : corpus) {
            if (word.size() < 2 || word.size() > 8) continue;

            bool allUnlocked = true;
            for (char ch : word) {
                if (!unlockedSet.count(ch)) {
                    allUnlocked = false;
                    break;
                }
            }

            bool containsTarget = false;
            if (track == "sfb_destroyer" || track == "trigram_chunks") {
                containsTarget = (word.find(target) != std::string::npos);
            } else if (!target.empty()) {
                containsTarget = (word.find(target[0]) != std::string::npos);
            }

            // High alternation check
            int alternations = 0;
            for (size_t i = 1; i < word.size(); ++i) {
                if (bioMap_.classifyTransition(word[i - 1], word[i]) == TransitionType::ALTERNATION) {
                    alternations++;
                }
            }
            bool isHighAlternation = (word.size() > 2 && alternations >= static_cast<int>(word.size() / 2));

            if (allUnlocked && !containsTarget) {
                warmupCandidates.push_back(word);
            }
            if (containsTarget) {
                targetCandidates.push_back(word);
            }
            if (containsTarget && isHighAlternation) {
                cadenceCandidates.push_back(word);
            }
        }

        // Fallbacks if corpus constraints are too strict
        if (warmupCandidates.empty()) warmupCandidates = {"the", "line", "time", "test", "net", "tree"};
        if (targetCandidates.empty()) {
            if (!target.empty()) {
                targetCandidates = {target + "et", "re" + target, target + "in", "te" + target + "t"};
            } else {
                targetCandidates = {"sister", "listen", "start", "sound", "still"};
            }
        }
        if (cadenceCandidates.empty()) cadenceCandidates = targetCandidates;

        std::shuffle(warmupCandidates.begin(), warmupCandidates.end(), gen);
        std::shuffle(targetCandidates.begin(), targetCandidates.end(), gen);
        std::shuffle(cadenceCandidates.begin(), cadenceCandidates.end(), gen);

        // Phase A: 5 Warmup words
        size_t pACount = std::min<size_t>(5, count / 5);
        for (size_t i = 0; i < pACount && i < warmupCandidates.size(); ++i) {
            out.push_back(warmupCandidates[i]);
        }

        // Phase B: Target drill words (words 6–20 = 15 words)
        size_t pBCount = std::min<size_t>(15, count > pACount ? count - pACount - 5 : 10);
        for (size_t i = 0; i < pBCount; ++i) {
            out.push_back(targetCandidates[i % targetCandidates.size()]);
        }

        // Phase C: Cadence lock words (remaining up to count)
        while (out.size() < count) {
            out.push_back(cadenceCandidates[out.size() % cadenceCandidates.size()]);
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

        // If target symbol specified, prioritize snippets with that symbol
        std::vector<std::string> matching;
        for (const auto& item : pool) {
            if (item.find(target) != std::string::npos) {
                matching.push_back(item);
            }
        }
        if (matching.empty()) matching = pool;

        for (size_t i = 0; i < count; ++i) {
            if (i >= 5 && i < 20 && !matching.empty()) {
                out.push_back(matching[i % matching.size()]);
            } else {
                out.push_back(pool[i % pool.size()]);
            }
        }
    }
};

} // namespace typex
