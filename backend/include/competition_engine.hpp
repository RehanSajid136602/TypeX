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
#include <sstream>
#include <iomanip>
#include <deque>
#include <optional>

#include "json.hpp"
#include "admin_pin_manager.hpp"

using json = nlohmann::json;

namespace typex {

struct ContestantResult {
    double netWpm{0.0};
    double rawWpm{0.0};
    double accuracy{100.0};
    int errors{0};
    int correctedErrors{0};
    int totalKeystrokes{0};
    double consistency{100.0};
    double durationSeconds{0.0};
    int correctChars{0};
    int incorrectChars{0};
    int extraChars{0};
    int missedChars{0};
    int64_t completedAtEpochMs{0};
    std::vector<double> perSecondWpm;
};

struct ResultRecord {
    std::string id;
    std::string contestantId;
    std::string name;
    std::string regId;
    std::string department;
    int batchIndex{0};
    double netWpm{0.0};
    double rawWpm{0.0};
    double accuracy{100.0};
    int errors{0};
    int correctedErrors{0};
    int totalKeystrokes{0};
    double consistency{100.0};
    double durationSeconds{0.0};
    int correctChars{0};
    int incorrectChars{0};
    int extraChars{0};
    int missedChars{0};
    int64_t completedAtEpochMs{0};
    std::vector<double> perSecondWpm;
};

struct RevealState {
    std::string id;
    std::string kind{"synced-batch"};
    std::vector<std::string> contestantIds;
    int64_t startedAtEpochMs{0};
    int64_t endsAtEpochMs{0};
};

struct Contestant {
    std::string id;
    std::string name;
    std::string regId;
    std::string department;
    bool redoAllowed{false};
    int batchIndex{0}; // 0-indexed
    std::string status{"pending"}; // "pending", "typing", "completed", "absent", "disqualified"
    std::string assignedParagraphId;
    std::string assignedParagraphText;
    bool hasResult{false};
    int64_t firstKeystrokeEpochMs{0};
    bool inSyncedCohort{false};
    int cohortId{0};
    ContestantResult result;
};

struct Paragraph {
    std::string id;
    std::string text;
    int wordCount{0};
    double avgWordLength{0.0};
    std::string tier{"english_1k"};
};

struct LiveTypingStream {
    std::string contestantId;
    double currentWpm{0.0};
    double currentAccuracy{100.0};
    int cursorPosition{0};
    int totalChars{0};
    int errorCount{0};
    int elapsedSeconds{0};
    int64_t lastHeartbeatEpochMs{0};
};

struct CompetitionConfig {
    std::string eventName{"TypeX Stage Championship"};
    int timeLimitSeconds{60};
    int paragraphWordCount{40};
    std::string tier{"english_1k"};
    int batchSize{3};
    std::string paragraphRule{"same_for_batch"}; // "same_for_batch" or "random_per_contestant"
    bool batchRevealsEnabled{true}; // Master toggle: Batch reveals ON / OFF (default ON)
    int syncWindowSeconds{10}; // 5-15s, default 10s
    int revealHoldSeconds{15}; // 10-20s, default 15s
    std::string revealMode{"instant"}; // Kept for backwards compatibility
};

class CompetitionEngine {
public:
    CompetitionEngine(std::string stateFilePath, AdminPinManager* pinManager = nullptr)
        : stateFilePath_(std::move(stateFilePath)), pinManager_(pinManager) {
        loadState();
    }

    void setPinManager(AdminPinManager* pinManager) {
        pinManager_ = pinManager;
    }

    bool verifyPin(const std::string& pin) const {
        if (pinManager_) {
            return pinManager_->verifyPin(pin);
        }
        const char* envPin = std::getenv("TYPEX_ADMIN_PIN");
        if (!envPin || std::string(envPin).empty() || pin.empty()) {
            return false;
        }
        return pin == std::string(envPin);
    }

    bool isAdminPinConfigured() const {
        if (pinManager_) {
            return pinManager_->isConfigured();
        }
        const char* envPin = std::getenv("TYPEX_ADMIN_PIN");
        return envPin && !std::string(envPin).empty();
    }

    json getStateJson() const {
        std::lock_guard<std::mutex> lock(mutex_);
        const_cast<CompetitionEngine*>(this)->updateRevealsInternal();
        return serializeStateInternal();
    }

    // Config updates
    json updateConfig(const json& newConfig) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (newConfig.contains("eventName") && newConfig["eventName"].is_string()) {
            config_.eventName = newConfig["eventName"].get<std::string>();
        }
        if (newConfig.contains("timeLimitSeconds") && newConfig["timeLimitSeconds"].is_number()) {
            config_.timeLimitSeconds = std::clamp(newConfig["timeLimitSeconds"].get<int>(), 10, 300);
        }
        if (newConfig.contains("paragraphWordCount") && newConfig["paragraphWordCount"].is_number()) {
            config_.paragraphWordCount = std::clamp(newConfig["paragraphWordCount"].get<int>(), 15, 120);
        }
        if (newConfig.contains("tier") && newConfig["tier"].is_string()) {
            config_.tier = newConfig["tier"].get<std::string>();
        }
        if (newConfig.contains("batchSize") && newConfig["batchSize"].is_number()) {
            int newBatchSize = std::clamp(newConfig["batchSize"].get<int>(), 1, 10);
            if (newBatchSize != config_.batchSize) {
                config_.batchSize = newBatchSize;
                recomputeBatchesInternal();
            }
        }
        if (newConfig.contains("paragraphRule") && newConfig["paragraphRule"].is_string()) {
            config_.paragraphRule = newConfig["paragraphRule"].get<std::string>();
        }
        if (newConfig.contains("batchRevealsEnabled") && newConfig["batchRevealsEnabled"].is_boolean()) {
            config_.batchRevealsEnabled = newConfig["batchRevealsEnabled"].get<bool>();
        }
        if (newConfig.contains("syncWindowSeconds") && newConfig["syncWindowSeconds"].is_number()) {
            config_.syncWindowSeconds = std::clamp(newConfig["syncWindowSeconds"].get<int>(), 5, 15);
        }
        if (newConfig.contains("revealHoldSeconds") && newConfig["revealHoldSeconds"].is_number()) {
            config_.revealHoldSeconds = std::clamp(newConfig["revealHoldSeconds"].get<int>(), 10, 20);
        }
        if (newConfig.contains("revealMode") && newConfig["revealMode"].is_string()) {
            config_.revealMode = newConfig["revealMode"].get<std::string>();
        }

        saveStateInternal();
        return serializeStateInternal();
    }

    void recomputeBatchesInternal() {
        for (size_t i = 0; i < contestants_.size(); ++i) {
            contestants_[i].batchIndex = static_cast<int>(i / config_.batchSize);
        }
    }

    // Paragraph pool generation
    // Generates 5 paragraphs with:
    // 1) Same word count
    // 2) Average word length within ±5% across all 5
    // 3) ~5% capitalized words (natural sentence starts)
    // 4) ~5% punctuation tokens (, . ; ? !) placed naturally
    // 5) Pure alphabetic base from corpus
    bool generateParagraphPool(const std::vector<std::string>& corpusWords,
                               const std::string& tier,
                               int wordCount = 40) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (corpusWords.size() < 50 || wordCount < 10) return false;

        static thread_local std::mt19937 gen{std::random_device{}()};
        config_.paragraphWordCount = wordCount;
        config_.tier = tier;

        std::vector<Paragraph> candidates;
        int maxAttempts = 1000;
        double targetAvgLen = 0.0;

        // Try to generate 5 paragraphs that satisfy ±5% average length constraint
        for (int attempt = 0; attempt < maxAttempts && candidates.size() < 5; ++attempt) {
            std::vector<std::string> words;
            words.reserve(wordCount);
            double totalLen = 0;

            std::uniform_int_distribution<size_t> dist(0, corpusWords.size() - 1);
            std::unordered_set<std::string> chosenInParagraph;

            for (int w = 0; w < wordCount; ++w) {
                std::string rawWord = corpusWords[dist(gen)];
                // Minimal repetition avoidance
                if (chosenInParagraph.count(rawWord) > 0 && corpusWords.size() > static_cast<size_t>(wordCount * 2)) {
                    rawWord = corpusWords[dist(gen)];
                }
                chosenInParagraph.insert(rawWord);
                words.push_back(rawWord);
                totalLen += rawWord.size();
            }

            double avgLen = totalLen / static_cast<double>(wordCount);

            if (candidates.empty()) {
                targetAvgLen = avgLen;
                candidates.push_back(constructPunctuationParagraph(words, tier, wordCount, avgLen, static_cast<int>(candidates.size() + 1)));
            } else {
                // Check if within ±5% of targetAvgLen
                double diffPercent = std::abs(avgLen - targetAvgLen) / targetAvgLen;
                if (diffPercent <= 0.05) {
                    candidates.push_back(constructPunctuationParagraph(words, tier, wordCount, avgLen, static_cast<int>(candidates.size() + 1)));
                }
            }
        }

        if (candidates.size() < 5) {
            // If strict tolerance didn't hit in maxAttempts, relax slightly or regenerate with closest
            return false;
        }

        paragraphs_ = candidates;
        saveStateInternal();
        return true;
    }

    Paragraph constructPunctuationParagraph(const std::vector<std::string>& baseWords,
                                            const std::string& tier,
                                            int wordCount,
                                            double avgLen,
                                            int idIndex) {
        static thread_local std::mt19937 gen{std::random_device{}()};
        std::vector<std::string> transformed = baseWords;

        // Target ~5% capitalized words and ~5% punctuation tokens (, . ; ? !)
        // In 40 words, 5% is ~2 punctuation tokens and ~2 sentence starts.
        // Sentences should be natural: 10-18 words per sentence.
        // First word of entire paragraph is always capitalized.
        if (!transformed.empty()) {
            transformed[0][0] = static_cast<char>(std::toupper(static_cast<unsigned char>(transformed[0][0])));
        }

        int punctTarget = std::max(2, static_cast<int>(std::round(wordCount * 0.05)));
        // Determine sentence break points
        std::vector<int> sentenceBreaks;
        int step = wordCount / (punctTarget + 1);
        for (int p = 1; p <= punctTarget; ++p) {
            int pos = p * step;
            if (pos >= wordCount - 1) pos = wordCount - 1;
            sentenceBreaks.push_back(pos);
        }
        if (sentenceBreaks.empty() || sentenceBreaks.back() != wordCount - 1) {
            sentenceBreaks.push_back(wordCount - 1);
        }

        const char terminalPunct[] = {'.', '.', '!', '?'};
        const char clausePunct[] = {',', ';', ','};

        for (size_t i = 0; i < sentenceBreaks.size(); ++i) {
            int pos = sentenceBreaks[i];
            if (pos < 0 || pos >= wordCount) continue;

            if (pos == wordCount - 1) {
                // Final word gets terminal punctuation
                char p = terminalPunct[gen() % 4];
                transformed[pos] += p;
            } else {
                bool isSentenceEnd = (i % 2 == 1);
                if (isSentenceEnd) {
                    char p = terminalPunct[gen() % 4];
                    transformed[pos] += p;
                    // Capitalize the next word
                    if (pos + 1 < wordCount) {
                        transformed[pos + 1][0] = static_cast<char>(std::toupper(static_cast<unsigned char>(transformed[pos + 1][0])));
                    }
                } else {
                    char p = clausePunct[gen() % 3];
                    transformed[pos] += p;
                }
            }
        }

        // Reassemble text
        std::string fullText;
        for (size_t i = 0; i < transformed.size(); ++i) {
            if (i > 0) fullText += " ";
            fullText += transformed[i];
        }

        std::stringstream ss;
        ss << "p_" << idIndex;

        return Paragraph{ss.str(), fullText, wordCount, avgLen, tier};
    }

    // Contestant CRUD & Ordering
    json addContestants(const std::vector<std::string>& rawNames) {
        std::lock_guard<std::mutex> lock(mutex_);
        static thread_local std::mt19937 gen{std::random_device{}()};

        for (const auto& raw : rawNames) {
            std::string name = trim(raw);
            if (name.empty()) continue;

            std::stringstream ss;
            ss << "c_" << std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::system_clock::now().time_since_epoch()).count()
               << "_" << (gen() % 10000);

            Contestant c;
            c.id = ss.str();
            c.name = name;
            c.status = "pending";
            c.batchIndex = static_cast<int>(contestants_.size() / config_.batchSize);
            c.hasResult = false;
            contestants_.push_back(c);
        }

        saveStateInternal();
        return serializeStateInternal();
    }

    bool removeContestant(const std::string& id) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = std::remove_if(contestants_.begin(), contestants_.end(),
                                 [&id](const Contestant& c) { return c.id == id; });
        if (it != contestants_.end()) {
            contestants_.erase(it, contestants_.end());
            recomputeBatchesInternal();
            if (activeContestantId_ == id) {
                activeContestantId_ = "";
                roundState_ = "idle";
            }
            saveStateInternal();
            return true;
        }
        return false;
    }

    bool reorderContestants(const std::vector<std::string>& orderedIds) {
        std::lock_guard<std::mutex> lock(mutex_);
        std::unordered_map<std::string, Contestant> map;
        for (const auto& c : contestants_) {
            map[c.id] = c;
        }

        std::vector<Contestant> reordered;
        reordered.reserve(orderedIds.size());
        for (const auto& id : orderedIds) {
            if (map.count(id)) {
                reordered.push_back(map[id]);
                map.erase(id);
            }
        }
        // Append any missed
        for (auto& pair : map) {
            reordered.push_back(pair.second);
        }

        contestants_ = std::move(reordered);
        recomputeBatchesInternal();
        saveStateInternal();
        return true;
    }

    bool markContestantStatus(const std::string& id, const std::string& status) {
        std::lock_guard<std::mutex> lock(mutex_);
        for (auto& c : contestants_) {
            if (c.id == id) {
                c.status = status;
                if (status == "disqualified" || status == "absent") {
                    if (activeContestantId_ == id) {
                        roundState_ = "idle";
                        activeContestantId_ = "";
                    }
                }
                saveStateInternal();
                return true;
            }
        }
        return false;
    }

    // Self-registration for contestant check-in flow
    // Returns { "ok": true, "contestant": {...} } or { "error": "...", "code": "..." }
    json registerContestant(const std::string& rawName, const std::string& rawRegId, const std::string& rawDept) {
        std::lock_guard<std::mutex> lock(mutex_);
        static thread_local std::mt19937 gen{std::random_device{}()};

        std::string name = trim(rawName);
        std::string regId = trim(rawRegId);
        std::string dept = trim(rawDept);

        if (name.empty()) {
            return {{"error", "Name cannot be empty"}, {"code", "INVALID_NAME"}};
        }
        if (regId.empty()) {
            return {{"error", "Registration ID cannot be empty"}, {"code", "INVALID_REG_ID"}};
        }

        // Check for existing contestant with same regId
        for (auto& c : contestants_) {
            if (c.regId == regId) {
                // If attempt already completed and redo not allowed
                if (c.hasResult && !c.redoAllowed) {
                    return {
                        {"error", "Registration ID '" + regId + "' has already completed an attempt. Contact the stage admin if a redo is needed."},
                        {"code", "DUPLICATE_REG_ID"}
                    };
                }

                // If redo was granted by admin, reactivate this contestant
                if (c.redoAllowed) {
                    c.name = name;
                    if (!dept.empty()) c.department = dept;
                    c.redoAllowed = false;
                    c.hasResult = false;
                    c.status = "pending";
                    c.result = ContestantResult{};
                    c.assignedParagraphId = "";
                    c.assignedParagraphText = "";
                    assignParagraphForContestantInternal(c);
                    saveStateInternal();

                    return {
                        {"ok", true},
                        {"contestant", {
                            {"id", c.id},
                            {"name", c.name},
                            {"regId", c.regId},
                            {"department", c.department},
                            {"batchIndex", c.batchIndex},
                            {"assignedParagraphId", c.assignedParagraphId},
                            {"assignedParagraphText", c.assignedParagraphText}
                        }}
                    };
                }

                // If still pending or typing (e.g. restoring session or re-submitting before result)
                c.name = name;
                if (!dept.empty()) c.department = dept;
                if (c.assignedParagraphText.empty()) {
                    assignParagraphForContestantInternal(c);
                }
                saveStateInternal();

                return {
                    {"ok", true},
                    {"contestant", {
                        {"id", c.id},
                        {"name", c.name},
                        {"regId", c.regId},
                        {"department", c.department},
                        {"batchIndex", c.batchIndex},
                        {"assignedParagraphId", c.assignedParagraphId},
                        {"assignedParagraphText", c.assignedParagraphText}
                    }}
                };
            }
        }

        // Create new contestant
        std::stringstream ss;
        ss << "c_" << std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count()
           << "_" << (gen() % 10000);

        Contestant c;
        c.id = ss.str();
        c.name = name;
        c.regId = regId;
        c.department = dept.empty() ? "General" : dept;
        c.status = "pending";
        c.batchIndex = static_cast<int>(contestants_.size() / config_.batchSize);
        c.hasResult = false;
        c.redoAllowed = false;

        assignParagraphForContestantInternal(c);
        contestants_.push_back(c);

        saveStateInternal();

        return {
            {"ok", true},
            {"contestant", {
                {"id", c.id},
                {"name", c.name},
                {"regId", c.regId},
                {"department", c.department},
                {"batchIndex", c.batchIndex},
                {"assignedParagraphId", c.assignedParagraphId},
                {"assignedParagraphText", c.assignedParagraphText}
            }}
        };
    }

    bool grantRedo(const std::string& id) {
        std::lock_guard<std::mutex> lock(mutex_);
        for (auto& c : contestants_) {
            if (c.id == id) {
                c.redoAllowed = true;
                c.hasResult = false;
                c.result = ContestantResult{};
                c.status = "pending";
                c.assignedParagraphId = "";
                c.assignedParagraphText = "";
                saveStateInternal();
                return true;
            }
        }
        return false;
    }

    bool editContestant(const std::string& id, const std::string& name, const std::string& regId, const std::string& dept) {
        std::lock_guard<std::mutex> lock(mutex_);
        std::string trimmedName = trim(name);
        std::string trimmedReg = trim(regId);
        std::string trimmedDept = trim(dept);
        bool found = false;

        for (auto& c : contestants_) {
            if (c.id == id) {
                c.name = trimmedName;
                if (!trimmedReg.empty()) c.regId = trimmedReg;
                if (!trimmedDept.empty()) c.department = trimmedDept;
                found = true;
                break;
            }
        }
        for (auto& r : results_) {
            if (r.contestantId == id || r.id == id) {
                r.name = trimmedName;
                if (!trimmedReg.empty()) r.regId = trimmedReg;
                if (!trimmedDept.empty()) r.department = trimmedDept;
                found = true;
            }
        }
        if (found) {
            saveStateInternal();
            return true;
        }
        return false;
    }

    bool editResult(const std::string& resultOrContestantId, const std::string& name, const std::string& regId, const std::string& dept) {
        return editContestant(resultOrContestantId, name, regId, dept);
    }

    bool deleteResult(const std::string& id) {
        std::lock_guard<std::mutex> lock(mutex_);
        for (auto& c : contestants_) {
            if (c.id == id) {
                c.hasResult = false;
                c.result = ContestantResult{};
                c.status = "pending";
                c.assignedParagraphId = "";
                c.assignedParagraphText = "";
                break;
            }
        }
        auto it = std::remove_if(results_.begin(), results_.end(),
                                 [&id](const ResultRecord& r) {
                                     return r.id == id || r.contestantId == id;
                                 });
        if (it != results_.end()) {
            results_.erase(it, results_.end());
        }
        saveStateInternal();
        return true;
    }

    // Round Control
    bool selectBatch(int batchIndex) {
        std::lock_guard<std::mutex> lock(mutex_);
        currentBatchIndex_ = std::max(0, batchIndex);
        activeContestantId_ = "";
        roundState_ = "idle";
        saveStateInternal();
        return true;
    }

    bool selectContestant(const std::string& id) {
        std::lock_guard<std::mutex> lock(mutex_);
        for (auto& c : contestants_) {
            if (c.id == id) {
                activeContestantId_ = id;
                currentBatchIndex_ = c.batchIndex;
                roundState_ = "ready";
                // Assign paragraph if not assigned
                assignParagraphForContestantInternal(c);
                saveStateInternal();
                return true;
            }
        }
        return false;
    }

    bool startCountdown() {
        std::lock_guard<std::mutex> lock(mutex_);
        if (activeContestantId_.empty()) return false;
        roundState_ = "countdown";
        countdownStartTimeEpochMs_ = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();
        saveStateInternal();
        return true;
    }

    bool startTyping() {
        std::lock_guard<std::mutex> lock(mutex_);
        if (activeContestantId_.empty()) return false;
        roundState_ = "typing";
        typingStartTimeEpochMs_ = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();
        for (auto& c : contestants_) {
            if (c.id == activeContestantId_) {
                c.status = "typing";
                if (c.firstKeystrokeEpochMs == 0) {
                    c.firstKeystrokeEpochMs = typingStartTimeEpochMs_;
                }
                break;
            }
        }
        saveStateInternal();
        return true;
    }

    bool stopRound() {
        std::lock_guard<std::mutex> lock(mutex_);
        roundState_ = "idle";
        if (!activeContestantId_.empty()) {
            for (auto& c : contestants_) {
                if (c.id == activeContestantId_) {
                    if (!c.hasResult) {
                        c.status = "pending";
                    }
                    break;
                }
            }
        }
        activeContestantId_ = "";
        liveStream_ = LiveTypingStream{};
        saveStateInternal();
        return true;
    }

    bool redoCurrentContestant() {
        std::lock_guard<std::mutex> lock(mutex_);
        if (activeContestantId_.empty()) return false;
        for (auto& c : contestants_) {
            if (c.id == activeContestantId_) {
                c.hasResult = false;
                c.result = ContestantResult{};
                c.status = "pending";
                c.assignedParagraphId = "";
                c.assignedParagraphText = "";
                break;
            }
        }
        roundState_ = "ready";
        liveStream_ = LiveTypingStream{};
        // Re-assign paragraph
        for (auto& c : contestants_) {
            if (c.id == activeContestantId_) {
                assignParagraphForContestantInternal(c);
                break;
            }
        }
        saveStateInternal();
        return true;
    }

    bool nextContestant() {
        std::lock_guard<std::mutex> lock(mutex_);
        // Find next contestant in the current batch or subsequent
        std::string nextId = "";
        bool foundCurrent = false;

        for (const auto& c : contestants_) {
            if (c.batchIndex == currentBatchIndex_) {
                if (foundCurrent && c.status == "pending") {
                    nextId = c.id;
                    break;
                }
                if (c.id == activeContestantId_) {
                    foundCurrent = true;
                }
            }
        }

        // If no following pending contestant in this batch, check from start of batch
        if (nextId.empty()) {
            for (const auto& c : contestants_) {
                if (c.batchIndex == currentBatchIndex_ && c.status == "pending" && c.id != activeContestantId_) {
                    nextId = c.id;
                    break;
                }
            }
        }

        if (!nextId.empty()) {
            activeContestantId_ = nextId;
            roundState_ = "ready";
            for (auto& c : contestants_) {
                if (c.id == nextId) {
                    assignParagraphForContestantInternal(c);
                    break;
                }
            }
            saveStateInternal();
            return true;
        }

        // No more in current batch
        activeContestantId_ = "";
        roundState_ = "idle";
        saveStateInternal();
        return false;
    }

    bool closeBatch() {
        std::lock_guard<std::mutex> lock(mutex_);
        // Mark all remaining pending/typing contestants in current batch as absent/closed
        for (auto& c : contestants_) {
            if (c.batchIndex == currentBatchIndex_) {
                if (c.status == "pending" || c.status == "typing") {
                    c.status = "absent";
                }
            }
        }
        activeContestantId_ = "";
        roundState_ = "idle";
        saveStateInternal();
        return true;
    }

    bool nextBatch() {
        std::lock_guard<std::mutex> lock(mutex_);
        currentBatchIndex_++;
        activeContestantId_ = "";
        roundState_ = "idle";

        // Pick first pending contestant in the new batch if available
        for (auto& c : contestants_) {
            if (c.batchIndex == currentBatchIndex_ && c.status == "pending") {
                activeContestantId_ = c.id;
                roundState_ = "ready";
                assignParagraphForContestantInternal(c);
                break;
            }
        }

        saveStateInternal();
        return true;
    }

    // Live typing heartbeat & progress from Contestant Screen
    void updateLiveProgress(const std::string& contestantId,
                            double currentWpm,
                            double currentAccuracy,
                            int cursorPosition,
                            int totalChars,
                            int errorCount,
                            int elapsedSeconds) {
        std::lock_guard<std::mutex> lock(mutex_);
        int64_t nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();

        for (auto& c : contestants_) {
            if (c.id == contestantId) {
                if (c.firstKeystrokeEpochMs == 0) {
                    c.firstKeystrokeEpochMs = nowMs;
                }
                if (c.status == "pending") {
                    c.status = "typing";
                }
                break;
            }
        }

        if (roundState_ != "typing" || activeContestantId_ != contestantId) return;

        liveStream_.contestantId = contestantId;
        liveStream_.currentWpm = currentWpm;
        liveStream_.currentAccuracy = currentAccuracy;
        liveStream_.cursorPosition = cursorPosition;
        liveStream_.totalChars = totalChars;
        liveStream_.errorCount = errorCount;
        liveStream_.elapsedSeconds = elapsedSeconds;
        liveStream_.lastHeartbeatEpochMs = nowMs;
    }

    // Submit contestant test result with cheap server-side verification
    json submitResult(const std::string& contestantId, const json& payload) {
        std::lock_guard<std::mutex> lock(mutex_);
        Contestant* target = nullptr;
        for (auto& c : contestants_) {
            if (c.id == contestantId) {
                target = &c;
                break;
            }
        }
        if (!target) {
            return {{"error", "Contestant not found"}, {"code", "CONTESTANT_NOT_FOUND"}};
        }

        // 1. Check duplicate result (unless admin redo granted)
        if (target->hasResult && !target->redoAllowed) {
            return {{"error", "Registration ID '" + target->regId + "' has already submitted a result."}, {"code", "DUPLICATE_RESULT"}};
        }

        // 2. Validate contestant state: must be typing or active
        if (target->status != "typing" && target->status != "pending") {
            return {{"error", "Contestant is not in typing state."}, {"code", "INVALID_STATE"}};
        }

        // 3. Must have a recorded firstKeystrokeEpochMs
        if (target->firstKeystrokeEpochMs <= 0) {
            return {{"error", "No recorded first keystroke timestamp on server."}, {"code", "NO_START_TIME"}};
        }

        // 4. Validate duration against limit + tolerance (60s + 3s tolerance)
        double durationSeconds = payload.value("durationSeconds", static_cast<double>(config_.timeLimitSeconds));
        if (durationSeconds <= 0.0) durationSeconds = 1.0;
        double maxAllowedDuration = static_cast<double>(config_.timeLimitSeconds) + 3.0;
        if (durationSeconds > maxAllowedDuration) {
            return {{"error", "Submission duration exceeds time limit tolerance."}, {"code", "DURATION_EXCEEDED"}};
        }

        // 5. Must provide keystrokesLog
        if (!payload.contains("keystrokesLog") || !payload["keystrokesLog"].is_array() || payload["keystrokesLog"].empty()) {
            return {{"error", "Missing or empty keystrokes log. Forged submissions are rejected."}, {"code", "MISSING_KEYSTROKES_LOG"}};
        }

        const auto& kLog = payload["keystrokesLog"];
        const std::string& targetText = target->assignedParagraphText;

        // Replay keystrokes to strictly reconstruct typed buffer, error count, and corrected errors
        std::string reconstructed = "";
        int correctedErrors = 0;
        int totalKeyEvents = 0;
        int64_t lastKeyTime = -1;
        int sustainedSub10msCount = 0;

        for (const auto& entry : kLog) {
            std::string key = entry.value("key", "");
            int64_t t = entry.value("time", (int64_t)0);

            if (lastKeyTime > 0 && t >= lastKeyTime) {
                int64_t delta = t - lastKeyTime;
                if (delta < 10) {
                    sustainedSub10msCount++;
                } else {
                    sustainedSub10msCount = 0;
                }
                // Reject sustained bot / pasted keystrokes (<10ms for 8+ consecutive keys)
                if (sustainedSub10msCount >= 8) {
                    return {{"error", "Implausible typing speed detected (sub-10ms sustained keystroke intervals)."}, {"code", "BOT_DETECTED"}};
                }
            }
            if (t > 0) lastKeyTime = t;

            if (key == "Backspace") {
                totalKeyEvents++;
                if (!reconstructed.empty()) {
                    size_t lastIdx = reconstructed.size() - 1;
                    if (lastIdx < targetText.size() && reconstructed[lastIdx] != targetText[lastIdx]) {
                        correctedErrors++;
                    }
                    reconstructed.pop_back();
                }
            } else if (key.size() == 1 || key == "Space") {
                char ch = (key == "Space") ? ' ' : key[0];
                totalKeyEvents++;
                reconstructed.push_back(ch);
            }
        }

        // Calculate verified correct, incorrect, and extra against assigned paragraph
        int verifiedCorrect = 0;
        int verifiedIncorrect = 0;
        int verifiedExtra = 0;
        int verifiedMissed = std::max(0, static_cast<int>(targetText.size()) - static_cast<int>(reconstructed.size()));

        for (size_t i = 0; i < reconstructed.size(); ++i) {
            if (i < targetText.size()) {
                if (reconstructed[i] == targetText[i]) {
                    verifiedCorrect++;
                } else {
                    verifiedIncorrect++;
                }
            } else {
                verifiedExtra++;
            }
        }

        int uncorrectedErrors = verifiedIncorrect + verifiedExtra;
        int totalKeystrokes = std::max(static_cast<int>(reconstructed.size()) + correctedErrors, totalKeyEvents);

        double durationMinutes = durationSeconds / 60.0;
        if (durationMinutes <= 0.0) durationMinutes = 1.0 / 60.0;

        // Authoritative Net WPM & Raw WPM recomputed entirely by server
        double rawWpm = ((verifiedCorrect + verifiedIncorrect + verifiedExtra) / 5.0) / durationMinutes;
        double netWpm = (static_cast<double>(verifiedCorrect) / 5.0) / durationMinutes;

        // Reject implausible WPM above 300
        if (netWpm > 300.0 || rawWpm > 320.0) {
            return {{"error", "Implausible typing speed (WPM exceeds 300 limit)."}, {"code", "SPEED_LIMIT_EXCEEDED"}};
        }

        // Authoritative Accuracy with 0.5 correction penalty
        constexpr double CORRECTION_PENALTY = 0.5;
        double accuracy = 100.0;
        if (totalKeystrokes > 0) {
            double penalty = uncorrectedErrors + (CORRECTION_PENALTY * correctedErrors);
            accuracy = std::max(0.0, 1.0 - (penalty / totalKeystrokes)) * 100.0;
        }
        accuracy = std::clamp(accuracy, 0.0, 100.0);

        std::vector<double> rawKeystrokesPerSecond;
        if (payload.contains("rawKeystrokesPerSecond") && payload["rawKeystrokesPerSecond"].is_array()) {
            for (const auto& item : payload["rawKeystrokesPerSecond"]) {
                if (item.is_number()) {
                    rawKeystrokesPerSecond.push_back(item.get<double>());
                }
            }
        }

        // Consistency
        double consistency = 100.0;
        if (!rawKeystrokesPerSecond.empty()) {
            double sum = std::accumulate(rawKeystrokesPerSecond.begin(), rawKeystrokesPerSecond.end(), 0.0);
            double mean = sum / rawKeystrokesPerSecond.size();
            if (mean > 0.0001) {
                double varSum = 0.0;
                for (double val : rawKeystrokesPerSecond) {
                    varSum += (val - mean) * (val - mean);
                }
                double stddev = std::sqrt(varSum / rawKeystrokesPerSecond.size());
                double cv = (stddev / mean) * 100.0;
                consistency = std::clamp(100.0 - cv, 0.0, 100.0);
            } else {
                consistency = 0.0;
            }
        }

        // Smoothed perSecondWpm
        std::vector<double> perSecondWpm;
        if (!rawKeystrokesPerSecond.empty()) {
            std::vector<double> instantWpm;
            for (double ks : rawKeystrokesPerSecond) {
                instantWpm.push_back((ks / 5.0) * 60.0);
            }
            for (size_t i = 0; i < instantWpm.size(); ++i) {
                double prev = (i > 0) ? instantWpm[i - 1] : instantWpm[i];
                double curr = instantWpm[i];
                double next = (i + 1 < instantWpm.size()) ? instantWpm[i + 1] : instantWpm[i];
                double smoothed = 0.2 * prev + 0.6 * curr + 0.2 * next;
                perSecondWpm.push_back(std::round(smoothed * 10.0) / 10.0);
            }
        }

        target->hasResult = true;
        target->status = "completed";
        target->result.netWpm = std::round(netWpm * 10.0) / 10.0;
        target->result.rawWpm = std::round(rawWpm * 10.0) / 10.0;
        target->result.accuracy = std::round(accuracy * 10.0) / 10.0;
        target->result.errors = verifiedIncorrect + verifiedExtra;
        target->result.correctedErrors = correctedErrors;
        target->result.totalKeystrokes = totalKeystrokes;
        target->result.consistency = std::round(consistency * 10.0) / 10.0;
        target->result.durationSeconds = std::round(durationSeconds * 10.0) / 10.0;
        target->result.correctChars = verifiedCorrect;
        target->result.incorrectChars = verifiedIncorrect;
        target->result.extraChars = verifiedExtra;
        target->result.missedChars = verifiedMissed;
        target->result.completedAtEpochMs = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();
        target->result.perSecondWpm = perSecondWpm;

        roundState_ = "finished";
        liveStream_ = LiveTypingStream{};

        // Persist to denormalized results list
        ResultRecord rec;
        rec.id = "res_" + std::to_string(target->result.completedAtEpochMs) + "_" + target->id;
        rec.contestantId = target->id;
        rec.name = target->name;
        rec.regId = target->regId;
        rec.department = target->department;
        rec.batchIndex = target->batchIndex;
        rec.netWpm = target->result.netWpm;
        rec.rawWpm = target->result.rawWpm;
        rec.accuracy = target->result.accuracy;
        rec.errors = target->result.errors;
        rec.correctedErrors = target->result.correctedErrors;
        rec.totalKeystrokes = target->result.totalKeystrokes;
        rec.consistency = target->result.consistency;
        rec.durationSeconds = target->result.durationSeconds;
        rec.correctChars = target->result.correctChars;
        rec.incorrectChars = target->result.incorrectChars;
        rec.extraChars = target->result.extraChars;
        rec.missedChars = target->result.missedChars;
        rec.completedAtEpochMs = target->result.completedAtEpochMs;
        rec.perSecondWpm = target->result.perSecondWpm;

        // Replace any previous result for this contestant if redo was granted
        bool foundExisting = false;
        for (auto& r : results_) {
            if (r.contestantId == target->id) {
                r = rec;
                foundExisting = true;
                break;
            }
        }
        if (!foundExisting) {
            results_.push_back(rec);
        }

        // Check synced cohort reveal
        triggerSyncedCohortCheckInternal(target->id);

        saveStateInternal();
        updateRevealsInternal();
        return serializeStateInternal();
    }

    // Reset entire event with automatic pre-reset backup
    bool resetEvent() {
        std::lock_guard<std::mutex> lock(mutex_);
        try {
            if (std::filesystem::exists(stateFilePath_)) {
                std::filesystem::path p(stateFilePath_);
                std::filesystem::path backupDir = p.parent_path() / "backups";
                std::filesystem::create_directories(backupDir);
                int64_t nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                    std::chrono::system_clock::now().time_since_epoch()).count();
                std::filesystem::path backupFile = backupDir / ("competition_state-" + std::to_string(nowMs) + ".json");
                std::filesystem::copy_file(stateFilePath_, backupFile, std::filesystem::copy_options::overwrite_existing);
                std::cout << "[INFO] Created automatic pre-reset backup at: " << backupFile.string() << std::endl;
            }
        } catch (const std::exception& e) {
            std::cerr << "[WARN] Pre-reset backup failed: " << e.what() << std::endl;
        }

        contestants_.clear();
        results_.clear();
        activeReveal_.reset();
        revealQueue_.clear();
        currentBatchIndex_ = 0;
        activeContestantId_ = "";
        roundState_ = "idle";
        liveStream_ = LiveTypingStream{};
        saveStateInternal();
        return true;
    }

    // Set projector view
    void setProjectorView(const std::string& view) {
        std::lock_guard<std::mutex> lock(mutex_);
        projectorView_ = view;
        saveStateInternal();
    }

    std::string exportCsv() const {
        std::lock_guard<std::mutex> lock(mutex_);
        std::stringstream ss;
        ss << "Rank,Name,Reg ID,Department,Batch,Net WPM,Raw WPM,Accuracy %,Errors,Consistency %,Duration (s),Status,Completed At\n";

        // Sort completed contestants by netWpm desc, accuracy desc, errors asc
        std::vector<Contestant> ranked = contestants_;
        std::sort(ranked.begin(), ranked.end(), [](const Contestant& a, const Contestant& b) {
            if (a.hasResult != b.hasResult) return a.hasResult > b.hasResult;
            if (a.result.netWpm != b.result.netWpm) return a.result.netWpm > b.result.netWpm;
            if (a.result.accuracy != b.result.accuracy) return a.result.accuracy > b.result.accuracy;
            return a.result.errors < b.result.errors;
        });

        int rank = 1;
        for (const auto& c : ranked) {
            ss << (c.hasResult ? std::to_string(rank++) : "-") << ",";
            ss << "\"" << escapeCsv(c.name) << "\",";
            ss << "\"" << escapeCsv(c.regId) << "\",";
            ss << "\"" << escapeCsv(c.department) << "\",";
            ss << (c.batchIndex + 1) << ",";
            if (c.hasResult) {
                ss << std::fixed << std::setprecision(1)
                   << c.result.netWpm << ","
                   << c.result.rawWpm << ","
                   << c.result.accuracy << ","
                   << c.result.errors << ","
                   << c.result.consistency << ","
                   << c.result.durationSeconds << ",";
            } else {
                ss << "-,-,-,-,-,-,";
            }
            ss << c.status << ",";
            if (c.hasResult && c.result.completedAtEpochMs > 0) {
                std::time_t t = c.result.completedAtEpochMs / 1000;
                std::tm tm;
                gmtime_r(&t, &tm);
                char buf[32];
                std::strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S UTC", &tm);
                ss << buf;
            } else {
                ss << "-";
            }
            ss << "\n";
        }

        return ss.str();
    }

private:
    static std::string trim(const std::string& str) {
        size_t start = 0;
        size_t end = str.size();
        while (start < end && std::isspace(static_cast<unsigned char>(str[start]))) ++start;
        while (end > start && std::isspace(static_cast<unsigned char>(str[end - 1]))) --end;
        return str.substr(start, end - start);
    }

    static std::string escapeCsv(const std::string& str) {
        std::string res;
        for (char c : str) {
            if (c == '"') res += "\"\"";
            else res += c;
        }
        return res;
    }

    void assignParagraphForContestantInternal(Contestant& c) {
        if (!c.assignedParagraphText.empty() || paragraphs_.empty()) return;

        static thread_local std::mt19937 gen{std::random_device{}()};

        if (config_.paragraphRule == "same_for_batch") {
            // Check if any contestant in the same batch already has an assigned paragraph
            for (const auto& other : contestants_) {
                if (other.batchIndex == c.batchIndex && !other.assignedParagraphText.empty()) {
                    c.assignedParagraphId = other.assignedParagraphId;
                    c.assignedParagraphText = other.assignedParagraphText;
                    return;
                }
            }
            // Else pick a random paragraph from the pool for this batch
            size_t idx = gen() % paragraphs_.size();
            c.assignedParagraphId = paragraphs_[idx].id;
            c.assignedParagraphText = paragraphs_[idx].text;
        } else {
            // "random_per_contestant"
            size_t idx = gen() % paragraphs_.size();
            c.assignedParagraphId = paragraphs_[idx].id;
            c.assignedParagraphText = paragraphs_[idx].text;
        }
    }

    json serializeStateInternal() const {
        json j;
        j["config"] = {
            {"eventName", config_.eventName},
            {"timeLimitSeconds", config_.timeLimitSeconds},
            {"paragraphWordCount", config_.paragraphWordCount},
            {"tier", config_.tier},
            {"batchSize", config_.batchSize},
            {"paragraphRule", config_.paragraphRule},
            {"batchRevealsEnabled", config_.batchRevealsEnabled},
            {"syncWindowSeconds", config_.syncWindowSeconds},
            {"revealHoldSeconds", config_.revealHoldSeconds},
            {"revealMode", config_.revealMode}
        };

        json pArr = json::array();
        for (const auto& p : paragraphs_) {
            pArr.push_back({
                {"id", p.id},
                {"text", p.text},
                {"wordCount", p.wordCount},
                {"avgWordLength", std::round(p.avgWordLength * 100.0) / 100.0},
                {"tier", p.tier}
            });
        }
        j["paragraphs"] = pArr;

        json cArr = json::array();
        for (const auto& c : contestants_) {
            json cObj = {
                {"id", c.id},
                {"name", c.name},
                {"regId", c.regId},
                {"department", c.department},
                {"redoAllowed", c.redoAllowed},
                {"batchIndex", c.batchIndex},
                {"status", c.status},
                {"assignedParagraphId", c.assignedParagraphId},
                {"assignedParagraphText", c.assignedParagraphText},
                {"hasResult", c.hasResult}
            };
            if (c.hasResult) {
                cObj["result"] = {
                    {"netWpm", c.result.netWpm},
                    {"rawWpm", c.result.rawWpm},
                    {"accuracy", c.result.accuracy},
                    {"errors", c.result.errors},
                    {"correctedErrors", c.result.correctedErrors},
                    {"totalKeystrokes", c.result.totalKeystrokes},
                    {"consistency", c.result.consistency},
                    {"durationSeconds", c.result.durationSeconds},
                    {"correctChars", c.result.correctChars},
                    {"incorrectChars", c.result.incorrectChars},
                    {"extraChars", c.result.extraChars},
                    {"missedChars", c.result.missedChars},
                    {"completedAtEpochMs", c.result.completedAtEpochMs},
                    {"perSecondWpm", c.result.perSecondWpm}
                };
            }
            cArr.push_back(cObj);
        }
        j["contestants"] = cArr;

        json rArr = json::array();
        for (const auto& r : results_) {
            rArr.push_back({
                {"id", r.id},
                {"contestantId", r.contestantId},
                {"name", r.name},
                {"regId", r.regId},
                {"department", r.department},
                {"batchIndex", r.batchIndex},
                {"netWpm", r.netWpm},
                {"rawWpm", r.rawWpm},
                {"accuracy", r.accuracy},
                {"errors", r.errors},
                {"correctedErrors", r.correctedErrors},
                {"totalKeystrokes", r.totalKeystrokes},
                {"consistency", r.consistency},
                {"durationSeconds", r.durationSeconds},
                {"correctChars", r.correctChars},
                {"incorrectChars", r.incorrectChars},
                {"extraChars", r.extraChars},
                {"missedChars", r.missedChars},
                {"completedAtEpochMs", r.completedAtEpochMs},
                {"perSecondWpm", r.perSecondWpm}
            });
        }
        j["results"] = rArr;

        if (activeReveal_.has_value()) {
            j["reveal"] = {
                {"id", activeReveal_->id},
                {"kind", activeReveal_->kind},
                {"contestantIds", activeReveal_->contestantIds},
                {"startedAt", activeReveal_->startedAtEpochMs},
                {"endsAt", activeReveal_->endsAtEpochMs}
            };
        } else {
            j["reveal"] = nullptr;
        }

        json qArr = json::array();
        for (const auto& q : revealQueue_) {
            qArr.push_back({
                {"id", q.id},
                {"kind", q.kind},
                {"contestantIds", q.contestantIds},
                {"startedAt", q.startedAtEpochMs},
                {"endsAt", q.endsAtEpochMs}
            });
        }
        j["revealQueue"] = qArr;

        int64_t currentServerTimeMs = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();
        j["serverTimeEpochMs"] = currentServerTimeMs;

        j["currentBatchIndex"] = currentBatchIndex_;
        j["activeContestantId"] = activeContestantId_;
        j["roundState"] = roundState_;
        j["projectorView"] = projectorView_;
        j["countdownStartTimeEpochMs"] = countdownStartTimeEpochMs_;
        j["typingStartTimeEpochMs"] = typingStartTimeEpochMs_;

        j["liveStream"] = {
            {"contestantId", liveStream_.contestantId},
            {"currentWpm", liveStream_.currentWpm},
            {"currentAccuracy", liveStream_.currentAccuracy},
            {"cursorPosition", liveStream_.cursorPosition},
            {"totalChars", liveStream_.totalChars},
            {"errorCount", liveStream_.errorCount},
            {"elapsedSeconds", liveStream_.elapsedSeconds},
            {"lastHeartbeatEpochMs", liveStream_.lastHeartbeatEpochMs}
        };

        return j;
    }

    void loadState() {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!std::filesystem::exists(stateFilePath_)) {
            return;
        }

        try {
            std::ifstream file(stateFilePath_);
            if (!file.is_open()) return;
            json j = json::parse(file);

            if (j.contains("config") && j["config"].is_object()) {
                auto& c = j["config"];
                config_.eventName = c.value("eventName", "TypeX Stage Championship");
                config_.timeLimitSeconds = c.value("timeLimitSeconds", 60);
                config_.paragraphWordCount = c.value("paragraphWordCount", 40);
                config_.tier = c.value("tier", "english_1k");
                config_.batchSize = c.value("batchSize", 3);
                config_.paragraphRule = c.value("paragraphRule", "same_for_batch");
                config_.revealMode = c.value("revealMode", "instant");
            }

            paragraphs_.clear();
            if (j.contains("paragraphs") && j["paragraphs"].is_array()) {
                for (const auto& p : j["paragraphs"]) {
                    paragraphs_.push_back({
                        p.value("id", ""),
                        p.value("text", ""),
                        p.value("wordCount", 40),
                        p.value("avgWordLength", 0.0),
                        p.value("tier", "english_1k")
                    });
                }
            }

            contestants_.clear();
            if (j.contains("contestants") && j["contestants"].is_array()) {
                for (const auto& c : j["contestants"]) {
                    Contestant item;
                    item.id = c.value("id", "");
                    item.name = c.value("name", "");
                    item.regId = c.value("regId", "");
                    item.department = c.value("department", "General");
                    item.redoAllowed = c.value("redoAllowed", false);
                    item.batchIndex = c.value("batchIndex", 0);
                    item.status = c.value("status", "pending");
                    item.assignedParagraphId = c.value("assignedParagraphId", "");
                    item.assignedParagraphText = c.value("assignedParagraphText", "");
                    item.hasResult = c.value("hasResult", false);

                    if (item.hasResult && c.contains("result")) {
                        auto& r = c["result"];
                        item.result.netWpm = r.value("netWpm", 0.0);
                        item.result.rawWpm = r.value("rawWpm", 0.0);
                        item.result.accuracy = r.value("accuracy", 100.0);
                        item.result.errors = r.value("errors", 0);
                        item.result.correctedErrors = r.value("correctedErrors", 0);
                        item.result.totalKeystrokes = r.value("totalKeystrokes", 0);
                        item.result.consistency = r.value("consistency", 100.0);
                        item.result.durationSeconds = r.value("durationSeconds", 0.0);
                        item.result.correctChars = r.value("correctChars", 0);
                        item.result.incorrectChars = r.value("incorrectChars", 0);
                        item.result.extraChars = r.value("extraChars", 0);
                        item.result.missedChars = r.value("missedChars", 0);
                        item.result.completedAtEpochMs = r.value("completedAtEpochMs", (int64_t)0);
                        if (r.contains("perSecondWpm") && r["perSecondWpm"].is_array()) {
                            for (const auto& v : r["perSecondWpm"]) {
                                if (v.is_number()) item.result.perSecondWpm.push_back(v.get<double>());
                            }
                        }
                    }
                    contestants_.push_back(item);
                }
            }

            results_.clear();
            if (j.contains("results") && j["results"].is_array()) {
                for (const auto& r : j["results"]) {
                    ResultRecord rec;
                    rec.id = r.value("id", "");
                    rec.contestantId = r.value("contestantId", "");
                    rec.name = r.value("name", "");
                    rec.regId = r.value("regId", "");
                    rec.department = r.value("department", "General");
                    rec.batchIndex = r.value("batchIndex", 0);
                    rec.netWpm = r.value("netWpm", 0.0);
                    rec.rawWpm = r.value("rawWpm", 0.0);
                    rec.accuracy = r.value("accuracy", 100.0);
                    rec.errors = r.value("errors", 0);
                    rec.correctedErrors = r.value("correctedErrors", 0);
                    rec.totalKeystrokes = r.value("totalKeystrokes", 0);
                    rec.consistency = r.value("consistency", 100.0);
                    rec.durationSeconds = r.value("durationSeconds", 0.0);
                    rec.correctChars = r.value("correctChars", 0);
                    rec.incorrectChars = r.value("incorrectChars", 0);
                    rec.extraChars = r.value("extraChars", 0);
                    rec.missedChars = r.value("missedChars", 0);
                    rec.completedAtEpochMs = r.value("completedAtEpochMs", (int64_t)0);
                    if (r.contains("perSecondWpm") && r["perSecondWpm"].is_array()) {
                        for (const auto& v : r["perSecondWpm"]) {
                            if (v.is_number()) rec.perSecondWpm.push_back(v.get<double>());
                        }
                    }
                    results_.push_back(rec);
                }
            } else {
                // Backwards compatibility: populate results_ from any completed contestants
                for (const auto& c : contestants_) {
                    if (c.hasResult) {
                        ResultRecord rec;
                        rec.id = "res_" + std::to_string(c.result.completedAtEpochMs) + "_" + c.id;
                        rec.contestantId = c.id;
                        rec.name = c.name;
                        rec.regId = c.regId;
                        rec.department = c.department;
                        rec.batchIndex = c.batchIndex;
                        rec.netWpm = c.result.netWpm;
                        rec.rawWpm = c.result.rawWpm;
                        rec.accuracy = c.result.accuracy;
                        rec.errors = c.result.errors;
                        rec.correctedErrors = c.result.correctedErrors;
                        rec.totalKeystrokes = c.result.totalKeystrokes;
                        rec.consistency = c.result.consistency;
                        rec.durationSeconds = c.result.durationSeconds;
                        rec.correctChars = c.result.correctChars;
                        rec.incorrectChars = c.result.incorrectChars;
                        rec.extraChars = c.result.extraChars;
                        rec.missedChars = c.result.missedChars;
                        rec.completedAtEpochMs = c.result.completedAtEpochMs;
                        rec.perSecondWpm = c.result.perSecondWpm;
                        results_.push_back(rec);
                    }
                }
            }

            if (j.contains("config") && j["config"].is_object()) {
                auto& c = j["config"];
                config_.batchRevealsEnabled = c.value("batchRevealsEnabled", true);
                config_.syncWindowSeconds = c.value("syncWindowSeconds", 10);
                config_.revealHoldSeconds = c.value("revealHoldSeconds", 15);
            }

            currentBatchIndex_ = j.value("currentBatchIndex", 0);
            activeContestantId_ = j.value("activeContestantId", "");
            roundState_ = j.value("roundState", "idle");
            projectorView_ = j.value("projectorView", "overall");
            countdownStartTimeEpochMs_ = j.value("countdownStartTimeEpochMs", (int64_t)0);
            typingStartTimeEpochMs_ = j.value("typingStartTimeEpochMs", (int64_t)0);

        } catch (const std::exception& e) {
            std::cerr << "[WARN] Failed to load competition state: " << e.what() << std::endl;
        }
    }

    void saveStateInternal() const {
        try {
            std::filesystem::path p(stateFilePath_);
            if (p.has_parent_path()) {
                std::filesystem::create_directories(p.parent_path());
            }

            std::string tempPath = stateFilePath_ + ".tmp";
            {
                std::ofstream out(tempPath);
                if (!out.is_open()) return;
                out << serializeStateInternal().dump(2);
                out.flush();
            }

            // Atomic rename
            std::filesystem::rename(tempPath, stateFilePath_);
        } catch (const std::exception& e) {
            std::cerr << "[ERROR] Failed to save competition state atomically: " << e.what() << std::endl;
        }
    }

    mutable std::mutex mutex_;
    std::string stateFilePath_;
    AdminPinManager* pinManager_{nullptr};

    CompetitionConfig config_;
    std::vector<Paragraph> paragraphs_;
    std::vector<Contestant> contestants_;

    int currentBatchIndex_{0};
    std::string activeContestantId_{""};
    std::string roundState_{"idle"}; // "idle", "ready", "countdown", "typing", "finished"
    std::string projectorView_{"overall"}; // "overall", "batch", "podium", "live"

    int64_t countdownStartTimeEpochMs_{0};
    int64_t typingStartTimeEpochMs_{0};

    LiveTypingStream liveStream_;
    std::vector<ResultRecord> results_;
    std::optional<RevealState> activeReveal_;
    std::deque<RevealState> revealQueue_;

    void updateRevealsInternal() {
        int64_t nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();

        if (activeReveal_.has_value()) {
            if (nowMs >= activeReveal_->endsAtEpochMs) {
                activeReveal_.reset();
                if (!revealQueue_.empty()) {
                    activeReveal_ = revealQueue_.front();
                    revealQueue_.pop_front();
                    activeReveal_->startedAtEpochMs = nowMs;
                    activeReveal_->endsAtEpochMs = nowMs + (config_.revealHoldSeconds * 1000);
                }
            }
        } else if (!revealQueue_.empty()) {
            activeReveal_ = revealQueue_.front();
            revealQueue_.pop_front();
            activeReveal_->startedAtEpochMs = nowMs;
            activeReveal_->endsAtEpochMs = nowMs + (config_.revealHoldSeconds * 1000);
        }
    }

    void triggerSyncedCohortCheckInternal(const std::string& finishedContestantId) {
        int targetBatch = -1;
        int64_t targetFirstKs = 0;
        for (const auto& c : contestants_) {
            if (c.id == finishedContestantId) {
                targetBatch = c.batchIndex;
                targetFirstKs = c.firstKeystrokeEpochMs;
                break;
            }
        }
        if (targetBatch < 0 || targetFirstKs == 0) return;

        int64_t syncWindowMs = static_cast<int64_t>(config_.syncWindowSeconds) * 1000;
        std::vector<std::string> cohortIds;

        for (const auto& c : contestants_) {
            if (c.batchIndex == targetBatch && c.firstKeystrokeEpochMs > 0 && c.hasResult) {
                if (std::abs(c.firstKeystrokeEpochMs - targetFirstKs) <= syncWindowMs) {
                    cohortIds.push_back(c.id);
                }
            }
        }

        // Only trigger synced reveal if 2 or more contestants in the batch started within sync window
        if (cohortIds.size() >= 2) {
            RevealState rev;
            rev.id = "rev_" + std::to_string(std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::system_clock::now().time_since_epoch()).count());
            rev.kind = "synced-batch";
            rev.contestantIds = cohortIds;

            int64_t nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::system_clock::now().time_since_epoch()).count();

            if (!activeReveal_.has_value()) {
                rev.startedAtEpochMs = nowMs;
                rev.endsAtEpochMs = nowMs + (config_.revealHoldSeconds * 1000);
                activeReveal_ = rev;
            } else {
                // If existing reveal is already for this batch or queued, don't duplicate
                bool alreadyInQueue = false;
                for (const auto& q : revealQueue_) {
                    if (q.contestantIds == cohortIds) {
                        alreadyInQueue = true;
                        break;
                    }
                }
                if (!alreadyInQueue && activeReveal_->contestantIds != cohortIds) {
                    revealQueue_.push_back(rev);
                }
            }
        }
    }
};

} // namespace typex
