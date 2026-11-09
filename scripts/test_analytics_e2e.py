#!/usr/bin/env python3
"""End-to-end check for the three Account Analytics panels.

Simulates the exact payload TypingArena.tsx -> page.tsx emits, posts it to
POST /api/accounts/tests, then reads back GET /api/accounts/analytics (the
endpoint frontend/src/app/account/page.tsx uses) and asserts:

  * KEYBOARD ERROR HEATMAP  -> non-zero error rate on the mistyped target key
  * TOP LETTER CONFUSIONS   -> expected -> actual pairs with count > 0
  * MOST-MISTYPED WORDS     -> the words where typos happened

Two cases, because a corrected typo and a left-in typo flow through different
paths:
  A: three typos, all fixed with Backspace
  B: typos left uncorrected in the final text

Usage: python3 scripts/test_analytics_e2e.py [--base http://127.0.0.1:PORT]
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request


class Api:
    def __init__(self, base: str):
        self.base = base.rstrip("/")
        self.token = ""

    def request(self, method: str, path: str, payload=None):
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if self.token:
            req.add_header("X-TypeX-Token", self.token)
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode()
            raise RuntimeError(f"{method} {path} -> {exc.code}: {body[:400]}") from None


def bootstrap(api: Api) -> int:
    api.token = api.request("GET", "/api/accounts/bootstrap")["token"]
    # Unique name per run: the dev database persists profiles between runs and
    # the endpoint rejects duplicates.
    import time as _time

    created = api.request(
        "POST",
        "/api/accounts/profiles",
        {"name": f"analytics-e2e-{int(_time.time() * 1000) % 1000000}", "avatar": "default"},
    )
    profile_id = created.get("profileId") or created.get("id")
    if not profile_id:
        profiles = api.request("GET", "/api/accounts/profiles")
        profile_id = profiles["profiles"][-1]["id"]
    return int(profile_id)


def build_case_a() -> dict:
    """Three typos, every one fixed with Backspace.

    Target text: "the quick brown"
    Typed history: "thw"<bs>"the " | "quixk"<bs><bs>"ck " | "broen"<bs>"wn"
    Final text is perfect, so a final-text-only implementation sees zero errors.
    """
    t = [1_700_000_000_000]

    def key(k: str, expected: str | None, correct: bool, word: str = ""):
        entry = {"key": k, "time": t[0], "word": word}
        if expected is not None:
            entry["expected"] = expected
            entry["correct"] = correct
        t[0] += 90
        return entry

    log = [
        key("t", "t", True, "the"),
        key("h", "h", True, "the"),
        key("w", "e", False, "the"),      # typo 1: expected 'e', typed 'w'
        key("Backspace", None, True, "the"),
        key("e", "e", True, "the"),
        key(" ", " ", True, "the"),
        key("q", "q", True, "quick"),
        key("u", "u", True, "quick"),
        key("x", "i", False, "quick"),    # typo 2: expected 'i', typed 'x'
        key("Backspace", None, True, "quick"),
        key("Backspace", None, True, "quick"),
        key("i", "i", True, "quick"),
        key("c", "c", True, "quick"),
        key("k", "k", True, "quick"),
        key(" ", " ", True, "quick"),
        key("b", "b", True, "brown"),
        key("r", "r", True, "brown"),
        key("o", "o", True, "brown"),
        key("e", "w", False, "brown"),    # typo 3: expected 'w', typed 'e'
        key("Backspace", None, True, "brown"),
        key("w", "w", True, "brown"),
        key("n", "n", True, "brown"),
    ]

    words = [
        {"original": "the", "typed": "the"},
        {"original": "quick", "typed": "quick"},
        {"original": "brown", "typed": "brown"},
    ]
    return {
        "name": "A_corrected",
        "log": log,
        "words": words,
        "correct": 17,             # 13 letters + 2 spaces... final text is clean
        "incorrect": 0,
        "corrected": 3,
        "expect_keys": {"e": 1, "i": 1, "w": 1},
        "expect_confusions": {("e", "w"), ("i", "x"), ("w", "e")},
        "expect_words": {"the", "quick", "brown"},
    }


def build_case_b() -> dict:
    """Typos left uncorrected, mimicking what the frontend emits for them.

    Final text is "teh qick brown": 'the' is still wrong and 'quick' lost a 'u'.
    """
    t = [1_700_000_000_000]

    def key(k: str, expected: str | None, correct: bool, word: str = ""):
        entry = {"key": k, "time": t[0], "word": word}
        if expected is not None:
            entry["expected"] = expected
            entry["correct"] = correct
        t[0] += 90
        return entry

    log = [
        key("t", "t", True, "the"),
        key("e", "h", False, "the"),      # left in: expected 'h', typed 'e'
        key("h", "e", False, "the"),      # left in: expected 'e', typed 'h'
        key(" ", " ", True, "the"),
        key("q", "q", True, "quick"),
        key("i", "u", False, "quick"),    # left in: expected 'u', typed 'i'
        key("c", "i", False, "quick"),    # left in: expected 'i', typed 'c'
        key("c", "c", True, "quick"),
        key("k", "k", True, "quick"),
        key(" ", " ", True, "quick"),
        key("b", "b", True, "brown"),
        key("r", "r", True, "brown"),
        key("o", "o", True, "brown"),
        key("w", "w", True, "brown"),
        key("n", "n", True, "brown"),
    ]

    words = [
        {"original": "the", "typed": "teh"},
        {"original": "quick", "typed": "qick"},
        {"original": "brown", "typed": "brown"},
    ]
    return {
        "name": "B_uncorrected",
        "log": log,
        "words": words,
        "correct": 13,
        "incorrect": 2,
        "corrected": 0,
        "expect_keys": {"h": 1, "e": 1, "u": 1, "i": 1},
        "expect_confusions": {("h", "e"), ("e", "h"), ("u", "i"), ("i", "c")},
        "expect_words": {"the", "quick"},
    }


def submit(api: Api, profile_id: int, case: dict, mode: str):
    """POST /api/accounts/tests with the payload page.tsx forwards."""
    confusions = []
    seen = {}
    for e in case["log"]:
        exp = e.get("expected")
        if exp and e.get("correct") is False:
            pair = (exp, e["key"])
            seen[pair] = seen.get(pair, 0) + 1
    for (exp, act), cnt in seen.items():
        confusions.append({"expected": exp, "actual": act, "count": cnt})

    word_errors = [
        {"word": w["original"], "count": 1}
        for w in case["words"]
        if w["original"] != w["typed"]
    ]

    payload = {
        "profileId": profile_id,
        "mode": mode,
        "tier": "english_1k",
        "config": json.dumps({"duration": 0, "wordCount": len(case["words"]), "tier": "english_1k"}),
        "durationSeconds": 30,
        "durationMs": 30000,
        "netWpm": 0,
        "rawWpm": 0,
        "accuracy": 0,
        "consistency": 100,
        "correctChars": case["correct"],
        "incorrectChars": case["incorrect"],
        "extraChars": 0,
        "uncorrectedErrors": case["incorrect"],
        "correctedErrors": case["corrected"],
        "totalKeystrokes": len(case["log"]),
        "finalCharsTyped": sum(len(w["typed"]) for w in case["words"]),
        "perSecondWpm": [10] * 30,
        "keystrokesLog": case["log"],
        "wordResults": case["words"],
        "confusions": confusions,
        "wordErrors": word_errors,
        "startedAt": 1_700_000_000_000,
        "tzOffsetMin": 0,
    }
    return api.request("POST", "/api/accounts/tests", payload)


def read_analytics(api: Api, profile_id: int):
    """The exact GET the account page performs."""
    return api.request("GET", f"/api/accounts/analytics?profileId={profile_id}")


def assert_panel(case: dict, analytics: dict, failures: list[str]):
    name = case["name"]
    print(f"\n--- Case {name} ---")

    key_stats = {str(k["key"]).lower(): k for k in analytics.get("keyStats") or []}
    print("  heatmap:")
    for key, want in sorted(case["expect_keys"].items()):
        st = key_stats.get(key.lower())
        if not st:
            failures.append(f"[{name}] heatmap: key '{key}' missing entirely")
            print(f"    {key}: MISSING")
            continue
        attempts = int(st.get("attempts", 0))
        errors = int(st.get("errors", 0))
        rate = float(st.get("errorRate", 0.0))
        ok = errors >= want and attempts > 0 and rate > 0
        print(
            f"    {key}: attempts={attempts} errors={errors} rate={rate}% "
            f"{'OK' if ok else 'FAIL'}"
        )
        if not ok:
            failures.append(
                f"[{name}] heatmap: key '{key}' expected errors>={want} and rate>0, "
                f"got errors={errors} rate={rate}"
            )

    confusions = {
        (str(c["expected"]).lower(), str(c["typed"]).lower())
        for c in analytics.get("confusions") or []
        if int(c.get("count", 0)) > 0
    }
    print(f"  confusions: {sorted(confusions) or 'NONE'}")
    for pair in sorted(case["expect_confusions"]):
        want = (pair[0].lower(), pair[1].lower())
        if want not in confusions:
            failures.append(f"[{name}] confusions: missing {want[0]} -> {want[1]}")
            print(f"    {want[0]} -> {want[1]}: MISSING")
        else:
            print(f"    {want[0]} -> {want[1]}: OK")

    word_errors = {
        str(w["word"]).lower(): int(w.get("count", 0))
        for w in analytics.get("wordErrors") or []
    }
    print(f"  wordErrors: {word_errors or 'NONE'}")
    for word in sorted(case["expect_words"]):
        got = word_errors.get(word.lower(), 0)
        if got <= 0:
            failures.append(f"[{name}] wordErrors: missing '{word}'")
            print(f"    {word}: MISSING")
        else:
            print(f"    {word}: count={got} OK")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8080")
    args = ap.parse_args()

    api = Api(args.base)
    health = api.request("GET", "/api/health")
    print(f"backend: {health.get('service')} {health.get('status')} ({args.base})")

    profile_id = bootstrap(api)
    print(f"profile: {profile_id}")

    failures: list[str] = []
    for case, mode in ((build_case_a(), "words"), (build_case_b(), "words")):
        saved = submit(api, profile_id, case, mode)
        print(f"\nposted {case['name']}: testId={saved.get('testId')} status={saved.get('status')}")
        analytics = read_analytics(api, profile_id)
        assert_panel(case, analytics, failures)

    print()
    if failures:
        print(f"FAIL: {len(failures)} assertion(s) failed.")
        for f in failures:
            print("  -", f)
        return 1
    print("PASS: heatmap, confusions and word errors populated for both cases.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
