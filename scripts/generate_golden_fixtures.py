#!/usr/bin/env python3
"""
Independent Python script generating a deterministic dataset of 42 tests
across 3 modes ('time', 'words', 'learn') and 3 different tz_offset_min values (-300, 0, 480).
Computes expected values with pure Python arithmetic without importing any backend code.
Saves expected values to tests/fixtures/golden_analytics_expected.json.
"""

import json
import math
import os
from datetime import datetime, timezone, timedelta

def main():
    tests = []
    
    # 42 deterministic tests
    # Base timestamp: 2026-05-01 10:00:00 UTC
    base_epoch_sec = 1777629600 # 2026-05-01 10:00:00 UTC
    
    # Timezones:
    # -300 (UTC+5, e.g. PKT, client tz_offset_min = -300)
    # 0 (UTC, client tz_offset_min = 0)
    # 480 (UTC-8, e.g. PST, client tz_offset_min = 480)
    tz_offsets = [-300, 0, 480]
    modes = ["time", "words", "learn"]
    
    wpm_list = []
    sum_duration_ms = 0
    sum_correct = 0
    sum_total_ks = 0
    sum_uncorrected = 0
    sum_corrected = 0
    per_test_accuracies = []
    
    # Key stats tracking: {key: {"attempts": int, "errors": int, "flight_ms_sum": int, "flight_n": int}}
    key_stats_map = {}
    # Confusions tracking: {(expected, typed): int}
    confusions_map = {}
    # Word errors tracking: {word: int}
    word_errors_map = {}
    
    # Daily counts by local date string "YYYY-MM-DD"
    daily_counts = {}
    
    # Generate 42 tests across 5 local days
    for i in range(42):
        mode = modes[i % 3]
        tz_offset = tz_offsets[i % 3]
        
        # Day index: 0, 1, 2, 3, 4
        day_idx = i // 9
        
        # Specific requirement: include a test at 23:30 local time that must land on the correct local day!
        # For test index 25, let's place it at 23:30 local time for tz_offset = -300 (UTC+5)
        if i == 25:
            # 2026-05-03 23:30:00 local (+05:00) => 2026-05-03 18:30:00 UTC
            # epoch ms:
            local_dt = datetime(2026, 5, 3, 23, 30, 0, tzinfo=timezone(timedelta(minutes=300)))
            s_at_ms = int(local_dt.timestamp() * 1000)
            tz_offset = -300 # client offset is -300 for UTC+5
        else:
            # Normal spacing: 10:00 + (day_idx * 86400) + (i % 9) * 3600
            s_at_sec = base_epoch_sec + (day_idx * 86400) + ((i % 9) * 3600)
            s_at_ms = s_at_sec * 1000
            
        # Linear variation in WPM: from 45.0 to 127.0
        # WPM formula:
        net_wpm = round(45.0 + (i * 2.0), 1)
        raw_wpm = round(net_wpm + 5.0, 1)
        wpm_list.append(net_wpm)
        
        duration_ms = 30000 if mode == "time" else (25000 if mode == "words" else 40000)
        sum_duration_ms += duration_ms
        
        # Design keystrokes and errors so pooled accuracy is mathematically distinct from mean of percentages
        # Test with high keystrokes has different error rate than test with low keystrokes
        if i % 2 == 0:
            keystrokes = 400
            uncorrected = 8
            corrected = 4
        else:
            keystrokes = 100
            uncorrected = 10
            corrected = 2
            
        correct_chars = keystrokes - uncorrected
        sum_correct += correct_chars
        sum_total_ks += keystrokes
        sum_uncorrected += uncorrected
        sum_corrected += corrected
        
        penalty = uncorrected + 0.5 * corrected
        test_acc = max(0.0, min(100.0, (1.0 - (penalty / keystrokes)) * 100.0))
        per_test_accuracies.append(test_acc)
        
        # Local date calculation:
        # local_ms = s_at_ms - (tz_offset * 60000)
        local_sec = (s_at_ms - (tz_offset * 60000)) // 1000
        local_date_str = datetime.fromtimestamp(local_sec, tz=timezone.utc).strftime("%Y-%m-%d")
        daily_counts[local_date_str] = daily_counts.get(local_date_str, 0) + 1
        
        # Test key stats:
        # Key 'e': 30 attempts, 3 errors, 1500ms flight
        # Key 't': 20 attempts, 2 errors, 1200ms flight
        # Key 'q': only 1 attempt, 1 error (below min-sample threshold of 10 attempts!)
        test_keys = [
            ("e", 30, 3, 1500, 30),
            ("t", 20, 2, 1200, 20),
        ]
        if i == 0: # only in test 0
            test_keys.append(("q", 3, 3, 300, 3)) # total attempts = 3 (< 10)
            
        for k, att, err, fl_sum, fl_n in test_keys:
            if k not in key_stats_map:
                key_stats_map[k] = {"attempts": 0, "errors": 0, "flight_ms_sum": 0, "flight_n": 0}
            key_stats_map[k]["attempts"] += att
            key_stats_map[k]["errors"] += err
            key_stats_map[k]["flight_ms_sum"] += fl_sum
            key_stats_map[k]["flight_n"] += fl_n
            
        # Confusions:
        # 'e' -> 'r' (2 counts)
        # 't' -> 'y' (1 count)
        confusions_map[("e", "r")] = confusions_map.get(("e", "r"), 0) + 2
        confusions_map[("t", "y")] = confusions_map.get(("t", "y"), 0) + 1
        
        # Word errors:
        # 'the' (2 counts)
        # 'quick' (1 count)
        word_errors_map["the"] = word_errors_map.get("the", 0) + 2
        word_errors_map["quick"] = word_errors_map.get("quick", 0) + 1
        
        tests.append({
            "id": i + 1,
            "startedAt": s_at_ms,
            "tzOffsetMin": tz_offset,
            "mode": mode,
            "config": json.dumps({"timeOption": "30" if mode == "time" else "words"}),
            "durationMs": duration_ms,
            "netWpm": net_wpm,
            "rawWpm": raw_wpm,
            "accuracy": round(test_acc, 1),
            "consistency": 92.5,
            "correctChars": correct_chars,
            "incorrectChars": uncorrected,
            "extraChars": 0,
            "uncorrectedErrors": uncorrected,
            "correctedErrors": corrected,
            "totalKeystrokes": keystrokes,
            "perSecondWpm": [net_wpm] * 10,
            "appVersion": "1.0.0",
            "keyStats": test_keys,
            "confusions": [("e", "r", 2), ("t", "y", 1)],
            "wordErrors": [("the", 2), ("quick", 1)]
        })

    # Calculations for expected aggregate analytics:
    # 1. Total tests = 42
    total_tests = len(tests)
    # 2. Personal best = max netWpm = 127.0
    pb_wpm = max(wpm_list)
    # 3. Last 10 avg net WPM
    last_10_avg_wpm = round(sum(wpm_list[-10:]) / 10.0, 1)
    # 4. Total duration seconds
    total_duration_seconds = sum_duration_ms // 1000
    # 5. Pooled accuracy:
    # pooledAcc = (1.0 - (sum_uncorrected + 0.5 * sum_corrected) / sum_total_ks) * 100.0
    total_penalty = sum_uncorrected + (0.5 * sum_corrected)
    pooled_accuracy = round((1.0 - (total_penalty / sum_total_ks)) * 100.0, 1)
    mean_of_percentages = round(sum(per_test_accuracies) / len(per_test_accuracies), 1)
    
    print(f"Mathematical Proof:")
    print(f"  Pooled Accuracy:       {pooled_accuracy}%")
    print(f"  Mean of Percentages:   {mean_of_percentages}%")
    assert abs(pooled_accuracy - mean_of_percentages) > 1.0, "Pooled accuracy must differ significantly from mean of percentages!"

    # 6. Streaks
    sorted_unique_days = sorted(daily_counts.keys())
    streak = 1
    longest_streak = 1
    for j in range(1, len(sorted_unique_days)):
        d1 = datetime.strptime(sorted_unique_days[j - 1], "%Y-%m-%d")
        d2 = datetime.strptime(sorted_unique_days[j], "%Y-%m-%d")
        if (d2 - d1).days == 1:
            streak += 1
        else:
            streak = 1
        if streak > longest_streak:
            longest_streak = streak

    # 7. Key error rates
    # Key 'e': attempts = 42 * 30 = 1260, errors = 42 * 3 = 126, rate = 10.0%
    # Key 't': attempts = 42 * 20 = 840, errors = 42 * 2 = 84, rate = 10.0%
    # Key 'q': attempts = 3, errors = 3. EXCLUDED from minimum-sample ranking (threshold = 10)
    key_analytics = {}
    for k, v in key_stats_map.items():
        err_rate = round((v["errors"] / v["attempts"]) * 100.0, 1) if v["attempts"] > 0 else 0.0
        avg_fl = round(v["flight_ms_sum"] / v["flight_n"], 1) if v["flight_n"] > 0 else 0.0
        key_analytics[k] = {
            "attempts": v["attempts"],
            "errors": v["errors"],
            "errorRate": err_rate,
            "avgFlightMs": avg_fl,
            "meetsThreshold": v["attempts"] >= 10
        }

    # Top confusions
    top_confusions = [
        {"expected": k[0], "typed": k[1], "count": cnt}
        for k, cnt in sorted(confusions_map.items(), key=lambda x: x[1], reverse=True)
    ]
    
    # Top word errors
    top_words = [
        {"word": w, "count": cnt}
        for w, cnt in sorted(word_errors_map.items(), key=lambda x: x[1], reverse=True)
    ]

    expected_output = {
        "datasetSize": total_tests,
        "modesCount": len(modes),
        "tzOffsets": tz_offsets,
        "overview": {
            "totalTests": total_tests,
            "personalBestWpm": pb_wpm,
            "avgLast10NetWpm": last_10_avg_wpm,
            "totalDurationSeconds": total_duration_seconds,
            "pooledAccuracy": pooled_accuracy,
            "meanOfPercentages": mean_of_percentages,
            "longestStreak": longest_streak
        },
        "dailyBuckets": daily_counts,
        "keyStats": key_analytics,
        "topConfusions": top_confusions,
        "mostMistypedWords": top_words,
        "tests": tests
    }

    out_path = os.path.join(os.path.dirname(__file__), "..", "tests", "fixtures", "golden_analytics_expected.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(expected_output, f, indent=2)

    print(f"Generated golden fixture with {total_tests} tests at: {out_path}")
    print(f"Summary: PB={pb_wpm}, Last10Avg={last_10_avg_wpm}, PooledAcc={pooled_accuracy}%, Days={len(daily_counts)}")

if __name__ == "__main__":
    main()
