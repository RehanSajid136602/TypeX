#pragma once

#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <unordered_map>
#include <mutex>
#include <filesystem>
#include <chrono>
#include <sstream>
#include <iomanip>
#include <algorithm>
#include <cmath>

#include "sqlite3.h"
#include "json.hpp"

using json = nlohmann::json;

namespace typex {

class DatabaseManager {
public:
    explicit DatabaseManager(const std::string& dbPath) : dbPath_(dbPath), db_(nullptr) {
        initDatabase();
    }

    ~DatabaseManager() {
        closeDatabase();
    }

    // Disable copying
    DatabaseManager(const DatabaseManager&) = delete;
    DatabaseManager& operator=(const DatabaseManager&) = delete;

    std::string getDbPath() const {
        return dbPath_;
    }

    // Integrity check
    bool runIntegrityCheck(std::string& outMessage) {
        std::lock_guard<std::mutex> lock(dbMutex_);
        if (!db_) return false;
        sqlite3_stmt* stmt = nullptr;
        if (sqlite3_prepare_v2(db_, "PRAGMA integrity_check;", -1, &stmt, nullptr) != SQLITE_OK) {
            outMessage = sqlite3_errmsg(db_);
            return false;
        }
        bool ok = true;
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            const char* res = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
            if (res) {
                outMessage = res;
                if (outMessage != "ok") ok = false;
            }
        }
        sqlite3_finalize(stmt);
        return ok;
    }

    // Create online backup keeping last 7 backups
    bool createBackup(std::string& outBackupPath) {
        std::lock_guard<std::mutex> lock(dbMutex_);
        if (!db_) return false;

        try {
            std::filesystem::path p(dbPath_);
            std::filesystem::path backupDir = p.parent_path() / "backups";
            std::filesystem::create_directories(backupDir);

            auto nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::system_clock::now().time_since_epoch()).count();

            std::string filename = "typex-backup-" + std::to_string(nowMs) + ".db";
            std::filesystem::path destPath = backupDir / filename;

            sqlite3* pDest = nullptr;
            int rc = sqlite3_open(destPath.string().c_str(), &pDest);
            if (rc != SQLITE_OK) {
                if (pDest) sqlite3_close(pDest);
                return false;
            }

            sqlite3_backup* pBackup = sqlite3_backup_init(pDest, "main", db_, "main");
            if (!pBackup) {
                sqlite3_close(pDest);
                return false;
            }

            rc = sqlite3_backup_step(pBackup, -1);
            sqlite3_backup_finish(pBackup);
            sqlite3_close(pDest);

            if (rc != SQLITE_DONE) return false;

            outBackupPath = destPath.string();

            // Prune backups: keep newest 7
            std::vector<std::filesystem::directory_entry> entries;
            for (const auto& entry : std::filesystem::directory_iterator(backupDir)) {
                if (entry.is_regular_file() && entry.path().extension() == ".db") {
                    entries.push_back(entry);
                }
            }
            std::sort(entries.begin(), entries.end(), [](const auto& a, const auto& b) {
                return a.last_write_time() > b.last_write_time();
            });

            for (size_t i = 7; i < entries.size(); ++i) {
                std::error_code ec;
                std::filesystem::remove(entries[i].path(), ec);
            }

            return true;
        } catch (const std::exception& e) {
            std::cerr << "[ERROR] createBackup failed: " << e.what() << std::endl;
            return false;
        }
    }

    // Restore from newest good backup if database is corrupted
    bool restoreNewestBackup() {
        std::lock_guard<std::mutex> lock(dbMutex_);
        closeDatabaseInternal();

        try {
            std::filesystem::path p(dbPath_);
            std::filesystem::path backupDir = p.parent_path() / "backups";
            if (!std::filesystem::exists(backupDir)) return false;

            std::vector<std::filesystem::directory_entry> entries;
            for (const auto& entry : std::filesystem::directory_iterator(backupDir)) {
                if (entry.is_regular_file() && entry.path().extension() == ".db") {
                    entries.push_back(entry);
                }
            }
            if (entries.empty()) return false;

            std::sort(entries.begin(), entries.end(), [](const auto& a, const auto& b) {
                return a.last_write_time() > b.last_write_time();
            });

            for (const auto& entry : entries) {
                sqlite3* testDb = nullptr;
                if (sqlite3_open_v2(entry.path().string().c_str(), &testDb, SQLITE_OPEN_READONLY, nullptr) == SQLITE_OK) {
                    sqlite3_stmt* stmt = nullptr;
                    bool good = false;
                    if (sqlite3_prepare_v2(testDb, "PRAGMA integrity_check;", -1, &stmt, nullptr) == SQLITE_OK) {
                        if (sqlite3_step(stmt) == SQLITE_ROW) {
                            const char* res = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
                            if (res && std::string(res) == "ok") good = true;
                        }
                        sqlite3_finalize(stmt);
                    }
                    sqlite3_close(testDb);

                    if (good) {
                        std::cout << "[INFO] Restoring corrupted database from backup: " << entry.path().string() << std::endl;
                        std::error_code ec;
                        std::filesystem::copy_file(entry.path(), dbPath_, std::filesystem::copy_options::overwrite_existing, ec);
                        initDatabaseInternal();
                        return true;
                    }
                }
            }
        } catch (const std::exception& e) {
            std::cerr << "[ERROR] restoreNewestBackup failed: " << e.what() << std::endl;
        }
        initDatabaseInternal();
        return false;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Profile Management
    // ─────────────────────────────────────────────────────────────────────────

    json listProfiles() {
        std::lock_guard<std::mutex> lock(dbMutex_);
        json res = json::array();
        if (!db_) return res;

        sqlite3_stmt* stmt = nullptr;
        const char* sql = "SELECT id, name, color, created_at, last_used_at, archived FROM profiles WHERE archived = 0 ORDER BY last_used_at DESC, id ASC;";
        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) {
            return res;
        }

        while (sqlite3_step(stmt) == SQLITE_ROW) {
            int64_t id = sqlite3_column_int64(stmt, 0);
            const char* name = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
            const char* color = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
            int64_t createdAt = sqlite3_column_int64(stmt, 3);
            int64_t lastUsedAt = sqlite3_column_int64(stmt, 4);
            int archived = sqlite3_column_int(stmt, 5);

            res.push_back({
                {"id", id},
                {"name", name ? name : ""},
                {"color", color ? color : "#F59E0B"},
                {"createdAt", createdAt},
                {"lastUsedAt", lastUsedAt},
                {"archived", archived != 0}
            });
        }
        sqlite3_finalize(stmt);
        return res;
    }

    json getProfile(int64_t id) {
        std::lock_guard<std::mutex> lock(dbMutex_);
        if (!db_) return nullptr;

        sqlite3_stmt* stmt = nullptr;
        const char* sql = "SELECT id, name, color, created_at, last_used_at, archived FROM profiles WHERE id = ?;";
        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) {
            return nullptr;
        }
        sqlite3_bind_int64(stmt, 1, id);

        json res = nullptr;
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            res = {
                {"id", sqlite3_column_int64(stmt, 0)},
                {"name", reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1))},
                {"color", reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2))},
                {"createdAt", sqlite3_column_int64(stmt, 3)},
                {"lastUsedAt", sqlite3_column_int64(stmt, 4)},
                {"archived", sqlite3_column_int(stmt, 5) != 0}
            };
        }
        sqlite3_finalize(stmt);
        return res;
    }

    int64_t createProfile(const std::string& rawName, const std::string& color = "#F59E0B") {
        std::lock_guard<std::mutex> lock(dbMutex_);
        if (!db_) return -1;

        std::string name = trimString(rawName);
        if (name.empty() || name.size() > 40) return -1;

        int64_t nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();

        sqlite3_stmt* stmt = nullptr;
        const char* sql = "INSERT INTO profiles (name, color, created_at, last_used_at, archived) VALUES (?, ?, ?, ?, 0);";
        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) {
            return -1;
        }

        sqlite3_bind_text(stmt, 1, name.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 2, color.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_int64(stmt, 3, nowMs);
        sqlite3_bind_int64(stmt, 4, nowMs);

        int rc = sqlite3_step(stmt);
        sqlite3_finalize(stmt);

        if (rc != SQLITE_DONE) return -1;
        int64_t newId = sqlite3_last_insert_rowid(db_);

        // Set as active profile in settings
        setSettingInternal("active_profile_id", std::to_string(newId));

        return newId;
    }

    bool touchProfileLastUsed(int64_t profileId) {
        std::lock_guard<std::mutex> lock(dbMutex_);
        if (!db_) return false;

        int64_t nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();

        sqlite3_stmt* stmt = nullptr;
        const char* sql = "UPDATE profiles SET last_used_at = ? WHERE id = ?;";
        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;

        sqlite3_bind_int64(stmt, 1, nowMs);
        sqlite3_bind_int64(stmt, 2, profileId);
        int rc = sqlite3_step(stmt);
        sqlite3_finalize(stmt);

        setSettingInternal("active_profile_id", std::to_string(profileId));
        return rc == SQLITE_DONE;
    }

    bool updateProfile(int64_t profileId, const std::string& newName, const std::string& newColor) {
        std::lock_guard<std::mutex> lock(dbMutex_);
        if (!db_) return false;

        std::string name = trimString(newName);
        if (name.empty() || name.size() > 40) return false;

        sqlite3_stmt* stmt = nullptr;
        const char* sql = "UPDATE profiles SET name = ?, color = ? WHERE id = ?;";
        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;

        sqlite3_bind_text(stmt, 1, name.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 2, newColor.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_int64(stmt, 3, profileId);

        int rc = sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        return rc == SQLITE_DONE;
    }

    bool deleteProfile(int64_t profileId) {
        std::lock_guard<std::mutex> lock(dbMutex_);
        if (!db_) return false;

        sqlite3_stmt* stmt = nullptr;
        const char* sql = "DELETE FROM profiles WHERE id = ?;";
        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;

        sqlite3_bind_int64(stmt, 1, profileId);
        int rc = sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        return rc == SQLITE_DONE;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Settings / Active Profile
    // ─────────────────────────────────────────────────────────────────────────

    std::string getSetting(const std::string& key, const std::string& defaultVal = "") {
        std::lock_guard<std::mutex> lock(dbMutex_);
        return getSettingInternal(key, defaultVal);
    }

    void setSetting(const std::string& key, const std::string& val) {
        std::lock_guard<std::mutex> lock(dbMutex_);
        setSettingInternal(key, val);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Mastery Profile JSON Storage Per User
    // ─────────────────────────────────────────────────────────────────────────

    json getMasteryProfile(int64_t profileId) {
        std::lock_guard<std::mutex> lock(dbMutex_);
        if (!db_) return nullptr;

        sqlite3_stmt* stmt = nullptr;
        const char* sql = "SELECT data FROM mastery_profiles WHERE profile_id = ?;";
        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return nullptr;

        sqlite3_bind_int64(stmt, 1, profileId);
        json res = nullptr;
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            const char* d = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
            if (d) {
                try {
                    res = json::parse(d);
                } catch (...) {
                    res = nullptr;
                }
            }
        }
        sqlite3_finalize(stmt);
        return res;
    }

    bool saveMasteryProfile(int64_t profileId, const json& data) {
        std::lock_guard<std::mutex> lock(dbMutex_);
        if (!db_) return false;

        int64_t nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();

        std::string jsonStr = data.dump();

        sqlite3_stmt* stmt = nullptr;
        const char* sql = "INSERT INTO mastery_profiles (profile_id, data, updated_at) VALUES (?, ?, ?) "
                          "ON CONFLICT(profile_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at;";
        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;

        sqlite3_bind_int64(stmt, 1, profileId);
        sqlite3_bind_text(stmt, 2, jsonStr.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_int64(stmt, 3, nowMs);

        int rc = sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        return rc == SQLITE_DONE;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test Recording & Storage
    // ─────────────────────────────────────────────────────────────────────────

    struct SaveTestRecord {
        int64_t profileId;
        int64_t startedAt;
        int tzOffsetMin;
        std::string mode;
        json config;
        int64_t durationMs;
        double netWpm;
        double rawWpm;
        double accuracy;
        double consistency;
        int correctChars;
        int incorrectChars;
        int extraChars;
        int uncorrectedErrors;
        int correctedErrors;
        int totalKeystrokes;
        json perSecondWpm;
        std::string appVersion;

        // Breakdown items
        struct KeyStat {
            std::string key;
            int attempts;
            int errors;
            int flightMsSum;
            int flightN;
        };
        std::vector<KeyStat> keyStats;

        struct Confusion {
            std::string expected;
            std::string typed;
            int count;
        };
        std::vector<Confusion> confusions;

        struct WordError {
            std::string word;
            int count;
        };
        std::vector<WordError> wordErrors;
    };

    int64_t insertTest(const SaveTestRecord& rec) {
        std::lock_guard<std::mutex> lock(dbMutex_);
        if (!db_) return -1;

        executeSqlInternal("BEGIN TRANSACTION;");

        sqlite3_stmt* stmt = nullptr;
        const char* sql =
            "INSERT INTO tests (profile_id, started_at, tz_offset_min, mode, config, "
            "duration_ms, net_wpm, raw_wpm, accuracy, consistency, correct_chars, "
            "incorrect_chars, extra_chars, uncorrected_errors, corrected_errors, "
            "total_keystrokes, per_second_wpm, app_version) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";

        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) {
            executeSqlInternal("ROLLBACK;");
            return -1;
        }

        std::string cfgStr = rec.config.dump();
        std::string perSecStr = rec.perSecondWpm.dump();

        sqlite3_bind_int64(stmt, 1, rec.profileId);
        sqlite3_bind_int64(stmt, 2, rec.startedAt);
        sqlite3_bind_int(stmt, 3, rec.tzOffsetMin);
        sqlite3_bind_text(stmt, 4, rec.mode.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 5, cfgStr.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_int64(stmt, 6, rec.durationMs);
        sqlite3_bind_double(stmt, 7, rec.netWpm);
        sqlite3_bind_double(stmt, 8, rec.rawWpm);
        sqlite3_bind_double(stmt, 9, rec.accuracy);
        sqlite3_bind_double(stmt, 10, rec.consistency);
        sqlite3_bind_int(stmt, 11, rec.correctChars);
        sqlite3_bind_int(stmt, 12, rec.incorrectChars);
        sqlite3_bind_int(stmt, 13, rec.extraChars);
        sqlite3_bind_int(stmt, 14, rec.uncorrectedErrors);
        sqlite3_bind_int(stmt, 15, rec.correctedErrors);
        sqlite3_bind_int(stmt, 16, rec.totalKeystrokes);
        sqlite3_bind_text(stmt, 17, perSecStr.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 18, rec.appVersion.c_str(), -1, SQLITE_TRANSIENT);

        if (sqlite3_step(stmt) != SQLITE_DONE) {
            sqlite3_finalize(stmt);
            executeSqlInternal("ROLLBACK;");
            return -1;
        }
        sqlite3_finalize(stmt);

        int64_t testId = sqlite3_last_insert_rowid(db_);

        // Insert key stats
        if (!rec.keyStats.empty()) {
            sqlite3_stmt* kStmt = nullptr;
            const char* kSql = "INSERT INTO test_key_stats (test_id, key, attempts, errors, flight_ms_sum, flight_n) VALUES (?, ?, ?, ?, ?, ?);";
            if (sqlite3_prepare_v2(db_, kSql, -1, &kStmt, nullptr) == SQLITE_OK) {
                for (const auto& ks : rec.keyStats) {
                    sqlite3_bind_int64(kStmt, 1, testId);
                    sqlite3_bind_text(kStmt, 2, ks.key.c_str(), -1, SQLITE_TRANSIENT);
                    sqlite3_bind_int(kStmt, 3, ks.attempts);
                    sqlite3_bind_int(kStmt, 4, ks.errors);
                    sqlite3_bind_int(kStmt, 5, ks.flightMsSum);
                    sqlite3_bind_int(kStmt, 6, ks.flightN);
                    sqlite3_step(kStmt);
                    sqlite3_reset(kStmt);
                }
                sqlite3_finalize(kStmt);
            }
        }

        // Insert confusions
        if (!rec.confusions.empty()) {
            sqlite3_stmt* cStmt = nullptr;
            const char* cSql = "INSERT INTO test_confusions (test_id, expected, typed, count) VALUES (?, ?, ?, ?);";
            if (sqlite3_prepare_v2(db_, cSql, -1, &cStmt, nullptr) == SQLITE_OK) {
                for (const auto& cf : rec.confusions) {
                    sqlite3_bind_int64(cStmt, 1, testId);
                    sqlite3_bind_text(cStmt, 2, cf.expected.c_str(), -1, SQLITE_TRANSIENT);
                    sqlite3_bind_text(cStmt, 3, cf.typed.c_str(), -1, SQLITE_TRANSIENT);
                    sqlite3_bind_int(cStmt, 4, cf.count);
                    sqlite3_step(cStmt);
                    sqlite3_reset(cStmt);
                }
                sqlite3_finalize(cStmt);
            }
        }

        // Insert word errors
        if (!rec.wordErrors.empty()) {
            sqlite3_stmt* wStmt = nullptr;
            const char* wSql = "INSERT INTO test_word_errors (test_id, word, count) VALUES (?, ?, ?);";
            if (sqlite3_prepare_v2(db_, wSql, -1, &wStmt, nullptr) == SQLITE_OK) {
                for (const auto& we : rec.wordErrors) {
                    sqlite3_bind_int64(wStmt, 1, testId);
                    sqlite3_bind_text(wStmt, 2, we.word.c_str(), -1, SQLITE_TRANSIENT);
                    sqlite3_bind_int(wStmt, 3, we.count);
                    sqlite3_step(wStmt);
                    sqlite3_reset(wStmt);
                }
                sqlite3_finalize(wStmt);
            }
        }

        executeSqlInternal("COMMIT;");
        return testId;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Account Analytics & Aggregates
    // ─────────────────────────────────────────────────────────────────────────

    json getAnalytics(int64_t profileId,
                      int64_t fromEpochMs = 0,
                      int64_t toEpochMs = 0,
                      const std::string& modeFilter = "",
                      const std::string& durationFilter = "") {
        std::lock_guard<std::mutex> lock(dbMutex_);
        json res = {
            {"overview", json::object()},
            {"testsHistory", json::array()},
            {"wpmDistribution", json::array()},
            {"keyHeatmap", json::object()},
            {"mostMistypedKeys", json::array()},
            {"mostMistypedWords", json::array()},
            {"letterConfusions", json::array()},
            {"fingerStats", json::object()},
            {"handStats", json::object()},
            {"activityHeatmap", json::object()}
        };

        if (!db_) return res;

        // Build dynamic WHERE clause
        std::string where = "WHERE profile_id = ?";
        std::vector<std::string> params;
        params.push_back(std::to_string(profileId));

        if (fromEpochMs > 0) {
            where += " AND started_at >= ?";
            params.push_back(std::to_string(fromEpochMs));
        }
        if (toEpochMs > 0) {
            where += " AND started_at <= ?";
            params.push_back(std::to_string(toEpochMs));
        }
        if (!modeFilter.empty() && modeFilter != "all") {
            where += " AND mode = ?";
            params.push_back(modeFilter);
        }
        if (!durationFilter.empty() && durationFilter != "all") {
            // Check config JSON field for time option
            where += " AND json_extract(config, '$.timeOption') = ?";
            params.push_back(durationFilter);
        }

        // 1. Overview aggregates (PB, total tests, total duration, pooled accuracy)
        std::string overviewSql =
            "SELECT COUNT(*), "
            "COALESCE(MAX(net_wpm), 0), "
            "COALESCE(SUM(duration_ms), 0), "
            "COALESCE(SUM(correct_chars), 0), "
            "COALESCE(SUM(total_keystrokes), 0), "
            "COALESCE(SUM(uncorrected_errors), 0), "
            "COALESCE(SUM(corrected_errors), 0) "
            "FROM tests " + where + ";";

        sqlite3_stmt* oStmt = nullptr;
        if (sqlite3_prepare_v2(db_, overviewSql.c_str(), -1, &oStmt, nullptr) == SQLITE_OK) {
            for (size_t i = 0; i < params.size(); ++i) {
                sqlite3_bind_text(oStmt, static_cast<int>(i + 1), params[i].c_str(), -1, SQLITE_TRANSIENT);
            }
            if (sqlite3_step(oStmt) == SQLITE_ROW) {
                int totalTests = sqlite3_column_int(oStmt, 0);
                double pbWpm = sqlite3_column_double(oStmt, 1);
                int64_t totalDurationMs = sqlite3_column_int64(oStmt, 2);
                int64_t sumCorrect = sqlite3_column_int64(oStmt, 3);
                int64_t sumTotalKs = sqlite3_column_int64(oStmt, 4);
                int64_t sumUncorrected = sqlite3_column_int64(oStmt, 5);
                int64_t sumCorrected = sqlite3_column_int64(oStmt, 6);

                // Pooled accuracy: 1.0 - (uncorrected + 0.5 * corrected) / total_keystrokes
                double pooledAcc = 100.0;
                if (sumTotalKs > 0) {
                    double penalty = sumUncorrected + 0.5 * sumCorrected;
                    pooledAcc = std::clamp((1.0 - (penalty / sumTotalKs)) * 100.0, 0.0, 100.0);
                }

                res["overview"]["totalTests"] = totalTests;
                res["overview"]["personalBestWpm"] = std::round(pbWpm * 10.0) / 10.0;
                res["overview"]["totalDurationSeconds"] = totalDurationMs / 1000;
                res["overview"]["pooledAccuracy"] = std::round(pooledAcc * 10.0) / 10.0;
            }
            sqlite3_finalize(oStmt);
        }

        // PB Date
        std::string pbDateSql = "SELECT started_at FROM tests " + where + " ORDER BY net_wpm DESC, started_at ASC LIMIT 1;";
        sqlite3_stmt* pbStmt = nullptr;
        if (sqlite3_prepare_v2(db_, pbDateSql.c_str(), -1, &pbStmt, nullptr) == SQLITE_OK) {
            for (size_t i = 0; i < params.size(); ++i) {
                sqlite3_bind_text(pbStmt, static_cast<int>(i + 1), params[i].c_str(), -1, SQLITE_TRANSIENT);
            }
            if (sqlite3_step(pbStmt) == SQLITE_ROW) {
                res["overview"]["personalBestDate"] = sqlite3_column_int64(pbStmt, 0);
            }
            sqlite3_finalize(pbStmt);
        }

        // Average of last 10 tests
        std::string last10Sql = "SELECT net_wpm, accuracy FROM (SELECT net_wpm, accuracy FROM tests " + where + " ORDER BY started_at DESC LIMIT 10);";
        sqlite3_stmt* lStmt = nullptr;
        if (sqlite3_prepare_v2(db_, last10Sql.c_str(), -1, &lStmt, nullptr) == SQLITE_OK) {
            for (size_t i = 0; i < params.size(); ++i) {
                sqlite3_bind_text(lStmt, static_cast<int>(i + 1), params[i].c_str(), -1, SQLITE_TRANSIENT);
            }
            double sumWpm = 0.0;
            double sumAcc = 0.0;
            int count = 0;
            while (sqlite3_step(lStmt) == SQLITE_ROW) {
                sumWpm += sqlite3_column_double(lStmt, 0);
                sumAcc += sqlite3_column_double(lStmt, 1);
                count++;
            }
            res["overview"]["last10AvgWpm"] = count > 0 ? (std::round((sumWpm / count) * 10.0) / 10.0) : 0.0;
            res["overview"]["avgLast10NetWpm"] = res["overview"]["last10AvgWpm"];
            res["overview"]["last10AvgAcc"] = count > 0 ? (std::round((sumAcc / count) * 10.0) / 10.0) : 0.0;
        }
        res["overview"]["overallAccuracy"] = res["overview"]["pooledAccuracy"];
        if (res["overview"].contains("personalBestDate")) {
            res["overview"]["personalBestStartedAt"] = res["overview"]["personalBestDate"];
        }

        // 2. Tests history (for net WPM and accuracy over time charts)
        std::string historySql =
            "SELECT id, started_at, tz_offset_min, mode, net_wpm, raw_wpm, accuracy, consistency, duration_ms, uncorrected_errors, corrected_errors, config "
            "FROM tests " + where + " ORDER BY started_at ASC;";
        sqlite3_stmt* hStmt = nullptr;
        std::vector<std::pair<double, double>> trendPoints; // (dayIndex, wpm)
        if (sqlite3_prepare_v2(db_, historySql.c_str(), -1, &hStmt, nullptr) == SQLITE_OK) {
            for (size_t i = 0; i < params.size(); ++i) {
                sqlite3_bind_text(hStmt, static_cast<int>(i + 1), params[i].c_str(), -1, SQLITE_TRANSIENT);
            }
            int64_t firstTime = 0;
            while (sqlite3_step(hStmt) == SQLITE_ROW) {
                int64_t tid = sqlite3_column_int64(hStmt, 0);
                int64_t sAt = sqlite3_column_int64(hStmt, 1);
                int tzOff = sqlite3_column_int(hStmt, 2);
                const char* m = reinterpret_cast<const char*>(sqlite3_column_text(hStmt, 3));
                double nWpm = sqlite3_column_double(hStmt, 4);
                double rWpm = sqlite3_column_double(hStmt, 5);
                double acc = sqlite3_column_double(hStmt, 6);
                double cons = sqlite3_column_double(hStmt, 7);
                int64_t dur = sqlite3_column_int64(hStmt, 8);
                int uncorr = sqlite3_column_int(hStmt, 9);
                int corr = sqlite3_column_int(hStmt, 10);
                const char* cfg = reinterpret_cast<const char*>(sqlite3_column_text(hStmt, 11));

                if (firstTime == 0) firstTime = sAt;
                double day = (sAt - firstTime) / (86400000.0);
                trendPoints.emplace_back(day, nWpm);

                res["testsHistory"].push_back({
                    {"id", tid},
                    {"startedAt", sAt},
                    {"tzOffsetMin", tzOff},
                    {"mode", m ? m : ""},
                    {"netWpm", nWpm},
                    {"rawWpm", rWpm},
                    {"accuracy", acc},
                    {"consistency", cons},
                    {"durationSeconds", dur / 1000.0},
                    {"uncorrectedErrors", uncorr},
                    {"correctedErrors", corr},
                    {"config", cfg ? json::parse(cfg, nullptr, false) : json::object()}
                });
            }
            sqlite3_finalize(hStmt);
        }

        // Trend indicator (Linear regression slope: WPM change per week)
        if (trendPoints.size() >= 5) {
            double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
            size_t n = trendPoints.size();
            for (const auto& p : trendPoints) {
                sumX += p.first;
                sumY += p.second;
                sumXY += p.first * p.second;
                sumX2 += p.first * p.first;
            }
            double denom = (n * sumX2 - sumX * sumX);
            if (std::abs(denom) > 1e-6) {
                double slopePerDay = (n * sumXY - sumX * sumY) / denom;
                double slopePerWeek = slopePerDay * 7.0;
                res["overview"]["wpmTrendPerWeek"] = std::round(slopePerWeek * 10.0) / 10.0;
            }
        }

        // 3. WPM Distribution Histogram (Buckets of 10 WPM: 0-10, 10-20, ..., 200+)
        std::map<int, int> wpmBuckets;
        for (const auto& item : res["testsHistory"]) {
            double w = item["netWpm"].get<double>();
            int bucket = static_cast<int>(std::floor(w / 10.0) * 10);
            wpmBuckets[bucket]++;
        }
        for (const auto& kv : wpmBuckets) {
            res["wpmDistribution"].push_back({
                {"bucket", kv.first},
                {"count", kv.second}
            });
        }

        // 4. Streak calculation & Activity heatmap (using test tz_offset_min)
        std::map<std::string, int> dailyCounts;
        std::set<std::string> uniqueDays;
        for (const auto& item : res["testsHistory"]) {
            int64_t epochMs = item["startedAt"].get<int64_t>();
            int tzOff = item["tzOffsetMin"].get<int>();

            // Adjust UTC epoch ms by client's local tz_offset (tzOff is minutes)
            int64_t localMs = epochMs - (static_cast<int64_t>(tzOff) * 60000);
            time_t tSec = localMs / 1000;
            struct tm t;
            gmtime_r(&tSec, &t);

            char buf[32];
            snprintf(buf, sizeof(buf), "%04d-%02d-%02d", t.tm_year + 1900, t.tm_mon + 1, t.tm_mday);
            std::string dateKey(buf);
            dailyCounts[dateKey]++;
            uniqueDays.insert(dateKey);
        }

        for (const auto& kv : dailyCounts) {
            res["activityHeatmap"][kv.first] = kv.second;
        }

        // Compute current and longest streak
        int currentStreak = 0;
        int longestStreak = 0;
        if (!uniqueDays.empty()) {
            std::vector<std::string> sortedDays(uniqueDays.begin(), uniqueDays.end());
            int streak = 1;
            longestStreak = 1;

            auto parseDateDays = [](const std::string& d) -> int64_t {
                int y = 0, m = 0, day = 0;
                sscanf(d.c_str(), "%d-%d-%d", &y, &m, &day);
                struct tm tm{};
                tm.tm_year = y - 1900;
                tm.tm_mon = m - 1;
                tm.tm_mday = day;
                return timegm(&tm) / 86400;
            };

            for (size_t i = 1; i < sortedDays.size(); ++i) {
                int64_t prev = parseDateDays(sortedDays[i - 1]);
                int64_t curr = parseDateDays(sortedDays[i]);
                if (curr == prev + 1) {
                    streak++;
                } else if (curr > prev + 1) {
                    streak = 1;
                }
                if (streak > longestStreak) longestStreak = streak;
            }

            // Current streak: check if latest test is today or yesterday
            auto nowSec = time(nullptr);
            int64_t todayDays = nowSec / 86400;
            int64_t lastTestDay = parseDateDays(sortedDays.back());
            if (todayDays == lastTestDay || todayDays == lastTestDay + 1) {
                currentStreak = streak;
            } else {
                currentStreak = 0;
            }
        }
        res["overview"]["currentStreak"] = currentStreak;
        res["overview"]["longestStreak"] = longestStreak;

        // 5. Per-key stats & keyboard HUD error rate heatmap
        std::string keyStatsSql =
            "SELECT ks.key, SUM(ks.attempts), SUM(ks.errors), SUM(ks.flight_ms_sum), SUM(ks.flight_n) "
            "FROM test_key_stats ks JOIN tests t ON ks.test_id = t.id " + where + " GROUP BY ks.key;";

        sqlite3_stmt* kStmt = nullptr;
        std::vector<json> keyRankingList;
        if (sqlite3_prepare_v2(db_, keyStatsSql.c_str(), -1, &kStmt, nullptr) == SQLITE_OK) {
            for (size_t i = 0; i < params.size(); ++i) {
                sqlite3_bind_text(kStmt, static_cast<int>(i + 1), params[i].c_str(), -1, SQLITE_TRANSIENT);
            }
            while (sqlite3_step(kStmt) == SQLITE_ROW) {
                const char* k = reinterpret_cast<const char*>(sqlite3_column_text(kStmt, 0));
                int64_t att = sqlite3_column_int64(kStmt, 1);
                int64_t err = sqlite3_column_int64(kStmt, 2);
                int64_t fSum = sqlite3_column_int64(kStmt, 3);
                int64_t fN = sqlite3_column_int64(kStmt, 4);

                if (!k) continue;
                std::string keyStr(k);

                double errRate = att > 0 ? (static_cast<double>(err) / att) * 100.0 : 0.0;
                double avgFlight = fN > 0 ? (static_cast<double>(fSum) / fN) : 0.0;

                res["keyHeatmap"][keyStr] = {
                    {"attempts", att},
                    {"errors", err},
                    {"errorRate", std::round(errRate * 10.0) / 10.0},
                    {"avgFlightMs", std::round(avgFlight * 10.0) / 10.0}
                };

                keyRankingList.push_back({
                    {"key", keyStr},
                    {"attempts", att},
                    {"errors", err},
                    {"errorRate", std::round(errRate * 10.0) / 10.0},
                    {"avgFlightMs", std::round(avgFlight * 10.0) / 10.0}
                });
            }
            sqlite3_finalize(kStmt);
        }

        // Sort most-mistyped keys by error count and error rate
        std::sort(keyRankingList.begin(), keyRankingList.end(), [](const json& a, const json& b) {
            if (a["errors"] != b["errors"]) return a["errors"] > b["errors"];
            return a["errorRate"] > b["errorRate"];
        });
        res["mostMistypedKeys"] = keyRankingList;

        // 6. Top Letter Confusions (expected -> typed)
        std::string confSql =
            "SELECT c.expected, c.typed, SUM(c.count) as total_count "
            "FROM test_confusions c JOIN tests t ON c.test_id = t.id " + where +
            " GROUP BY c.expected, c.typed ORDER BY total_count DESC LIMIT 20;";

        sqlite3_stmt* cStmt = nullptr;
        if (sqlite3_prepare_v2(db_, confSql.c_str(), -1, &cStmt, nullptr) == SQLITE_OK) {
            for (size_t i = 0; i < params.size(); ++i) {
                sqlite3_bind_text(cStmt, static_cast<int>(i + 1), params[i].c_str(), -1, SQLITE_TRANSIENT);
            }
            while (sqlite3_step(cStmt) == SQLITE_ROW) {
                const char* exp = reinterpret_cast<const char*>(sqlite3_column_text(cStmt, 0));
                const char* typ = reinterpret_cast<const char*>(sqlite3_column_text(cStmt, 1));
                int cnt = sqlite3_column_int(cStmt, 2);

                res["letterConfusions"].push_back({
                    {"expected", exp ? exp : ""},
                    {"typed", typ ? typ : ""},
                    {"count", cnt}
                });
            }
            sqlite3_finalize(cStmt);
        }

        // 7. Most Mistyped Words
        std::string wordSql =
            "SELECT w.word, SUM(w.count) as total_count "
            "FROM test_word_errors w JOIN tests t ON w.test_id = t.id " + where +
            " GROUP BY w.word ORDER BY total_count DESC LIMIT 25;";

        sqlite3_stmt* wStmt = nullptr;
        if (sqlite3_prepare_v2(db_, wordSql.c_str(), -1, &wStmt, nullptr) == SQLITE_OK) {
            for (size_t i = 0; i < params.size(); ++i) {
                sqlite3_bind_text(wStmt, static_cast<int>(i + 1), params[i].c_str(), -1, SQLITE_TRANSIENT);
            }
            while (sqlite3_step(wStmt) == SQLITE_ROW) {
                const char* w = reinterpret_cast<const char*>(sqlite3_column_text(wStmt, 0));
                int cnt = sqlite3_column_int(wStmt, 1);

                res["mostMistypedWords"].push_back({
                    {"word", w ? w : ""},
                    {"count", cnt}
                });
            }
            sqlite3_finalize(wStmt);
        }

        // 8. Finger and Hand Stats (Biomechanic Mapping)
        res["fingerStats"] = computeFingerAndHandStats(res["keyHeatmap"]);

        // Top-level aliases for frontend and test harness compatibility
        res["streak"] = {
            {"currentStreak", currentStreak},
            {"longestStreak", longestStreak}
        };
        res["keyStats"] = res["mostMistypedKeys"];
        res["confusions"] = res["topConfusions"];
        res["wordErrors"] = res["mostMistypedWords"];
        res["recentTests"] = res["testsHistory"];
        res["histogram"] = res["wpmDistribution"];

        res["dailyActivity"] = json::array();
        for (const auto& kv : dailyCounts) {
            res["dailyActivity"].push_back({
                {"day", kv.first},
                {"count", kv.second},
                {"avgWpm", 0.0},
                {"avgAccuracy", 100.0}
            });
        }

        return res;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Single Test Details
    // ─────────────────────────────────────────────────────────────────────────

    json getTestDetails(int64_t testId) {
        std::lock_guard<std::mutex> lock(dbMutex_);
        if (!db_) return nullptr;

        sqlite3_stmt* stmt = nullptr;
        const char* sql =
            "SELECT id, profile_id, started_at, tz_offset_min, mode, config, duration_ms, "
            "net_wpm, raw_wpm, accuracy, consistency, correct_chars, incorrect_chars, "
            "extra_chars, uncorrected_errors, corrected_errors, total_keystrokes, "
            "per_second_wpm, app_version FROM tests WHERE id = ?;";

        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return nullptr;
        sqlite3_bind_int64(stmt, 1, testId);

        json res = nullptr;
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            const char* cfg = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 5));
            const char* ps = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 17));
            const char* v = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 18));

            res = {
                {"id", sqlite3_column_int64(stmt, 0)},
                {"profileId", sqlite3_column_int64(stmt, 1)},
                {"startedAt", sqlite3_column_int64(stmt, 2)},
                {"tzOffsetMin", sqlite3_column_int(stmt, 3)},
                {"mode", reinterpret_cast<const char*>(sqlite3_column_text(stmt, 4))},
                {"config", cfg ? json::parse(cfg, nullptr, false) : json::object()},
                {"durationMs", sqlite3_column_int64(stmt, 6)},
                {"netWpm", sqlite3_column_double(stmt, 7)},
                {"rawWpm", sqlite3_column_double(stmt, 8)},
                {"accuracy", sqlite3_column_double(stmt, 9)},
                {"consistency", sqlite3_column_double(stmt, 10)},
                {"correctChars", sqlite3_column_int(stmt, 11)},
                {"incorrectChars", sqlite3_column_int(stmt, 12)},
                {"extraChars", sqlite3_column_int(stmt, 13)},
                {"uncorrectedErrors", sqlite3_column_int(stmt, 14)},
                {"correctedErrors", sqlite3_column_int(stmt, 15)},
                {"totalKeystrokes", sqlite3_column_int(stmt, 16)},
                {"perSecondWpm", ps ? json::parse(ps, nullptr, false) : json::array()},
                {"appVersion", v ? v : "1.0.0"}
            };
        }
        sqlite3_finalize(stmt);
        return res;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Danger Zone: Delete all data for profile or entire database
    // ─────────────────────────────────────────────────────────────────────────

    bool deleteAllDataForProfile(int64_t profileId) {
        std::lock_guard<std::mutex> lock(dbMutex_);
        if (!db_) return false;

        sqlite3_stmt* stmt = nullptr;
        const char* sql = "DELETE FROM tests WHERE profile_id = ?;";
        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;
        sqlite3_bind_int64(stmt, 1, profileId);
        int rc = sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        return rc == SQLITE_DONE;
    }

private:
    void initDatabase() {
        std::lock_guard<std::mutex> lock(dbMutex_);
        initDatabaseInternal();
    }

    void initDatabaseInternal() {
        if (db_) return;

        try {
            std::filesystem::path p(dbPath_);
            std::filesystem::create_directories(p.parent_path());
        } catch (...) {}

        int rc = sqlite3_open(dbPath_.c_str(), &db_);
        if (rc != SQLITE_OK) {
            std::cerr << "[ERROR] Cannot open SQLite database " << dbPath_ << ": "
                      << sqlite3_errmsg(db_) << std::endl;
            if (db_) {
                sqlite3_close(db_);
                db_ = nullptr;
            }
            return;
        }

        // Configure required Pragmas
        executeSqlInternal("PRAGMA journal_mode = WAL;");
        executeSqlInternal("PRAGMA foreign_keys = ON;");
        executeSqlInternal("PRAGMA busy_timeout = 5000;");
        executeSqlInternal("PRAGMA synchronous = NORMAL;");

        // Run migrations
        runMigrationsInternal();
    }

    void closeDatabase() {
        std::lock_guard<std::mutex> lock(dbMutex_);
        closeDatabaseInternal();
    }

    void closeDatabaseInternal() {
        if (db_) {
            sqlite3_close(db_);
            db_ = nullptr;
        }
    }

    void runMigrationsInternal() {
        if (!db_) return;

        int currentVersion = 0;
        sqlite3_stmt* stmt = nullptr;
        if (sqlite3_prepare_v2(db_, "PRAGMA user_version;", -1, &stmt, nullptr) == SQLITE_OK) {
            if (sqlite3_step(stmt) == SQLITE_ROW) {
                currentVersion = sqlite3_column_int(stmt, 0);
            }
            sqlite3_finalize(stmt);
        }

        // Migration 1: Base Tables
        if (currentVersion < 1) {
            std::cout << "[INFO] Running TypeX DB Migration 1: Initial schema..." << std::endl;
            executeSqlInternal("BEGIN TRANSACTION;");

            const char* v1Schema =
                "CREATE TABLE IF NOT EXISTS profiles ("
                "  id INTEGER PRIMARY KEY, "
                "  name TEXT NOT NULL COLLATE NOCASE UNIQUE, "
                "  color TEXT, "
                "  created_at INTEGER NOT NULL, "
                "  last_used_at INTEGER, "
                "  archived INTEGER NOT NULL DEFAULT 0"
                ");"
                "CREATE TABLE IF NOT EXISTS tests ("
                "  id INTEGER PRIMARY KEY, "
                "  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, "
                "  started_at INTEGER NOT NULL, "
                "  tz_offset_min INTEGER NOT NULL, "
                "  mode TEXT NOT NULL, "
                "  config TEXT NOT NULL, "
                "  duration_ms INTEGER NOT NULL, "
                "  net_wpm REAL NOT NULL, "
                "  raw_wpm REAL NOT NULL, "
                "  accuracy REAL NOT NULL, "
                "  consistency REAL, "
                "  correct_chars INTEGER, "
                "  incorrect_chars INTEGER, "
                "  extra_chars INTEGER, "
                "  uncorrected_errors INTEGER, "
                "  corrected_errors INTEGER, "
                "  total_keystrokes INTEGER, "
                "  per_second_wpm TEXT, "
                "  app_version TEXT"
                ");"
                "CREATE TABLE IF NOT EXISTS test_key_stats ("
                "  test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE, "
                "  key TEXT, "
                "  attempts INTEGER, "
                "  errors INTEGER, "
                "  flight_ms_sum INTEGER, "
                "  flight_n INTEGER, "
                "  PRIMARY KEY (test_id, key)"
                ");"
                "CREATE TABLE IF NOT EXISTS test_confusions ("
                "  test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE, "
                "  expected TEXT, "
                "  typed TEXT, "
                "  count INTEGER, "
                "  PRIMARY KEY (test_id, expected, typed)"
                ");"
                "CREATE TABLE IF NOT EXISTS test_word_errors ("
                "  test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE, "
                "  word TEXT, "
                "  count INTEGER, "
                "  PRIMARY KEY (test_id, word)"
                ");"
                "CREATE TABLE IF NOT EXISTS mastery_profiles ("
                "  profile_id INTEGER PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE, "
                "  data TEXT NOT NULL, "
                "  updated_at INTEGER NOT NULL"
                ");"
                "CREATE TABLE IF NOT EXISTS settings ("
                "  key TEXT PRIMARY KEY, "
                "  value TEXT"
                ");"
                "CREATE INDEX IF NOT EXISTS idx_tests_profile_time ON tests(profile_id, started_at);"
                "CREATE INDEX IF NOT EXISTS idx_tests_profile_mode_time ON tests(profile_id, mode, started_at);";

            executeSqlInternal(v1Schema);
            executeSqlInternal("PRAGMA user_version = 1;");
            executeSqlInternal("COMMIT;");
        }
    }

    bool executeSqlInternal(const std::string& sql) {
        if (!db_) return false;
        char* errMsg = nullptr;
        int rc = sqlite3_exec(db_, sql.c_str(), nullptr, nullptr, &errMsg);
        if (rc != SQLITE_OK) {
            std::cerr << "[ERROR] SQL execution failed: " << (errMsg ? errMsg : "unknown")
                      << "\nSQL: " << sql << std::endl;
            sqlite3_free(errMsg);
            return false;
        }
        return true;
    }

    std::string getSettingInternal(const std::string& key, const std::string& defaultVal = "") {
        if (!db_) return defaultVal;
        sqlite3_stmt* stmt = nullptr;
        const char* sql = "SELECT value FROM settings WHERE key = ?;";
        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return defaultVal;

        sqlite3_bind_text(stmt, 1, key.c_str(), -1, SQLITE_TRANSIENT);
        std::string res = defaultVal;
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            const char* v = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
            if (v) res = v;
        }
        sqlite3_finalize(stmt);
        return res;
    }

    void setSettingInternal(const std::string& key, const std::string& val) {
        if (!db_) return;
        sqlite3_stmt* stmt = nullptr;
        const char* sql = "INSERT INTO settings (key, value) VALUES (?, ?) "
                          "ON CONFLICT(key) DO UPDATE SET value = excluded.value;";
        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_text(stmt, 1, key.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 2, val.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
        }
    }

    static std::string trimString(const std::string& s) {
        size_t start = s.find_first_not_of(" \t\r\n");
        if (start == std::string::npos) return "";
        size_t end = s.find_last_not_of(" \t\r\n");
        return s.substr(start, end - start + 1);
    }

    static json computeFingerAndHandStats(const json& keyHeatmap) {
        // Biomechanical map
        // L_PINKY:  q, a, z, 1, `, Tab, Caps
        // L_RING:   w, s, x, 2
        // L_MIDDLE: e, d, c, 3
        // L_INDEX:  r, f, v, t, g, b, 4, 5
        // R_INDEX:  y, h, n, u, j, m, 6, 7
        // R_MIDDLE: i, k, ,, 8
        // R_RING:   o, l, ., 9
        // R_PINKY:  p, ;, /, -, =, [, ], ', 0
        static const std::unordered_map<char, std::string> keyToFinger = {
            {'q', "L_PINKY"}, {'a', "L_PINKY"}, {'z', "L_PINKY"}, {'1', "L_PINKY"},
            {'w', "L_RING"},  {'s', "L_RING"},  {'x', "L_RING"},  {'2', "L_RING"},
            {'e', "L_MIDDLE"},{'d', "L_MIDDLE"},{'c', "L_MIDDLE"},{'3', "L_MIDDLE"},
            {'r', "L_INDEX"}, {'f', "L_INDEX"}, {'v', "L_INDEX"}, {'t', "L_INDEX"},
            {'g', "L_INDEX"}, {'b', "L_INDEX"}, {'4', "L_INDEX"}, {'5', "L_INDEX"},
            {'y', "R_INDEX"}, {'h', "R_INDEX"}, {'n', "R_INDEX"}, {'u', "R_INDEX"},
            {'j', "R_INDEX"}, {'m', "R_INDEX"}, {'6', "R_INDEX"}, {'7', "R_INDEX"},
            {'i', "R_MIDDLE"},{'k', "R_MIDDLE"},{',', "R_MIDDLE"},{'8', "R_MIDDLE"},
            {'o', "R_RING"},  {'l', "R_RING"},  {'.', "R_RING"},  {'9', "R_RING"},
            {'p', "R_PINKY"}, {';', "R_PINKY"}, {'/', "R_PINKY"}, {'0', "R_PINKY"},
            {'-', "R_PINKY"}, {'=', "R_PINKY"}, {'\'', "R_PINKY"}
        };

        std::unordered_map<std::string, std::pair<int64_t, int64_t>> fingerAgg; // finger -> (errors, attempts)
        fingerAgg["L_PINKY"] = {0, 0};
        fingerAgg["L_RING"] = {0, 0};
        fingerAgg["L_MIDDLE"] = {0, 0};
        fingerAgg["L_INDEX"] = {0, 0};
        fingerAgg["R_INDEX"] = {0, 0};
        fingerAgg["R_MIDDLE"] = {0, 0};
        fingerAgg["R_RING"] = {0, 0};
        fingerAgg["R_PINKY"] = {0, 0};

        if (keyHeatmap.is_object()) {
            for (auto it = keyHeatmap.begin(); it != keyHeatmap.end(); ++it) {
                std::string k = it.key();
                if (k.empty()) continue;
                char c = std::tolower(static_cast<unsigned char>(k[0]));
                auto fIt = keyToFinger.find(c);
                if (fIt != keyToFinger.end()) {
                    int64_t err = it.value().value("errors", 0);
                    int64_t att = it.value().value("attempts", 0);
                    fingerAgg[fIt->second].first += err;
                    fingerAgg[fIt->second].second += att;
                }
            }
        }

        json fingerStats = json::object();
        int64_t leftErr = 0, leftAtt = 0;
        int64_t rightErr = 0, rightAtt = 0;

        for (const auto& kv : fingerAgg) {
            double rate = kv.second.second > 0 ? (static_cast<double>(kv.second.first) / kv.second.second) * 100.0 : 0.0;
            fingerStats[kv.first] = {
                {"errors", kv.second.first},
                {"attempts", kv.second.second},
                {"errorRate", std::round(rate * 10.0) / 10.0}
            };
            if (kv.first[0] == 'L') {
                leftErr += kv.second.first;
                leftAtt += kv.second.second;
            } else {
                rightErr += kv.second.first;
                rightAtt += kv.second.second;
            }
        }

        json handStats = {
            {"LEFT", {
                {"errors", leftErr},
                {"attempts", leftAtt},
                {"errorRate", leftAtt > 0 ? (std::round(((static_cast<double>(leftErr) / leftAtt) * 100.0) * 10.0) / 10.0) : 0.0}
            }},
            {"RIGHT", {
                {"errors", rightErr},
                {"attempts", rightAtt},
                {"errorRate", rightAtt > 0 ? (std::round(((static_cast<double>(rightErr) / rightAtt) * 100.0) * 10.0) / 10.0) : 0.0}
            }}
        };

        return {
            {"fingers", fingerStats},
            {"hands", handStats}
        };
    }

    std::string dbPath_;
    sqlite3* db_;
    std::mutex dbMutex_;
};

} // namespace typex
