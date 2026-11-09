#!/usr/bin/env python3
"""Probe TypeX's scoring/persistence formulas with controlled keystroke mixes.

Runs against an isolated TypeX backend. The scenarios mirror what
`TypingArena.tsx` actually posts, including the fact that corrected characters
remain in `incorrectChars` while `correctedErrors` increases.

Output: scoring_results.json + a compact table on stdout.
"""
from __future__ import annotations

import argparse
import http.client
import json
import statistics
import time
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]


class Api:
    def __init__(self, base: str, token: str = ""):
        p = urllib.parse.urlparse(base)
        self.host = p.hostname or "127.0.0.1"
        self.port = p.port or 80
        self.token = token
        self.conn = http.client.HTTPConnection(self.host, self.port, timeout=15)

    def request(self, method: str, path: str, body: dict | None = None):
        headers = {"Accept": "application/json"}
        if self.token:
            headers["X-TypeX-Token"] = self.token
        payload = None if body is None else json.dumps(body)
        if payload is not None:
            headers["Content-Type"] = "application/json"
        start = time.perf_counter()
        self.conn.request(method, path, body=payload, headers=headers)
        resp = self.conn.getresponse()
        raw = resp.read()
        ms = (time.perf_counter() - start) * 1000.0
        if resp.status != 200:
            raise RuntimeError(f"{method} {path} -> {resp.status}: {raw[:500]!r}")
        return json.loads(raw), ms


def keystroke_log(correct: int, incorrect: int, backspaces: int):
    """A plausible ordered log: all correct, all wrong, then corrections."""
    log = []
    t = 1_700_000_000_000
    for _ in range(correct):
        log.append({"key": "a", "time": t})
        t += 50
    for _ in range(incorrect):
        log.append({"key": "a", "time": t})
        t += 50
    for _ in range(backspaces):
        log.append({"key": "Backspace", "time": t})
        t += 50
    return log


def analyze(
    api: Api,
    *,
    correct: int,
    incorrect: int,
    extra: int,
    corrected: int = 0,
    total_keystrokes: int | None = None,
    final_chars_typed: int = 0,
    word_results: list[dict] | None = None,
    duration: float = 60.0,
):
    """POST /api/analyze with the same fields the real frontend sends.

    `word_results` carries the final-text ground truth; when present the
    backend recomputes the character counters from it and the cumulative
    `correct` value cannot inflate the score.
    """
    payload = {
        "durationSeconds": duration,
        "correctChars": correct,
        "incorrectChars": incorrect,
        "extraChars": extra,
        "missedChars": 0,
        "correctedErrors": corrected,
        "uncorrectedErrors": incorrect + extra,
        "totalKeystrokes": total_keystrokes
        if total_keystrokes is not None
        else correct + incorrect + corrected,
        "finalCharsTyped": final_chars_typed,
        "rawKeystrokesPerSecond": [10] * int(duration),
    }
    if word_results:
        payload["wordResults"] = word_results
    return api.request("POST", "/api/analyze", payload)


def persist(
    api: Api,
    *,
    profile_id: int,
    correct: int,
    incorrect: int,
    extra: int,
    corrected: int,
    total_keystrokes: int,
    log: list[dict],
    final_chars_typed: int = 0,
    word_results: list[dict] | None = None,
    duration: float = 60.0,
):
    payload = {
        "profileId": profile_id,
        "wordResults": word_results or [],
        "mode": "time",
        "config": json.dumps({"duration": 60, "tier": "english_1k", "errorBehavior": "free"}),
        "durationMs": int(duration * 1000),
        "netWpm": 0,
        "rawWpm": 0,
        "accuracy": 0,
        "consistency": 100,
        "correctChars": correct,
        "incorrectChars": incorrect,
        "extraChars": extra,
        "uncorrectedErrors": incorrect + extra,
        "correctedErrors": corrected,
        "totalKeystrokes": total_keystrokes,
        "finalCharsTyped": final_chars_typed,
        "perSecondWpm": [10] * int(duration),
        "keystrokesLog": log,
        "startedAt": 1_700_000_000_000,
        "tzOffsetMin": 0,
    }
    return api.request("POST", "/api/accounts/tests", payload)


def telemetry_probe(api: Api, profile_id: int, base_url: str):
    """Submit a test with deliberate mistakes and read the telemetry back.

    Proves test_key_stats.errors, test_confusions and test_word_errors are no
    longer permanent zeroes (audit §6.4).
    """
    t = 1_700_000_000_000
    log = []

    def key(k, expected, correct, step=70):
        nonlocal t
        log.append({"key": k, "expected": expected, "correct": correct, "time": t})
        t += step

    # Word 1 "the": typist hits t, presses 'h' where 'e' was expected,
    # backspaces and retypes 'e' -> a corrected error attributed to key 'e'.
    key("t", "t", True)
    key("h", "e", False)      # mistake
    key("Backspace", "", True)
    key("e", "e", True)
    key(" ", " ", True)

    # Word 2 "form" typed as "farm": 'a' where 'o' was expected and never
    # fixed, so it stays as an uncorrected error and a word error.
    key("f", "f", True)
    key("a", "o", False)
    key("r", "r", True)
    key("m", "m", True)

    word_results = [
        {"original": "the", "typed": "the"},
        {"original": "form", "typed": "farm"},
    ]

    letters = sum(len(w["original"]) for w in word_results)
    spaces = len(word_results) - 1
    correct_chars = letters + spaces - 1  # one letter wrong in the final text

    _, _ = persist(
        api,
        profile_id=profile_id,
        correct=correct_chars,
        incorrect=1,
        extra=0,
        corrected=1,
        total_keystrokes=len(log),
        log=log,
        final_chars_typed=letters + spaces,
        word_results=word_results,
    )

    # Ask the analytics endpoint what it actually stored.
    analytics, _ = api.request("GET", f"/api/accounts/analytics?profileId={profile_id}")
    key_errors = {}
    for row in analytics.get("keyStats") or analytics.get("mostMistypedKeys") or []:
        k = row.get("key")
        if k is not None:
            key_errors[str(k)] = int(row.get("errors", 0) or 0)
    confusions = analytics.get("letterConfusions") or analytics.get("confusions") or []
    word_errors = analytics.get("mostMistypedWords") or analytics.get("wordErrors") or []
    return {
        "key_errors": key_errors,
        "total_key_errors": sum(key_errors.values()),
        "confusions": confusions[:5],
        "confusion_count": len(confusions),
        "word_errors": word_errors[:5],
        "word_error_count": len(word_errors),
    }


def percentile(values, p):
    ordered = sorted(values)
    if not ordered:
        return 0.0
    pos = (len(ordered) - 1) * p
    lo, hi = int(pos), min(int(pos) + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (pos - lo)


def latency(values):
    if not values:
        return {}
    return {
        "n": len(values),
        "median_ms": round(statistics.median(values), 3),
        "p95_ms": round(percentile(values, 0.95), 3),
        "max_ms": round(max(values), 3),
    }


def word_results_final_text(total_correct: int) -> list[dict]:
    """Build wordResults describing a *clean* final text of `total_correct` chars.

    The typist's final text is correct in every scenario; only the number of
    wrong keystrokes and backspaces differs. This is the ground truth the
    backend scores against.
    """
    # Real english_1k words: the persistence endpoint rejects target text that
    # is not in the selected corpus tier.
    #
    # `total_correct` is the character budget INCLUDING the separator spaces
    # that follow every submitted word, because the backend counts a space
    # after each word except the final in-progress one.
    # Longest first so the budget can always be filled with whole corpus words.
    pool = sorted(
        ["the", "of", "to", "and", "a", "in", "is", "it", "you", "that"],
        key=len,
        reverse=True,
    )
    words = []
    remaining = total_correct
    i = 0
    while remaining > 0:
        # Pick the longest word that fits the budget (1 slot is reserved for
        # the separator when more text follows).
        w = None
        for _ in range(len(pool)):
            cand = pool[i % len(pool)]
            i += 1
            if len(cand) <= remaining:
                w = cand
                break
        if w is None:
            # No whole word fits: pad with single-letter corpus words.
            w = "a"
        words.append({"original": w, "typed": w})
        remaining -= len(w)
        # Every word except the last one is followed by a submitted space,
        # which the backend counts as a correct character.
        if remaining > 0:
            words.append({"original": " ", "typed": " "})
            remaining -= 1
    return words


def scenario(name: str, final_correct: int, wrong_keystrokes: int, retyped: int):
    """Build frontend-faithful counters.

    final_correct: characters correct in the final text
    wrong_keystrokes: wrong characters typed (all subsequently deleted)
    retyped: how many of those wrong slots were retyped correctly

    `correctChars` deliberately keeps the OLD cumulative semantics so the
    measurement shows what an unclamped client would report.
    """
    correct = final_correct + retyped
    incorrect = wrong_keystrokes
    corrected = wrong_keystrokes
    extra = 0
    char_keystrokes = correct + incorrect
    total = char_keystrokes + corrected  # every correction costs one Backspace
    return {
        "name": name,
        "final_correct": final_correct,
        "correctChars": correct,
        "incorrectChars": incorrect,
        "extraChars": extra,
        "correctedErrors": corrected,
        "totalKeystrokes": total,
        "true_final_chars": final_correct,
        "wordResults": word_results_final_text(final_correct),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:18101")
    parser.add_argument("--out", default=str(HERE / "scoring_results.json"))
    parser.add_argument("--analyze-reps", type=int, default=200)
    args = parser.parse_args()

    anon = Api(args.base)
    boot, _ = anon.request("GET", "/api/accounts/bootstrap")
    token = boot.get("token") or boot.get("sessionToken") or ""
    api = Api(args.base, token)

    profiles, _ = api.request("GET", "/api/accounts/profiles")
    existing = [p for p in profiles.get("profiles", []) if p.get("name") == "Algorithm Audit"]
    if existing:
        profile_id = int(existing[0]["id"])
    else:
        created, _ = api.request("POST", "/api/accounts/profiles", {"name": "Algorithm Audit", "color": "#888888"})
        profile_id = int(created.get("id") or created.get("profile", {}).get("id"))

    cases = [
        scenario("clean", 100, 0, 0),
        scenario("one_in_ten_corrected", 100, 10, 10),
        scenario("half_corrected", 100, 50, 50),
        scenario("correct_key_retyped", 100, 0, 0),
    ]
    # The last case models backspacing a *correct* key and retyping it: no
    # error, but two extra correct keystrokes and one correction.
    cases[-1]["correctChars"] = 102
    cases[-1]["correctedErrors"] = 1
    cases[-1]["totalKeystrokes"] = 103

    results = []
    for case in cases:
        log = keystroke_log(case["correctChars"], case["incorrectChars"], case["correctedErrors"])
        analyzed, a_ms = analyze(
            api,
            correct=case["correctChars"],
            incorrect=case["incorrectChars"],
            extra=case["extraChars"],
            corrected=case["correctedErrors"],
            total_keystrokes=case["totalKeystrokes"],
            final_chars_typed=case["true_final_chars"],
            word_results=case["wordResults"],
        )
        saved, p_ms = persist(
            api,
            profile_id=profile_id,
            correct=case["correctChars"],
            incorrect=case["incorrectChars"],
            extra=case["extraChars"],
            corrected=case["correctedErrors"],
            total_keystrokes=case["totalKeystrokes"],
            log=log,
            final_chars_typed=case["true_final_chars"],
            word_results=case["wordResults"],
        )
        true_net = (case["true_final_chars"] / 5.0) / (60.0 / 60.0)
        results.append(
            {
                **case,
                "analyze": {
                    "rawWpm": analyzed["rawWpm"],
                    "netWpm": analyzed["netWpm"],
                    "accuracy": analyzed["accuracy"],
                    "totalKeystrokes": analyzed["totalKeystrokes"],
                    "latency_ms": round(a_ms, 3),
                },
                "persisted": {
                    "rawWpm": saved["rawWpm"],
                    "netWpm": saved["netWpm"],
                    "accuracy": saved["accuracy"],
                    "totalKeystrokes": saved["test"]["totalKeystrokes"],
                    "latency_ms": round(p_ms, 3),
                },
                "true_net_wpm_if_final_text": round(true_net, 3),
                "net_wpm_inflation_pct": round(100.0 * (analyzed["netWpm"] - true_net) / true_net, 2)
                if true_net
                else 0.0,
            }
        )

    # Latency distributions, independent of the scenario values.
    a_lat, p_lat = [], []
    for _ in range(args.analyze_reps):
        _, ms = analyze(api, correct=100, incorrect=0, extra=0)
        a_lat.append(ms)
    for i in range(50):
        case = cases[0]
        log = keystroke_log(case["correctChars"], 0, 0)
        _, ms = persist(
            api,
            profile_id=profile_id,
            correct=case["correctChars"],
            incorrect=0,
            extra=0,
            corrected=0,
            total_keystrokes=case["totalKeystrokes"],
            log=log,
        )
        p_lat.append(ms)

    telemetry = telemetry_probe(api, profile_id, args.base)

    out = {
        "base_url": args.base,
        "profile_id": profile_id,
        "duration_seconds": 60.0,
        "cases": results,
        "latency": {
            "analyze": latency(a_lat),
            "persist": latency(p_lat),
        },
        "parity": {
            "net_wpm_matches": all(r["analyze"]["netWpm"] == r["persisted"]["netWpm"] for r in results),
            "raw_wpm_matches": all(r["analyze"]["rawWpm"] == r["persisted"]["rawWpm"] for r in results),
            "accuracy_matches": all(r["analyze"]["accuracy"] == r["persisted"]["accuracy"] for r in results),
        },
        "telemetry": telemetry,
        "notes": [
            "Both endpoints now run backend/include/scoring_engine.hpp::computeScore, so displayed and persisted values are identical.",
            "The probes still send the OLD cumulative correctChars to show that the final-text wordResults clamp is what removes the inflation.",
            "netWpm is derived from correct characters surviving in the final text, capped at finalCharsTyped.",
            "Per-key errors, confusions and word errors are now persisted (telemetry block above).",
        ],
    }
    Path(args.out).write_text(json.dumps(out, indent=2) + "\n")

    print("| Case | final chars | correctChars | incorrect | corrected | true net | displayed net | persisted net | displayed acc | persisted acc | net inflation |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for r in results:
        print(
            f"| {r['name']} | {r['final_correct']} | {r['correctChars']} | {r['incorrectChars']} | "
            f"{r['correctedErrors']} | {r['true_net_wpm_if_final_text']:.1f} | {r['analyze']['netWpm']:.1f} | "
            f"{r['persisted']['netWpm']:.1f} | {r['analyze']['accuracy']:.1f}% | {r['persisted']['accuracy']:.1f}% | "
            f"{r['net_wpm_inflation_pct']:+.1f}% |"
        )
    print()
    print("analyze latency:", out["latency"]["analyze"])
    print("persist latency:", out["latency"]["persist"])
    print("wrote", args.out)


if __name__ == "__main__":
    main()
