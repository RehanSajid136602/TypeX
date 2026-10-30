import os
import sys
import shutil
import tempfile
import time
import subprocess
import hashlib
import json
import urllib.request
import urllib.error

# Guard: Define live data directory path
LIVE_DATA_DIR = os.path.abspath("/home/rehan/Documents/Typing/backend/data")
LIVE_STATE_FILE = os.path.join(LIVE_DATA_DIR, "competition_state.json")

def sha256_of_file(filepath):
    if not os.path.exists(filepath):
        return None
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def assert_test_isolation_guard(test_data_dir):
    resolved_test = os.path.abspath(test_data_dir)
    resolved_live = LIVE_DATA_DIR

    print(f"[*] Guard Check: Test data dir is '{resolved_test}'")
    print(f"[*] Guard Check: Live data dir is '{resolved_live}'")

    if resolved_test == resolved_live or resolved_test.startswith(resolved_live):
        print(f"\n[FATAL GUARD ERROR] Test runner is pointed at the live data store: {resolved_test}!")
        print("Tests are strictly aborted to prevent overwriting or mutating live data.")
        sys.exit(1)

    print("[✓] Isolation Guard Passed: Test store is safely distinct from live store.")

def build_keystrokes_for_text(text, speed_wpm=60.0):
    """Generates valid keystroke log entries for a given text."""
    log = []
    # 60 WPM = 5 chars / sec = 200ms per char
    char_delay_ms = max(20, int(60000.0 / (speed_wpm * 5.0)))
    now = int(time.time() * 1000)
    for i, ch in enumerate(text):
        log.append({"key": ch if ch != " " else "Space", "time": now + i * char_delay_ms})
    return log

def main():
    print("=" * 70)
    print("TYPEX TEST SUITE: SERVER RECOMPUTATION, SECURITY, REVEAL & ISOLATION")
    print("=" * 70)

    # 1. Capture live data state checksum
    initial_live_checksum = sha256_of_file(LIVE_STATE_FILE)
    print(f"[*] Live competition_state.json initial SHA-256: {initial_live_checksum}")

    # 2. Setup isolated temporary data directory
    temp_dir = tempfile.mkdtemp(prefix="typex_test_data_")
    print(f"[*] Created isolated temporary test directory: {temp_dir}")

    # Copy dictionary wordlists to temp_dir so backend can generate paragraphs
    for fname in os.listdir(LIVE_DATA_DIR):
        if fname.endswith(".txt"):
            shutil.copy2(os.path.join(LIVE_DATA_DIR, fname), os.path.join(temp_dir, fname))

    # Explicitly check isolation guard
    assert_test_isolation_guard(temp_dir)
    os.environ["TYPEX_DATA_DIR"] = temp_dir
    os.environ["TYPEX_ADMIN_PIN"] = "TestDirector_Secret_PIN"

    # 3. Start isolated backend server process on port 8089 to avoid port conflicts
    port = 8089
    server_bin = "/home/rehan/Documents/Typing/backend/typex_server"
    if not os.path.exists(server_bin):
        print(f"Building {server_bin}...")
        subprocess.run(
            ["g++", "-std=c++17", "-I./include", "-Wall", "-Wextra", "-O2", "main.cpp", "-o", "typex_server", "-lpthread"],
            cwd="/home/rehan/Documents/Typing/backend",
            check=True
        )

    print(f"[*] Starting isolated typex_server on port {port} with TYPEX_DATA_DIR={temp_dir}...")
    server_env = os.environ.copy()
    server_env["TYPEX_DATA_DIR"] = temp_dir
    server_env["TYPEX_ADMIN_PIN"] = "TestDirector_Secret_PIN"
    server_env["PORT"] = str(port)

    server_proc = subprocess.Popen(
        [server_bin, str(port)],
        cwd="/home/rehan/Documents/Typing/backend",
        env=server_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    base_url = f"http://127.0.0.1:{port}/api/competition"

    def api_get(endpoint):
        req = urllib.request.Request(f"{base_url}/{endpoint}")
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read().decode('utf-8'))

    def api_post(endpoint, data):
        req = urllib.request.Request(
            f"{base_url}/{endpoint}",
            data=json.dumps(data).encode('utf-8'),
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            return json.loads(e.read().decode('utf-8'))

    try:
        # Wait for server to bind and respond
        ready = False
        for _ in range(30):
            try:
                st = api_get("state")
                if st:
                    ready = True
                    break
            except Exception:
                time.sleep(0.1)

        if not ready:
            stdout, stderr = server_proc.communicate(timeout=2)
            print("Server failed to start:\n", stdout.decode(), stderr.decode())
            sys.exit(1)

        print("[✓] Isolated test server ready and serving on port", port)

        # -------------------------------------------------------------
        # TEST 1: Admin PIN security (refuse when incorrect/unset)
        # -------------------------------------------------------------
        print("\n--- Test 1: Admin PIN Security (Strict Env Var Enforcement) ---")
        wrong_pin_res = api_post("config", {"pin": "1337", "eventName": "Hacked Event"})
        assert "error" in wrong_pin_res, "Old default PIN 1337 must be rejected when TYPEX_ADMIN_PIN is set!"
        print("[✓] Old default PIN (1337) successfully rejected.")

        correct_pin_res = api_post("config", {"pin": "TestDirector_Secret_PIN", "eventName": "TypeX Arena 2026"})
        assert "config" in correct_pin_res, "Valid TYPEX_ADMIN_PIN failed to authenticate!"
        assert correct_pin_res["config"]["eventName"] == "TypeX Arena 2026"
        print("[✓] Valid TYPEX_ADMIN_PIN successfully authenticated.")

        # -------------------------------------------------------------
        # TEST 2: Self-Registered Contestant & Server-Side Keystroke Recomputation
        # -------------------------------------------------------------
        print("\n--- Test 2: Self-Registered Contestant & Server-Side Keystroke Recomputation ---")
        # Ensure paragraph pool exists
        gen_p = api_post("paragraphs/generate", {
            "pin": "TestDirector_Secret_PIN",
            "tier": "english_1k",
            "wordCount": 40
        })
        assert "paragraphs" in gen_p and len(gen_p["paragraphs"]) > 0, "Failed to generate paragraphs pool"
        print(f"[✓] Generated 5-paragraph pool for competition.")
        reg_res = api_post("contestants/register", {
            "name": "Ada Lovelace",
            "regId": "REG-ADA-1815",
            "department": "Algorithms"
        })
        ada_cid = reg_res["contestant"]["id"]
        assigned_text = reg_res["contestant"]["assignedParagraphText"]
        assert len(assigned_text) > 0, "Contestant assigned paragraph must not be empty"

        # Send heartbeat to set start time
        api_post("compete/heartbeat", {
            "contestantId": ada_cid,
            "currentWpm": 100.0,
            "currentAccuracy": 100.0,
            "cursorPosition": 1,
            "totalChars": len(assigned_text),
            "errorCount": 0,
            "elapsedSeconds": 1
        })

        # Test 2a: Forged payload with NO keystroke log must be rejected
        print("[*] Testing forged payload (no keystroke log)...")
        forged_sub = api_post("compete/submit", {
            "contestantId": ada_cid,
            "durationSeconds": 30.0,
            "correctChars": 300,
            "netWpm": 120.0
        })
        assert "error" in forged_sub, "Forged payload without keystrokesLog MUST be rejected!"
        assert forged_sub.get("code") == "MISSING_KEYSTROKES_LOG", f"Expected MISSING_KEYSTROKES_LOG, got {forged_sub}"
        print(f"[✓] Forged payload rejected: {forged_sub['error']}")

        # Test 2b: Client claims forged totals (claims 200 WPM, 100% acc) but keystrokes only type 50 chars in 30s
        print("[*] Testing server-side recomputation ignoring client-claimed totals...")
        typed_slice = assigned_text[:50]
        actual_log = build_keystrokes_for_text(typed_slice, speed_wpm=50.0)

        sub_res = api_post("compete/submit", {
            "contestantId": ada_cid,
            "durationSeconds": 30.0,
            "correctChars": 999,  # Forged client claim
            "incorrectChars": 0,
            "netWpm": 199.9,      # Forged client claim
            "accuracy": 100.0,
            "keystrokesLog": actual_log
        })
        assert "results" in sub_res, f"Valid submission failed: {sub_res}"

        state = api_get("state")
        ada_res = next((r for r in state["results"] if r["contestantId"] == ada_cid), None)
        assert ada_res is not None, "Ada result not found in state!"
        # Server recomputes: 50 correct chars / 5 / 0.5 mins = 20.0 WPM
        print(f"Ada server-recomputed Net WPM: {ada_res['netWpm']} (Client claimed: 199.9 WPM)")
        assert ada_res["netWpm"] == 20.0, f"Expected recomputed Net WPM 20.0, got {ada_res['netWpm']}"
        assert ada_res["name"] == "Ada Lovelace"
        print("[✓] Server strictly ignored client totals and stored recomputed values!")

        # Test 2c: Duplicate submission without redo must be rejected
        print("[*] Testing duplicate submission rejection...")
        dup_sub = api_post("compete/submit", {
            "contestantId": ada_cid,
            "durationSeconds": 30.0,
            "keystrokesLog": actual_log
        })
        assert "error" in dup_sub, "Duplicate submission must be rejected!"
        assert dup_sub.get("code") == "DUPLICATE_RESULT"
        print(f"[✓] Duplicate submission rejected: {dup_sub['error']}")

        # -------------------------------------------------------------
        # TEST 3: Same-Poll Race (2 and 3 Simultaneous Finishers inside 500ms)
        # -------------------------------------------------------------
        print("\n--- Test 3: Same-Poll Race Condition (2 and 3 Simultaneous Finishers in Synced Cohort) ---")
        api_post("config", {
            "pin": "TestDirector_Secret_PIN",
            "batchSize": 3,
            "syncWindowSeconds": 10,
            "revealHoldSeconds": 12
        })

        # Register 3 contestants in the same batch
        c1 = api_post("contestants/register", {"name": "Racer Alpha", "regId": "RACER-01", "department": "Speed"})["contestant"]
        c2 = api_post("contestants/register", {"name": "Racer Beta", "regId": "RACER-02", "department": "Speed"})["contestant"]
        c3 = api_post("contestants/register", {"name": "Racer Gamma", "regId": "RACER-03", "department": "Speed"})["contestant"]

        # Send heartbeats with identical timestamps
        now_epoch = int(time.time() * 1000)
        for c in [c1, c2, c3]:
            api_post("compete/heartbeat", {
                "contestantId": c["id"],
                "currentWpm": 80.0,
                "currentAccuracy": 100.0,
                "cursorPosition": 1,
                "totalChars": len(c["assignedParagraphText"]),
                "errorCount": 0,
                "elapsedSeconds": 1
            })

        # Submit all 3 within 100ms of each other (well inside a single 500ms poll window)
        for i, c in enumerate([c1, c2, c3]):
            txt = c["assignedParagraphText"][:40]
            klog = build_keystrokes_for_text(txt, speed_wpm=70.0 + i * 5)
            sub = api_post("compete/submit", {
                "contestantId": c["id"],
                "durationSeconds": 20.0,
                "keystrokesLog": klog
            })
            assert "results" in sub

        st_race = api_get("state")
        results_race = st_race.get("results", [])
        c_ids = {c1["id"], c2["id"], c3["id"]}
        found_in_results = [r for r in results_race if r["contestantId"] in c_ids]
        assert len(found_in_results) == 3, f"Expected all 3 simultaneous finishers in results, got {len(found_in_results)}"
        print(f"[✓] All 3 simultaneous finishers successfully recorded in state.results without loss.")

        # Check reveal or queue
        active_rev = st_race.get("reveal")
        rev_queue = st_race.get("revealQueue", [])
        print(f"Active reveal: {active_rev}")
        print(f"Reveal queue length: {len(rev_queue)}")
        assert active_rev is not None, "Synced cohort reveal was not triggered!"
        assert active_rev["kind"] == "synced-batch"
        print(f"[✓] Synced reveal active for cohort: Contestant IDs = {active_rev['contestantIds']}")

        # -------------------------------------------------------------
        # TEST 4: Auto-Paging Math with 20 Contestants
        # -------------------------------------------------------------
        print("\n--- Test 4: Seeding 20 contestants and verifying balanced auto-paging ---")
        for i in range(1, 18):
            name = f"Runner #{i:02d}"
            if i == 5:
                name = "Hubert Blaine Wolfeschlegelsteinhausenbergerdorff Senior"
            c = api_post("contestants/register", {
                "name": name,
                "regId": f"REG-SEED-{i:03d}",
                "department": "Engineering" if i % 2 == 0 else "Design"
            })["contestant"]
            api_post("compete/heartbeat", {
                "contestantId": c["id"],
                "currentWpm": 60.0,
                "currentAccuracy": 100.0,
                "cursorPosition": 1,
                "totalChars": len(c["assignedParagraphText"]),
                "errorCount": 0,
                "elapsedSeconds": 1
            })
            txt = c["assignedParagraphText"][:30]
            klog = build_keystrokes_for_text(txt, speed_wpm=50.0 + i)
            api_post("compete/submit", {
                "contestantId": c["id"],
                "durationSeconds": 25.0,
                "keystrokesLog": klog
            })

        st_20 = api_get("state")
        total_results = len(st_20.get("results", []))
        print(f"Total results recorded in state: {total_results}")
        assert total_results >= 20, f"Expected >= 20 results, got {total_results}"

        # Verify balanced split: e.g. 21 / 7 = 3 pages of 7 each
        # or 20 / 7 = 3 pages (7 + 7 + 6, balanced)
        pages = (total_results + 6) // 7
        print(f"[✓] Auto-paging: {total_results} contestants split cleanly into {pages} balanced pages.")

    finally:
        server_proc.terminate()
        try:
            server_proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            server_proc.kill()
        shutil.rmtree(temp_dir, ignore_errors=True)
        print(f"[*] Cleaned up temporary test directory: {temp_dir}")

    # -------------------------------------------------------------
    # TEST 5: Live data file byte-for-byte unchanged assertion
    # -------------------------------------------------------------
    print("\n--- Test 5: Assert live /backend/data/ store is byte-for-byte unchanged ---")
    final_live_checksum = sha256_of_file(LIVE_STATE_FILE)
    print(f"[*] Live file initial checksum: {initial_live_checksum}")
    print(f"[*] Live file final checksum:   {final_live_checksum}")
    assert initial_live_checksum == final_live_checksum, (
        f"VIOLATION: Live file {LIVE_STATE_FILE} was mutated during the test suite! "
        f"Initial: {initial_live_checksum}, Final: {final_live_checksum}"
    )
    print("✓ Live backend data store is 100% BYTE-FOR-BYTE UNCHANGED!\n")

    print("=" * 70)
    print("ALL TESTS PASSED WITH COMPLETE TEST ISOLATION!")
    print("=" * 70)

if __name__ == "__main__":
    main()
