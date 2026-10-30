#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <deque>
#include <unordered_map>
#include <unordered_set>
#include <random>
#include <cmath>
#include <cctype>
#include <algorithm>
#include <numeric>
#include <sstream>
#include <mutex>
#include <filesystem>
#ifndef _WIN32
#include <ifaddrs.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
#else
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
#endif

#include "httplib.h"
#include "json.hpp"
#include "learning_engine.hpp"
#include "competition_engine.hpp"
#include "admin_pin_manager.hpp"

using json = nlohmann::json;

namespace {

// ---------------------------------------------------------------------------
// Tier specification: one dedicated file per tier, ordered by descending
// real-world usage frequency (that ordering is what makes rank-decay sampling
// meaningful).
// ---------------------------------------------------------------------------
struct TierSpec {
    const char* tier;
    const char* file;
    size_t legacyCap;   // slice size when falling back to words_10k.txt
    double exponent;    // rank-decay exponent for natural sampling
};

const std::vector<TierSpec>& tierSpecs() {
    static const std::vector<TierSpec> specs = {
        {"english_200", "english_200.txt",   200,  0.65},
        {"english_1k",  "english_1k.txt",   1000,  0.65},
        {"english_5k",  "english_5k.txt",   5000,  0.65},
        {"english_10k", "english_10k.txt", 10000,  0.65},
        {"english_25k", "english_25k.txt", 25000,  0.25},  // rare pool: flatter decay
    };
    return specs;
}

constexpr const char* kDefaultTier = "english_1k";
constexpr const char* kLearnTier = "english_10k";

// Trim, drop non-alphabetic tokens, lowercase. Words of length 1 are kept so
// that "a" and "i" survive ingestion (previously they were filtered out).
std::vector<std::string> ingestWordFile(const std::string& path) {
    std::vector<std::string> words;
    std::ifstream file(path);
    if (!file.is_open()) return words;

    std::string line;
    while (std::getline(file, line)) {
        size_t start = 0;
        size_t end = line.size();
        while (start < end && (line[start] == ' ' || line[start] == '\t')) ++start;
        while (end > start && (line[end - 1] == '\r' || line[end - 1] == '\n' ||
                               line[end - 1] == ' ' || line[end - 1] == '\t')) {
            --end;
        }
        if (start == end) continue;

        bool alphaOnly = true;
        for (size_t i = start; i < end; ++i) {
            if (!std::isalpha(static_cast<unsigned char>(line[i]))) {
                alphaOnly = false;
                break;
            }
        }
        if (!alphaOnly) continue;

        std::string word = line.substr(start, end - start);
        std::transform(word.begin(), word.end(), word.begin(), [](unsigned char c) {
            return static_cast<char>(std::tolower(c));
        });
        words.push_back(std::move(word));
    }
    return words;
}

struct TierList {
    std::string tier;
    std::vector<std::string> words;
    std::vector<double> weights;  // parallel to words, rank-decay
    std::string source;
};

// Resolve writable user data directory (honors TYPEX_DATA_DIR, XDG_DATA_HOME, or defaults to ~/.local/share/TypeX)
std::string resolveWritableDataDir() {
    const char* envDir = std::getenv("TYPEX_DATA_DIR");
    if (envDir && std::string(envDir).size() > 0) {
        return std::string(envDir);
    }
    const char* xdgData = std::getenv("XDG_DATA_HOME");
    if (xdgData && std::string(xdgData).size() > 0) {
        return std::string(xdgData) + "/TypeX";
    }
    const char* home = std::getenv("HOME");
    if (home && std::string(home).size() > 0) {
        return std::string(home) + "/.local/share/TypeX";
    }
    return "backend/data";
}

// Resolve read-only word lists directory
std::string resolveWordlistsDir(const std::string& explicitDir = "") {
    if (!explicitDir.empty() && std::filesystem::exists(explicitDir + "/english_1k.txt")) {
        return explicitDir;
    }
    const char* envWords = std::getenv("TYPEX_WORDLISTS_DIR");
    if (envWords && std::string(envWords).size() > 0 && std::filesystem::exists(std::string(envWords) + "/english_1k.txt")) {
        return std::string(envWords);
    }
    static const std::vector<std::string> candidates = {
        "/usr/share/typex/data",
        "backend/data",
        "data",
        "../backend/data"
    };
    for (const auto& dir : candidates) {
        if (std::filesystem::exists(dir + "/english_1k.txt") ||
            std::filesystem::exists(dir + "/words_10k.txt")) {
            return dir;
        }
    }
    return "backend/data";
}

// Resolve static web frontend directory (Next.js static export out)
std::string resolveStaticWebDir(const std::string& explicitDir = "") {
    if (!explicitDir.empty() && std::filesystem::exists(explicitDir + "/index.html")) {
        return explicitDir;
    }
    const char* envWeb = std::getenv("TYPEX_WEB_DIR");
    if (envWeb && std::string(envWeb).size() > 0 && std::filesystem::exists(std::string(envWeb) + "/index.html")) {
        return std::string(envWeb);
    }
    static const std::vector<std::string> candidates = {
        "/usr/share/typex/web",
        "frontend/out",
        "../frontend/out",
        "out",
        "web"
    };
    for (const auto& dir : candidates) {
        if (std::filesystem::exists(dir + "/index.html")) {
            return dir;
        }
    }
    return "";
}

// First run: if dev data file exists, offer to import it safely without overwriting existing data
void ensureDataMigration(const std::string& writableDir, const std::string& devSourceDir) {
    try {
        std::filesystem::create_directories(writableDir);
        std::filesystem::create_directories(writableDir + "/backups");

        if (devSourceDir.empty() || devSourceDir == writableDir) return;

        std::vector<std::string> filesToMigrate = {
            "mastery_profile.json",
            "competition_state.json",
            "admin_pin.json"
        };

        for (const auto& file : filesToMigrate) {
            std::string src = devSourceDir + "/" + file;
            std::string dst = writableDir + "/" + file;
            if (std::filesystem::exists(src) && !std::filesystem::exists(dst)) {
                std::cout << "[INFO] First-run data migration: importing " << file << " to " << writableDir << std::endl;
                std::filesystem::copy_file(src, dst, std::filesystem::copy_options::skip_existing);
            }
        }
    } catch (const std::exception& e) {
        std::cerr << "[WARN] Data migration check error: " << e.what() << std::endl;
    }
}

// Query all active IPv4 LAN addresses
std::vector<std::string> getLanIpAddresses() {
    std::vector<std::string> ips;
#ifndef _WIN32
    struct ifaddrs* ifaddr = nullptr;
    if (getifaddrs(&ifaddr) == -1) return ips;

    for (struct ifaddrs* ifa = ifaddr; ifa != nullptr; ifa = ifa->ifa_next) {
        if (!ifa->ifa_addr || ifa->ifa_addr->sa_family != AF_INET) continue;
        char host[NI_MAXHOST];
        int s = getnameinfo(ifa->ifa_addr, sizeof(struct sockaddr_in),
                            host, NI_MAXHOST, nullptr, 0, NI_NUMERICHOST);
        if (s == 0) {
            std::string ip(host);
            if (ip != "127.0.0.1" && ip.rfind("127.", 0) != 0) {
                if (std::find(ips.begin(), ips.end(), ip) == ips.end()) {
                    ips.push_back(ip);
                }
            }
        }
    }
    freeifaddrs(ifaddr);
#endif
    return ips;
}

}  // namespace

class WordCorpus {
public:
    explicit WordCorpus(const std::string& dataDir) {
        loadAll(dataDir);
    }

    // Load every tier from its own file. A missing file degrades gracefully to
    // slicing the legacy single-file corpus rather than failing the tier.
    bool loadAll(const std::string& dataDir) {
        std::vector<std::string> legacy = ingestWordFile(dataDir + "/words_10k.txt");
        if (legacy.empty()) legacy = ingestWordFile("words_10k.txt");

        tiers_.clear();
        for (const auto& spec : tierSpecs()) {
            TierList list;
            list.tier = spec.tier;

            std::string path = dataDir + "/" + spec.file;
            if (!std::filesystem::exists(path) && std::filesystem::exists(spec.file)) {
                path = spec.file;
            }

            if (std::filesystem::exists(path)) {
                list.words = ingestWordFile(path);
                list.source = path;
            }

            if (list.words.empty() && !legacy.empty()) {
                size_t take = std::min(spec.legacyCap, legacy.size());
                list.words.assign(legacy.begin(), legacy.begin() + static_cast<long>(take));
                list.source = "words_10k.txt (slice " + std::to_string(take) + ")";
            }

            if (list.words.empty()) {
                std::cerr << "[WARN] Tier " << spec.tier << " unavailable (no file, empty corpus)." << std::endl;
                continue;
            }

            list.weights.resize(list.words.size());
            for (size_t i = 0; i < list.words.size(); ++i) {
                list.weights[i] = 1.0 / std::pow(static_cast<double>(i + 1), spec.exponent);
            }

            std::cout << "[INFO] Tier " << list.tier << ": " << list.words.size()
                      << " words (decay " << spec.exponent << ") <- " << list.source << std::endl;
            tiers_.push_back(std::move(list));
        }

        return !tiers_.empty();
    }

    // Word count of the widest tier, kept for the health endpoints.
    size_t size() const {
        size_t largest = 0;
        for (const auto& t : tiers_) largest = std::max(largest, t.words.size());
        return largest;
    }

    bool hasTier(const std::string& tier) const {
        return findTier(tier) != nullptr;
    }

    // Echoed back to clients so they know which tier actually served them.
    std::string effectiveTier(const std::string& requested) const {
        const TierList* exact = findTierExact(requested);
        if (exact) return exact->tier;
        const TierList* fallback = findTier(kDefaultTier);
        if (fallback) return fallback->tier;
        return tiers_.empty() ? std::string(kDefaultTier) : tiers_.front().tier;
    }

    // Vocabulary pool for the adaptive learning engine.
    const std::vector<std::string>& learnPool() const {
        const TierList* preferred = findTier(kLearnTier);
        if (preferred) return preferred->words;
        size_t best = 0;
        for (size_t i = 1; i < tiers_.size(); ++i) {
            if (tiers_[i].words.size() > tiers_[best].words.size()) best = i;
        }
        static const std::vector<std::string> empty;
        return tiers_.empty() ? empty : tiers_[best].words;
    }

    // Vocabulary for a specific tier
    std::vector<std::string> getTierWords(const std::string& tier) const {
        const TierList* list = findTier(tier);
        if (list) return list->words;
        static const std::vector<std::string> empty;
        return tiers_.empty() ? empty : tiers_.front().words;
    }

    json tierReport() const {
        json out = json::object();
        for (const auto& t : tiers_) {
            out[t.tier] = {{"words", t.words.size()}, {"source", t.source}};
        }
        return out;
    }

    // natural = rank-decay weighted (resembles real prose frequency)
    // uniform = every entry in the tier equally likely (raw vocabulary test)
    std::vector<std::string> sampleWords(const std::string& tier, size_t count, bool natural) const {
        const TierList* list = findTier(tier);
        if (!list || list->words.empty() || count == 0) return {};

        const size_t n = list->words.size();

        static thread_local std::mt19937 gen{std::random_device{}()};
        std::uniform_int_distribution<size_t> uniformDist(0, n - 1);
        // Built per call: std::discrete_distribution::operator() is non-const,
        // so sharing one instance across httplib worker threads would race.
        std::discrete_distribution<size_t> weightedDist(list->weights.begin(), list->weights.end());

        // Sliding-window anti-repetition guard: K = min(10, 20% of tier size).
        // This keeps back-to-back repeats out even when the request is larger
        // than the tier. When the request fits inside the tier we additionally
        // draw without replacement, so a 25- or 50-word test never contains the
        // same word twice.
        size_t window = std::min<size_t>(10, static_cast<size_t>(static_cast<double>(n) * 0.2));
        if (window >= n) window = (n > 1) ? n - 1 : 0;

        const bool withoutReplacement = (count <= n);
        std::deque<std::string> recent;
        std::unordered_set<std::string> chosen;
        std::vector<std::string> result;
        result.reserve(count);

        for (size_t i = 0; i < count; ++i) {
            std::string word;
            for (int attempt = 0; attempt < 10; ++attempt) {
                size_t idx = natural ? weightedDist(gen) : uniformDist(gen);
                word = list->words[idx];
                const bool inWindow = std::find(recent.begin(), recent.end(), word) != recent.end();
                const bool alreadyUsed = withoutReplacement && chosen.count(word) > 0;
                if (!inWindow && !alreadyUsed) break;
            }

            // Near tier exhaustion re-rolls can starve; fall back to a bounded
            // scan for any unused entry so termination is guaranteed.
            if (withoutReplacement && chosen.count(word) > 0) {
                for (size_t probe = 0; probe < n; ++probe) {
                    const std::string& candidate = list->words[(i + probe) % n];
                    if (chosen.count(candidate) == 0) {
                        word = candidate;
                        break;
                    }
                }
            }

            result.push_back(word);
            if (withoutReplacement) chosen.insert(word);
            if (window > 0) {
                recent.push_back(word);
                while (recent.size() > window) recent.pop_front();
            }
        }

        return result;
    }

private:
    std::vector<TierList> tiers_;

    const TierList* findTierExact(const std::string& tier) const {
        for (const auto& t : tiers_) {
            if (t.tier == tier) return &t;
        }
        return nullptr;
    }

    // Unknown or empty tiers fall back to the default tier instead of failing.
    const TierList* findTier(const std::string& tier) const {
        if (const TierList* exact = findTierExact(tier)) return exact;
        if (const TierList* fallback = findTierExact(kDefaultTier)) return fallback;
        return tiers_.empty() ? nullptr : &tiers_.front();
    }
};

int main(int argc, char** argv) {
    int port = 8080;
    std::string host = "127.0.0.1";
    std::string explicitDataDir = "";
    std::string explicitWordsDir = "";
    std::string explicitWebDir = "";

    // Parse CLI arguments:
    // --port <port>
    // --host <127.0.0.1|0.0.0.0>
    // --data-dir <path>
    // --wordlists-dir <path>
    // --web-dir <path>
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if ((arg == "--port" || arg == "-p") && i + 1 < argc) {
            try { port = std::stoi(argv[++i]); } catch (...) {}
        } else if ((arg == "--host" || arg == "-h") && i + 1 < argc) {
            host = argv[++i];
        } else if (arg == "--data-dir" && i + 1 < argc) {
            explicitDataDir = argv[++i];
        } else if (arg == "--wordlists-dir" && i + 1 < argc) {
            explicitWordsDir = argv[++i];
        } else if (arg == "--web-dir" && i + 1 < argc) {
            explicitWebDir = argv[++i];
        } else if (i == 1 && arg[0] != '-') {
            try { port = std::stoi(arg); } catch (...) {}
        }
    }

    if (const char* portEnv = std::getenv("PORT")) {
        try { port = std::stoi(portEnv); } catch (...) {}
    }
    if (const char* hostEnv = std::getenv("TYPEX_BIND_HOST")) {
        host = hostEnv;
    }

    const std::string writableDataDir = !explicitDataDir.empty() ? explicitDataDir : resolveWritableDataDir();
    const std::string wordsDir = resolveWordlistsDir(explicitWordsDir);
    const std::string webDir = resolveStaticWebDir(explicitWebDir);

    // First-run dev data migration check (imports legacy dev data without overwriting)
    ensureDataMigration(writableDataDir, "backend/data");

    std::cout << "=======================================================" << std::endl;
    std::cout << "   ⚡ TypeX — Minimalist High-Performance Typing Engine  " << std::endl;
    std::cout << "=======================================================" << std::endl;
    std::cout << "[INFO] Version: 1.0.0" << std::endl;
    std::cout << "[INFO] Writable Data Dir : " << writableDataDir << std::endl;
    std::cout << "[INFO] Word Lists Dir    : " << wordsDir << std::endl;
    std::cout << "[INFO] Static Web Dir    : " << (webDir.empty() ? "(none - API only)" : webDir) << std::endl;
    std::cout << "[INFO] Listen Target     : " << host << ":" << port << std::endl;

    WordCorpus corpus(wordsDir);
    if (corpus.size() == 0) {
        std::cerr << "[FATAL] No word tiers could be loaded from " << wordsDir << std::endl;
        return 1;
    }

    const std::string pinFilePath = writableDataDir + "/admin_pin.json";
    typex::AdminPinManager pinManager(pinFilePath);

    const std::string profilePath = writableDataDir + "/mastery_profile.json";
    typex::MasteryEngine masteryEngine(profilePath);

    const std::string competitionStatePath = writableDataDir + "/competition_state.json";
    typex::CompetitionEngine competitionEngine(competitionStatePath, &pinManager);

    httplib::Server svr;

    // Mount static web assets if directory exists
    if (!webDir.empty() && std::filesystem::exists(webDir)) {
        svr.set_mount_point("/", webDir);
        std::cout << "[INFO] Mounted static web assets from " << webDir << std::endl;
    }

    // Set default CORS headers on every response
    svr.set_default_headers({
        {"Access-Control-Allow-Origin", "*"},
        {"Access-Control-Allow-Methods", "GET, POST, OPTIONS"},
        {"Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin, X-Requested-With"}
    });

    // Handle OPTIONS for CORS preflight
    svr.Options(".*", [](const httplib::Request&, httplib::Response& res) {
        res.set_header("Access-Control-Allow-Origin", "*");
        res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin, X-Requested-With");
        res.status = 204;
    });

    // Health / info endpoint
    svr.Get("/api/health", [&corpus, &pinManager, host, port](const httplib::Request&, httplib::Response& res) {
        json response = {
            {"status", "ok"},
            {"version", "1.0.0"},
            {"service", "TypeX Engine"},
            {"host", host},
            {"port", port},
            {"adminPinConfigured", pinManager.isConfigured()},
            {"corpusSize", corpus.size()},
            {"tiers", corpus.tierReport()}
        };
        res.set_content(response.dump(), "application/json");
    });

    svr.Get("/api/version", [](const httplib::Request&, httplib::Response& res) {
        json response = {
            {"version", "1.0.0"},
            {"name", "TypeX"},
            {"engine", "C++17 cpp-httplib"}
        };
        res.set_content(response.dump(), "application/json");
    });

    // Network inspection endpoint (Host mode LAN URLs)
    svr.Get("/api/system/network", [host, port](const httplib::Request&, httplib::Response& res) {
        std::vector<std::string> lanIps = getLanIpAddresses();
        json lanUrls = json::array();
        for (const auto& ip : lanIps) {
            lanUrls.push_back({
                {"ip", ip},
                {"competeUrl", "http://" + ip + ":" + std::to_string(port) + "/compete"},
                {"leaderboardUrl", "http://" + ip + ":" + std::to_string(port) + "/leaderboard"},
                {"adminUrl", "http://" + ip + ":" + std::to_string(port) + "/admin"}
            });
        }
        json resp = {
            {"host", host},
            {"port", port},
            {"isHostMode", (host == "0.0.0.0")},
            {"lanIps", lanIps},
            {"lanUrls", lanUrls}
        };
        res.set_content(resp.dump(), "application/json");
    });

    // Endpoint 1: GET /api/words?tier=english_1k&count=100&mode=natural|uniform
    svr.Get("/api/words", [&corpus](const httplib::Request& req, httplib::Response& res) {
        std::string tier = kDefaultTier;
        if (req.has_param("tier")) {
            tier = req.get_param_value("tier");
        }
        const std::string effectiveTier = corpus.effectiveTier(tier);

        // Natural (rank-decay) sampling is the default; uniform is opt-in for
        // raw vocabulary testing.
        bool natural = true;
        if (req.has_param("mode")) {
            natural = (req.get_param_value("mode") != "uniform");
        }

        size_t count = 50;
        if (req.has_param("count")) {
            try {
                int parsed = std::stoi(req.get_param_value("count"));
                if (parsed > 0 && parsed <= 1000) {
                    count = static_cast<size_t>(parsed);
                }
            } catch (...) {
                count = 50;
            }
        }

        std::vector<std::string> sampled = corpus.sampleWords(effectiveTier, count, natural);

        json response = {
            {"tier", effectiveTier},
            {"mode", natural ? "natural" : "uniform"},
            {"count", sampled.size()},
            {"words", sampled}
        };

        res.set_content(response.dump(), "application/json");
    });

    // Endpoint: GET /api/ghost
    svr.Get("/api/ghost", [](const httplib::Request&, httplib::Response& res) {
        json response = {
            {"hasGhost", false},
            {"wpm", 0.0},
            {"accuracy", 100.0},
            {"keystrokesPerSecond", json::array()}
        };
        res.set_content(response.dump(), "application/json");
    });

    // Endpoint 2: POST /api/analyze
    svr.Post("/api/analyze", [](const httplib::Request& req, httplib::Response& res) {
        try {
            auto payload = json::parse(req.body);

            double durationSeconds = payload.value("durationSeconds", 30.0);
            if (durationSeconds <= 0.0) durationSeconds = 1.0;

            int correctChars = payload.value("correctChars", 0);
            int incorrectChars = payload.value("incorrectChars", 0);
            int extraChars = payload.value("extraChars", 0);
            int missedChars = payload.value("missedChars", 0);

            std::vector<double> rawKeystrokesPerSecond;
            if (payload.contains("rawKeystrokesPerSecond") && payload["rawKeystrokesPerSecond"].is_array()) {
                for (const auto& item : payload["rawKeystrokesPerSecond"]) {
                    if (item.is_number()) {
                        rawKeystrokesPerSecond.push_back(item.get<double>());
                    }
                }
            }

            // Net WPM: (correct characters / 5) / elapsed minutes
            // Raw WPM: (all typed characters / 5) / elapsed minutes
            double totalTypedChars = correctChars + incorrectChars + extraChars;
            double rawWpm = (totalTypedChars / 5.0) / (durationSeconds / 60.0);
            double netWpm = (correctChars / 5.0) / (durationSeconds / 60.0);

            // Partial accuracy recovery calculation:
            // total_keystrokes = all character keystrokes (wrong, right, retyped)
            // uncorrected_errors = wrong or extra characters still in final text (incorrectChars + extraChars)
            // corrected_errors = wrong keystrokes later deleted and replaced
            // CORRECTION_PENALTY = 0.5
            // accuracy = max(0, 1 - (uncorrected_errors + CORRECTION_PENALTY * corrected_errors) / total_keystrokes) * 100
            constexpr double CORRECTION_PENALTY = 0.5;
            int uncorrectedErrors = incorrectChars + extraChars;
            int clientCorrectedErrors = payload.value("correctedErrors", 0);
            int clientTotalKeystrokes = payload.value("totalKeystrokes", 0);

            if (payload.contains("keystrokesLog") && payload["keystrokesLog"].is_array()) {
                int charKeys = 0;
                for (const auto& entry : payload["keystrokesLog"]) {
                    std::string k = entry.value("key", "");
                    if (k.size() == 1 || k == "Space") {
                        charKeys++;
                    }
                }
                if (charKeys > 0) {
                    clientTotalKeystrokes = charKeys;
                }
            }

            int totalKeystrokes = std::max(static_cast<int>(totalTypedChars), clientTotalKeystrokes);
            int correctedErrors = std::max(0, clientCorrectedErrors);

            if (totalKeystrokes < uncorrectedErrors + correctedErrors + correctChars) {
                totalKeystrokes = uncorrectedErrors + correctedErrors + correctChars;
            }

            double accuracy = 100.0;
            if (totalKeystrokes > 0) {
                double penalty = uncorrectedErrors + (CORRECTION_PENALTY * correctedErrors);
                accuracy = std::max(0.0, 1.0 - (penalty / totalKeystrokes)) * 100.0;
            } else if (totalTypedChars > 0) {
                accuracy = (static_cast<double>(correctChars) / totalTypedChars) * 100.0;
            }
            accuracy = std::clamp(accuracy, 0.0, 100.0);

            // Consistency calculation: stddev and mean of rawKeystrokesPerSecond
            // clamp(100.0 - ((stddev / mean) * 100.0), 0.0, 100.0)
            double consistency = 100.0;
            if (!rawKeystrokesPerSecond.empty()) {
                double sum = std::accumulate(rawKeystrokesPerSecond.begin(), rawKeystrokesPerSecond.end(), 0.0);
                double mean = sum / rawKeystrokesPerSecond.size();

                if (mean > 0.0001) {
                    double varianceSum = 0.0;
                    for (double val : rawKeystrokesPerSecond) {
                        varianceSum += (val - mean) * (val - mean);
                    }
                    double stddev = std::sqrt(varianceSum / rawKeystrokesPerSecond.size());
                    double cv = (stddev / mean) * 100.0;
                    consistency = std::clamp(100.0 - cv, 0.0, 100.0);
                } else {
                    consistency = 0.0;
                }
            }

            // Smoothed perSecondWpm array for the frontend graph
            std::vector<double> perSecondWpm;
            perSecondWpm.reserve(rawKeystrokesPerSecond.size());
            if (!rawKeystrokesPerSecond.empty()) {
                // First calculate instantaneous WPM for each second: (keystrokes / 5.0) * 60.0
                std::vector<double> instantWpm;
                instantWpm.reserve(rawKeystrokesPerSecond.size());
                for (double ks : rawKeystrokesPerSecond) {
                    instantWpm.push_back((ks / 5.0) * 60.0);
                }

                // Apply a 3-point smoothing kernel [0.2, 0.6, 0.2]
                for (size_t i = 0; i < instantWpm.size(); ++i) {
                    double prev = (i > 0) ? instantWpm[i - 1] : instantWpm[i];
                    double curr = instantWpm[i];
                    double next = (i + 1 < instantWpm.size()) ? instantWpm[i + 1] : instantWpm[i];
                    double smoothed = 0.2 * prev + 0.6 * curr + 0.2 * next;
                    // Round to 1 decimal place
                    smoothed = std::round(smoothed * 10.0) / 10.0;
                    perSecondWpm.push_back(smoothed);
                }
            }

            // Round values cleanly
            rawWpm = std::round(rawWpm * 10.0) / 10.0;
            netWpm = std::round(netWpm * 10.0) / 10.0;
            accuracy = std::round(accuracy * 10.0) / 10.0;
            consistency = std::round(consistency * 10.0) / 10.0;

            json response = {
                {"rawWpm", rawWpm},
                {"netWpm", netWpm},
                {"accuracy", accuracy},
                {"consistency", consistency},
                {"perSecondWpm", perSecondWpm},
                {"correctChars", correctChars},
                {"incorrectChars", incorrectChars},
                {"extraChars", extraChars},
                {"missedChars", missedChars},
                {"correctedErrors", correctedErrors},
                {"totalKeystrokes", totalKeystrokes},
                {"durationSeconds", durationSeconds}
            };

            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            json err = {
                {"error", "Failed to parse analyze payload"},
                {"details", e.what()}
            };
            res.status = 400;
            res.set_content(err.dump(), "application/json");
        }
    });

    // Endpoint 3: GET /api/learn/status
    svr.Get("/api/learn/status", [&masteryEngine](const httplib::Request&, httplib::Response& res) {
        json status = masteryEngine.getStatus();
        res.set_content(status.dump(), "application/json");
    });

    // Endpoint 4: GET /api/learn/lesson?track=phonetic_unlock&count=25&focusKey=c
    svr.Get("/api/learn/lesson", [&masteryEngine, &corpus](const httplib::Request& req, httplib::Response& res) {
        std::string track = "phonetic_unlock";
        if (req.has_param("track")) {
            track = req.get_param_value("track");
        }

        size_t count = 25;
        if (req.has_param("count")) {
            try {
                int c = std::stoi(req.get_param_value("count"));
                if (c > 0 && c <= 100) count = static_cast<size_t>(c);
            } catch (...) {}
        }

        std::string focusKey = "";
        if (req.has_param("focusKey")) {
            focusKey = req.get_param_value("focusKey");
        }

        json lesson = masteryEngine.synthesizeLesson(track, count, focusKey, corpus.learnPool());
        res.set_content(lesson.dump(), "application/json");
    });

    // Endpoint 5: POST /api/learn/submit
    svr.Post("/api/learn/submit", [&masteryEngine](const httplib::Request& req, httplib::Response& res) {
        try {
            auto payload = json::parse(req.body);
            json delta = masteryEngine.submitTelemetry(payload);
            res.set_content(delta.dump(), "application/json");
        } catch (const std::exception& e) {
            json err = {
                {"error", "Failed to process learn submission"},
                {"details", e.what()}
            };
            res.status = 400;
            res.set_content(err.dump(), "application/json");
        }
    });

    // ── Competition Mode Endpoints ───────────────────────────────────────────

    // GET /api/competition/state (Poll state for admin, compete, projector)
    svr.Get("/api/competition/state", [&competitionEngine](const httplib::Request&, httplib::Response& res) {
        json state = competitionEngine.getStateJson();
        res.set_content(state.dump(), "application/json");
    });

    // GET /api/admin/pin-status
    svr.Get("/api/admin/pin-status", [&pinManager](const httplib::Request&, httplib::Response& res) {
        json resp = {
            {"configured", pinManager.isConfigured()}
        };
        res.set_content(resp.dump(), "application/json");
    });

    // POST /api/admin/setup-pin
    svr.Post("/api/admin/setup-pin", [&pinManager](const httplib::Request& req, httplib::Response& res) {
        try {
            auto payload = json::parse(req.body);
            std::string newPin = payload.value("newPin", "");
            std::string oldPin = payload.value("oldPin", "");
            if (newPin.size() < 4) {
                res.status = 400;
                res.set_content("{\"error\":\"PIN must be at least 4 characters.\"}", "application/json");
                return;
            }
            bool success = pinManager.setPin(newPin, oldPin);
            if (!success) {
                res.status = pinManager.isConfigured() ? 401 : 500;
                res.set_content("{\"error\":\"Failed to set PIN. Incorrect current PIN or storage failure.\"}", "application/json");
                return;
            }
            res.set_content("{\"status\":\"ok\",\"configured\":true}", "application/json");
        } catch (...) {
            res.status = 400;
            res.set_content("{\"error\":\"Invalid request payload\"}", "application/json");
        }
    });

    // POST /api/competition/verify-pin
    svr.Post("/api/competition/verify-pin", [&competitionEngine, &pinManager](const httplib::Request& req, httplib::Response& res) {
        try {
            auto payload = json::parse(req.body);
            std::string pin = payload.value("pin", "");
            bool configured = pinManager.isConfigured();
            bool valid = configured && pinManager.verifyPin(pin);
            json resp = {
                {"valid", valid},
                {"configured", configured}
            };
            if (!configured) {
                resp["error"] = "Admin PIN is not configured yet. Complete the first-run PIN setup screen.";
            }
            res.set_content(resp.dump(), "application/json");
        } catch (...) {
            res.status = 400;
            res.set_content("{\"error\":\"Invalid request\"}", "application/json");
        }
    });

    // POST /api/competition/config (Requires pin)
    svr.Post("/api/competition/config", [&competitionEngine](const httplib::Request& req, httplib::Response& res) {
        try {
            auto payload = json::parse(req.body);
            std::string pin = payload.value("pin", "");
            if (!competitionEngine.verifyPin(pin)) {
                res.status = 401;
                res.set_content("{\"error\":\"Unauthorized: invalid admin PIN\"}", "application/json");
                return;
            }
            json updated = competitionEngine.updateConfig(payload);
            res.set_content(updated.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            json err = {{"error", e.what()}};
            res.set_content(err.dump(), "application/json");
        }
    });

    // POST /api/competition/paragraphs/generate (Requires pin)
    svr.Post("/api/competition/paragraphs/generate", [&competitionEngine, &corpus](const httplib::Request& req, httplib::Response& res) {
        try {
            auto payload = json::parse(req.body);
            std::string pin = payload.value("pin", "");
            if (!competitionEngine.verifyPin(pin)) {
                res.status = 401;
                res.set_content("{\"error\":\"Unauthorized: invalid admin PIN\"}", "application/json");
                return;
            }
            std::string tier = payload.value("tier", "english_1k");
            int wordCount = payload.value("wordCount", 40);

            auto words = corpus.getTierWords(tier);
            bool ok = competitionEngine.generateParagraphPool(words, tier, wordCount);
            if (!ok) {
                res.status = 500;
                res.set_content("{\"error\":\"Failed to generate pool satisfying constraints\"}", "application/json");
                return;
            }
            res.set_content(competitionEngine.getStateJson().dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            json err = {{"error", e.what()}};
            res.set_content(err.dump(), "application/json");
        }
    });

    // POST /api/competition/contestants/add (Requires pin)
    svr.Post("/api/competition/contestants/add", [&competitionEngine](const httplib::Request& req, httplib::Response& res) {
        try {
            auto payload = json::parse(req.body);
            std::string pin = payload.value("pin", "");
            if (!competitionEngine.verifyPin(pin)) {
                res.status = 401;
                res.set_content("{\"error\":\"Unauthorized: invalid admin PIN\"}", "application/json");
                return;
            }

            std::vector<std::string> names;
            if (payload.contains("names") && payload["names"].is_array()) {
                for (const auto& item : payload["names"]) {
                    if (item.is_string()) names.push_back(item.get<std::string>());
                }
            } else if (payload.contains("name") && payload["name"].is_string()) {
                names.push_back(payload["name"].get<std::string>());
            }

            json state = competitionEngine.addContestants(names);
            res.set_content(state.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            json err = {{"error", e.what()}};
            res.set_content(err.dump(), "application/json");
        }
    });

    // POST /api/competition/contestants/reorder (Requires pin)
    svr.Post("/api/competition/contestants/reorder", [&competitionEngine](const httplib::Request& req, httplib::Response& res) {
        try {
            auto payload = json::parse(req.body);
            std::string pin = payload.value("pin", "");
            if (!competitionEngine.verifyPin(pin)) {
                res.status = 401;
                res.set_content("{\"error\":\"Unauthorized: invalid admin PIN\"}", "application/json");
                return;
            }
            std::vector<std::string> ids;
            if (payload.contains("orderedIds") && payload["orderedIds"].is_array()) {
                for (const auto& item : payload["orderedIds"]) {
                    if (item.is_string()) ids.push_back(item.get<std::string>());
                }
            }
            competitionEngine.reorderContestants(ids);
            res.set_content(competitionEngine.getStateJson().dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            json err = {{"error", e.what()}};
            res.set_content(err.dump(), "application/json");
        }
    });

    // POST /api/competition/contestants/register (Self-service check-in for contestant flow, no pin required)
    svr.Post("/api/competition/contestants/register", [&competitionEngine](const httplib::Request& req, httplib::Response& res) {
        try {
            auto payload = json::parse(req.body);
            std::string name = payload.value("name", "");
            std::string regId = payload.value("regId", "");
            std::string department = payload.value("department", "");

            json result = competitionEngine.registerContestant(name, regId, department);
            if (result.contains("error")) {
                res.status = 400;
            } else {
                res.status = 200;
            }
            res.set_content(result.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            json err = {{"error", e.what()}};
            res.set_content(err.dump(), "application/json");
        }
    });

    // POST /api/competition/contestants/status (mark absent, disqualified, remove result, delete contestant, grant redo, edit)
    svr.Post("/api/competition/contestants/status", [&competitionEngine](const httplib::Request& req, httplib::Response& res) {
        try {
            auto payload = json::parse(req.body);
            std::string pin = payload.value("pin", "");
            if (!competitionEngine.verifyPin(pin)) {
                res.status = 401;
                res.set_content("{\"error\":\"Unauthorized: invalid admin PIN\"}", "application/json");
                return;
            }
            std::string id = payload.value("id", "");
            std::string action = payload.value("action", ""); // "remove", "mark_absent", "mark_disqualified", "mark_pending", "delete_result", "grant_redo", "edit"

            if (action == "remove") {
                competitionEngine.removeContestant(id);
            } else if (action == "mark_absent") {
                competitionEngine.markContestantStatus(id, "absent");
            } else if (action == "mark_disqualified") {
                competitionEngine.markContestantStatus(id, "disqualified");
            } else if (action == "mark_pending") {
                competitionEngine.markContestantStatus(id, "pending");
            } else if (action == "delete_result") {
                competitionEngine.deleteResult(id);
            } else if (action == "grant_redo") {
                competitionEngine.grantRedo(id);
            } else if (action == "edit") {
                std::string name = payload.value("name", "");
                std::string regId = payload.value("regId", "");
                std::string department = payload.value("department", "");
                competitionEngine.editContestant(id, name, regId, department);
            }

            res.set_content(competitionEngine.getStateJson().dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            json err = {{"error", e.what()}};
            res.set_content(err.dump(), "application/json");
        }
    });

    // POST /api/competition/results/edit (Admin inline edit name/regId/dept on a result)
    svr.Post("/api/competition/results/edit", [&competitionEngine](const httplib::Request& req, httplib::Response& res) {
        try {
            auto payload = json::parse(req.body);
            std::string pin = payload.value("pin", "");
            if (!competitionEngine.verifyPin(pin)) {
                res.status = 401;
                res.set_content("{\"error\":\"Unauthorized: invalid admin PIN\"}", "application/json");
                return;
            }
            std::string id = payload.value("id", "");
            std::string name = payload.value("name", "");
            std::string regId = payload.value("regId", "");
            std::string department = payload.value("department", "");

            competitionEngine.editResult(id, name, regId, department);
            res.set_content(competitionEngine.getStateJson().dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            json err = {{"error", e.what()}};
            res.set_content(err.dump(), "application/json");
        }
    });

    // POST /api/competition/round/control (Requires pin)
    svr.Post("/api/competition/round/control", [&competitionEngine](const httplib::Request& req, httplib::Response& res) {
        try {
            auto payload = json::parse(req.body);
            std::string pin = payload.value("pin", "");
            if (!competitionEngine.verifyPin(pin)) {
                res.status = 401;
                res.set_content("{\"error\":\"Unauthorized: invalid admin PIN\"}", "application/json");
                return;
            }
            std::string action = payload.value("action", "");
            if (action == "select_batch") {
                int b = payload.value("batchIndex", 0);
                competitionEngine.selectBatch(b);
            } else if (action == "select_contestant") {
                std::string id = payload.value("contestantId", "");
                competitionEngine.selectContestant(id);
            } else if (action == "start_countdown") {
                competitionEngine.startCountdown();
            } else if (action == "start_typing") {
                competitionEngine.startTyping();
            } else if (action == "stop") {
                competitionEngine.stopRound();
            } else if (action == "redo") {
                competitionEngine.redoCurrentContestant();
            } else if (action == "next_contestant") {
                competitionEngine.nextContestant();
            } else if (action == "close_batch") {
                competitionEngine.closeBatch();
            } else if (action == "next_batch") {
                competitionEngine.nextBatch();
            } else if (action == "set_projector_view") {
                std::string view = payload.value("view", "overall");
                competitionEngine.setProjectorView(view);
            } else if (action == "reset_event") {
                competitionEngine.resetEvent();
            }

            res.set_content(competitionEngine.getStateJson().dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            json err = {{"error", e.what()}};
            res.set_content(err.dump(), "application/json");
        }
    });

    // POST /api/competition/compete/heartbeat (From Contestant Screen during typing)
    svr.Post("/api/competition/compete/heartbeat", [&competitionEngine](const httplib::Request& req, httplib::Response& res) {
        try {
            auto payload = json::parse(req.body);
            std::string contestantId = payload.value("contestantId", "");
            double currentWpm = payload.value("currentWpm", 0.0);
            double currentAccuracy = payload.value("currentAccuracy", 100.0);
            int cursorPosition = payload.value("cursorPosition", 0);
            int totalChars = payload.value("totalChars", 0);
            int errorCount = payload.value("errorCount", 0);
            int elapsedSeconds = payload.value("elapsedSeconds", 0);

            competitionEngine.updateLiveProgress(contestantId, currentWpm, currentAccuracy, cursorPosition, totalChars, errorCount, elapsedSeconds);
            res.set_content("{\"status\":\"ok\"}", "application/json");
        } catch (...) {
            res.status = 400;
            res.set_content("{\"error\":\"Invalid heartbeat\"}", "application/json");
        }
    });

    // POST /api/competition/compete/submit (From Contestant Screen on finish/timeout)
    svr.Post("/api/competition/compete/submit", [&competitionEngine](const httplib::Request& req, httplib::Response& res) {
        try {
            auto payload = json::parse(req.body);
            std::string contestantId = payload.value("contestantId", "");
            json state = competitionEngine.submitResult(contestantId, payload);
            res.set_content(state.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            json err = {{"error", e.what()}};
            res.set_content(err.dump(), "application/json");
        }
    });

    // GET /api/competition/export/csv & /api/competition/export-csv
    auto exportCsvHandler = [&competitionEngine](const httplib::Request&, httplib::Response& res) {
        std::string csv = competitionEngine.exportCsv();
        res.set_header("Content-Type", "text/csv");
        res.set_header("Content-Disposition", "attachment; filename=\"typex_competition_results.csv\"");
        res.set_content(csv, "text/csv");
    };
    svr.Get("/api/competition/export/csv", exportCsvHandler);
    svr.Get("/api/competition/export-csv", exportCsvHandler);

    // Static SPA routing fallback: serve sub-page HTML files or index.html for client-side navigation
    if (!webDir.empty()) {
        svr.set_error_handler([webDir](const httplib::Request& req, httplib::Response& res) {
            if (res.status == 404 && (req.method == "GET" || req.method == "HEAD") && req.path.rfind("/api/", 0) != 0) {
                std::string sub = req.path;
                if (!sub.empty() && sub.front() == '/') sub = sub.substr(1);
                while (!sub.empty() && sub.back() == '/') sub.pop_back();

                std::string targetHtml = webDir + "/" + sub + ".html";
                if (!sub.empty() && std::filesystem::exists(targetHtml)) {
                    std::ifstream in(targetHtml);
                    if (in.is_open()) {
                        std::stringstream buffer;
                        buffer << in.rdbuf();
                        res.status = 200;
                        res.set_content(buffer.str(), "text/html");
                        return;
                    }
                }

                std::string indexHtml = webDir + "/index.html";
                std::ifstream idx(indexHtml);
                if (idx.is_open()) {
                    std::stringstream buffer;
                    buffer << idx.rdbuf();
                    res.status = 200;
                    res.set_content(buffer.str(), "text/html");
                    return;
                }
            }
        });
    }

    std::cout << "[INFO] TypeX C++ Server listening on http://" << host << ":" << port << std::endl;
    bool success = svr.listen(host.c_str(), port);
    if (!success) {
        std::cerr << "[ERROR] Failed to bind to " << host << ":" << port << std::endl;
        return 1;
    }

    return 0;
}
