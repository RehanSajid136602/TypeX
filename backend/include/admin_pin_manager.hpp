#pragma once

#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <sstream>
#include <iomanip>
#include <random>
#include <chrono>
#include <mutex>
#include <filesystem>
#include <cstdint>
#ifndef _WIN32
#include <unistd.h>
#endif
#include <sys/stat.h>

#include "json.hpp"

using json = nlohmann::json;

namespace typex {

namespace crypto {

inline uint32_t rotr(uint32_t x, uint32_t n) { return (x >> n) | (x << (32 - n)); }
inline uint32_t ch(uint32_t e, uint32_t f, uint32_t g) { return (e & f) ^ (~e & g); }
inline uint32_t maj(uint32_t a, uint32_t b, uint32_t c) { return (a & b) ^ (a & c) ^ (b & c); }
inline uint32_t sig0(uint32_t x) { return rotr(x, 7) ^ rotr(x, 18) ^ (x >> 3); }
inline uint32_t sig1(uint32_t x) { return rotr(x, 17) ^ rotr(x, 19) ^ (x >> 10); }

static const uint32_t K[64] = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
};

inline std::string sha256(const std::string& input) {
    uint32_t h[8] = {
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    };

    std::vector<uint8_t> msg(input.begin(), input.end());
    uint64_t bitLen = msg.size() * 8;
    msg.push_back(0x80);
    while ((msg.size() % 64) != 56) {
        msg.push_back(0x00);
    }
    for (int i = 7; i >= 0; --i) {
        msg.push_back(static_cast<uint8_t>((bitLen >> (i * 8)) & 0xff));
    }

    for (size_t chunk = 0; chunk < msg.size(); chunk += 64) {
        uint32_t w[64];
        for (int i = 0; i < 16; ++i) {
            w[i] = (static_cast<uint32_t>(msg[chunk + i * 4]) << 24) |
                   (static_cast<uint32_t>(msg[chunk + i * 4 + 1]) << 16) |
                   (static_cast<uint32_t>(msg[chunk + i * 4 + 2]) << 8) |
                   (static_cast<uint32_t>(msg[chunk + i * 4 + 3]));
        }
        for (int i = 16; i < 64; ++i) {
            uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
            uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }

        uint32_t a = h[0], b = h[1], c = h[2], d = h[3];
        uint32_t e = h[4], f = h[5], g = h[6], h_val = h[7];

        for (int i = 0; i < 64; ++i) {
            uint32_t S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            uint32_t choice = ch(e, f, g);
            uint32_t temp1 = h_val + S1 + choice + K[i] + w[i];
            uint32_t S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            uint32_t majority = maj(a, b, c);
            uint32_t temp2 = S0 + majority;

            h_val = g;
            g = f;
            f = e;
            e = d + temp1;
            d = c;
            c = b;
            b = a;
            a = temp1 + temp2;
        }

        h[0] += a; h[1] += b; h[2] += c; h[3] += d;
        h[4] += e; h[5] += f; h[6] += g; h[7] += h_val;
    }

    std::ostringstream oss;
    for (int i = 0; i < 8; ++i) {
        oss << std::hex << std::setfill('0') << std::setw(8) << h[i];
    }
    return oss.str();
}

inline std::string generateSalt(size_t len = 16) {
    static const char hexChars[] = "0123456789abcdef";
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 15);
    std::string s;
    s.reserve(len);
    for (size_t i = 0; i < len; ++i) {
        s.push_back(hexChars[dis(gen)]);
    }
    return s;
}

} // namespace crypto

class AdminPinManager {
public:
    explicit AdminPinManager(std::string pinFilePath)
        : pinFilePath_(std::move(pinFilePath)) {
        load();
    }

    bool isConfigured() const {
        std::lock_guard<std::mutex> lock(mutex_);
        if (const char* env = std::getenv("TYPEX_ADMIN_PIN")) {
            if (std::string(env).size() > 0) return true;
        }
        return !hashedPin_.empty() && !salt_.empty();
    }

    bool verifyPin(const std::string& inputPin) const {
        std::lock_guard<std::mutex> lock(mutex_);
        if (inputPin.empty()) return false;

        // Environment override takes precedence if set
        if (const char* env = std::getenv("TYPEX_ADMIN_PIN")) {
            std::string envPin(env);
            if (!envPin.empty()) {
                return inputPin == envPin;
            }
        }

        if (hashedPin_.empty() || salt_.empty()) {
            return false;
        }

        std::string computed = crypto::sha256(salt_ + ":" + inputPin);
        return computed == hashedPin_;
    }

    bool setPin(const std::string& newPin, const std::string& oldPin = "") {
        std::lock_guard<std::mutex> lock(mutex_);
        if (newPin.size() < 4) {
            return false; // Minimum 4 characters
        }

        // If already configured, require old PIN
        if (!hashedPin_.empty() && !salt_.empty()) {
            std::string computedOld = crypto::sha256(salt_ + ":" + oldPin);
            if (computedOld != hashedPin_) {
                return false;
            }
        }

        salt_ = crypto::generateSalt(16);
        hashedPin_ = crypto::sha256(salt_ + ":" + newPin);
        return saveInternal();
    }

private:
    void load() {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!std::filesystem::exists(pinFilePath_)) {
            return;
        }
        try {
            std::ifstream file(pinFilePath_);
            if (!file.is_open()) return;
            json j = json::parse(file);
            salt_ = j.value("salt", "");
            hashedPin_ = j.value("hash", "");
        } catch (const std::exception& e) {
            std::cerr << "[WARN] Failed to parse admin pin file: " << e.what() << std::endl;
        }
    }

    bool saveInternal() {
        try {
            std::filesystem::path p(pinFilePath_);
            if (p.has_parent_path()) {
                std::filesystem::create_directories(p.parent_path());
            }

            json j = {
                {"salt", salt_},
                {"hash", hashedPin_},
                {"updatedAt", std::chrono::duration_cast<std::chrono::seconds>(
                    std::chrono::system_clock::now().time_since_epoch()).count()}
            };

            std::string tempPath = pinFilePath_ + ".tmp";
            {
                std::ofstream out(tempPath, std::ios::trunc);
                if (!out.is_open()) return false;
                out << j.dump(2);
                out.flush();
            }

            // Secure file permissions (0600 - user read/write only) on POSIX
#ifndef _WIN32
            chmod(tempPath.c_str(), S_IRUSR | S_IWUSR);
#endif

            std::filesystem::rename(tempPath, pinFilePath_);
            return true;
        } catch (const std::exception& e) {
            std::cerr << "[ERROR] Failed to save admin PIN file: " << e.what() << std::endl;
            return false;
        }
    }

    mutable std::mutex mutex_;
    std::string pinFilePath_;
    std::string salt_;
    std::string hashedPin_;
};

} // namespace typex
