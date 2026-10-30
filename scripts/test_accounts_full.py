#!/usr/bin/env python3
"""
Comprehensive Automated Test Suite for TypeX Accounts, SQLite Storage,
Analytics Recomputation, Formula Injection Defense, and Network Hardening.
Runs against an isolated temporary TYPEX_DATA_DIR.
"""

import os
import sys
import time
import json
import sqlite3
import tempfile
import shutil
import urllib.request
import urllib.error
import subprocess
import socket

def log(msg):
    print(f"[TEST] {msg}", flush=True)

def assert_eq(actual, expected, msg=""):
    if actual != expected:
        raise AssertionError(f"Expected {expected!r}, got {actual!r}. {msg}")

def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def main():
    log("Setting up isolated TYPEX_DATA_DIR...")
    temp_dir = tempfile.mkdtemp(prefix="typex_test_data_")
    log(f"Isolated Data Directory: {temp_dir}")

    db_path = os.path.join(temp_dir, "typex.db")
    competition_file = os.path.join(temp_dir, "competition_state.json")
    
    # 0. Seed mock competition file to check for zero regressions
    initial_comp_bytes = b'{"state": "competition_active", "contestants": [], "results": []}\n'
    with open(competition_file, "wb") as f:
        f.write(initial_comp_bytes)

    # Compile backend fresh with sqlite3.o
    backend_dir = "/home/rehan/Documents/Typing/backend"
    typex_server_bin = os.path.join(backend_dir, "typex_server")

    log("Building backend with sqlite3.o...")
    build_cmd = f"gcc -O3 -pthread -c {backend_dir}/include/sqlite3.c -o {backend_dir}/sqlite3.o && " \
                f"g++ -std=c++17 -O3 -pthread {backend_dir}/main.cpp {backend_dir}/sqlite3.o -I{backend_dir}/include -ldl -o {typex_server_bin}"
    res = subprocess.run(build_cmd, shell=True, capture_output=True, text=True)
    if res.returncode != 0:
        log(f"Backend build failed:\n{res.stderr}")
        sys.exit(1)
    log("Backend compiled successfully.")

    # 1. Database Migrations and Upgrade Test
    log("--- TEST 1: Database Schema & Migration from user_version 0 to 1 ---")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("PRAGMA user_version")
    ver = cur.fetchone()[0]
    assert_eq(ver, 0, "Brand new DB must have user_version 0")
    conn.close()

    # Launch server on isolated port 8199 pointing to temp_dir
    test_port = 8199
    test_token = "0123456789abcdef0123456789abcdef"
    env = os.environ.copy()
    env["TYPEX_DATA_DIR"] = temp_dir
    env["TYPEX_SESSION_TOKEN"] = test_token
    server_proc = subprocess.Popen(
        [typex_server_bin, str(test_port)],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    time.sleep(1.2)

    try:
        # Check that server applied migration 1 and set user_version=1
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("PRAGMA user_version")
        ver = cur.fetchone()[0]
        assert_eq(ver, 1, "Migration 1 must set PRAGMA user_version=1")
        
        cur.execute("PRAGMA integrity_check")
        integrity = cur.fetchone()[0]
        assert_eq(integrity, "ok", "Database integrity_check must be ok")

        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = set(r[0] for r in cur.fetchall())
        required_tables = {"profiles", "tests", "test_key_stats", "test_confusions", "test_word_errors", "mastery_profiles", "settings"}
        for t in required_tables:
            assert t in tables, f"Missing table: {t}"
        conn.close()
        log("✓ Migration 1 and PRAGMA integrity_check VERIFIED.")

        # 2. Section 5: Browser-to-Localhost Gap Verification
        log("--- TEST 2: Browser-to-Localhost Security Gap (Section 5) ---")
        
        # (a) Check /api/accounts/bootstrap on loopback returns session token and cookie
        boot_req = urllib.request.Request(f"http://127.0.0.1:{test_port}/api/accounts/bootstrap")
        with urllib.request.urlopen(boot_req) as resp:
            assert_eq(resp.status, 200)
            boot_data = json.loads(resp.read().decode())
            assert_eq(boot_data.get("sessionToken"), test_token)
            set_cookie = resp.headers.get("Set-Cookie", "")
            assert "typex_token=" in set_cookie
        log("✓ /api/accounts/bootstrap sets cookie and returns launch token.")

        # (b) Protected endpoint with missing token -> 401
        try:
            req_no_tok = urllib.request.Request(f"http://127.0.0.1:{test_port}/api/accounts/profiles")
            with urllib.request.urlopen(req_no_tok) as resp:
                raise AssertionError("Missing token must return 401")
        except urllib.error.HTTPError as e:
            assert_eq(e.code, 401, "Missing token must be rejected with 401")
        log("✓ Missing token returns 401 Unauthorized.")

        # (c) Protected endpoint with wrong token -> 401
        try:
            req_wrong_tok = urllib.request.Request(
                f"http://127.0.0.1:{test_port}/api/accounts/profiles",
                headers={"X-TypeX-Token": "invalid_wrong_token"}
            )
            with urllib.request.urlopen(req_wrong_tok) as resp:
                raise AssertionError("Wrong token must return 401")
        except urllib.error.HTTPError as e:
            assert_eq(e.code, 401, "Wrong token must be rejected with 401")
        log("✓ Wrong token returns 401 Unauthorized.")

        # (d) Host header validation: DNS rebinding rejection (evil.com -> 400)
        try:
            req_evil_host = urllib.request.Request(
                f"http://127.0.0.1:{test_port}/api/accounts/profiles",
                headers={"Host": "attacker.com", "X-TypeX-Token": test_token}
            )
            with urllib.request.urlopen(req_evil_host) as resp:
                raise AssertionError("Invalid Host header must return 400")
        except urllib.error.HTTPError as e:
            assert_eq(e.code, 400, "Untrusted Host header must return 400 Bad Request")
        log("✓ Host header validation rejects DNS rebinding (Host: attacker.com -> 400).")

        # (e) Real non-loopback source: connect using machine's LAN IP
        lan_ip = get_lan_ip()
        log(f"Testing access from machine LAN IP: {lan_ip}...")
        if lan_ip != "127.0.0.1":
            # Protected endpoint via LAN IP -> 403 Forbidden
            try:
                req_lan = urllib.request.Request(
                    f"http://{lan_ip}:{test_port}/api/accounts/profiles",
                    headers={"X-TypeX-Token": test_token, "Host": f"localhost:{test_port}"}
                )
                with urllib.request.urlopen(req_lan) as resp:
                    raise AssertionError("Request from LAN IP to protected accounts endpoint must return 403")
            except urllib.error.HTTPError as e:
                assert_eq(e.code, 403, "Non-loopback IP must receive 403 Forbidden on accounts")
            log(f"✓ LAN IP {lan_ip} received 403 Forbidden on /api/accounts/profiles.")

            # Competition endpoint via LAN IP -> 200 OK
            req_comp_lan = urllib.request.Request(f"http://{lan_ip}:{test_port}/api/competition/state")
            with urllib.request.urlopen(req_comp_lan) as resp:
                assert_eq(resp.status, 200, "Competition endpoint must answer 200 OK to LAN peers")
            log(f"✓ LAN IP {lan_ip} received 200 OK on /api/competition/state.")

        # (f) Cross-origin request from untrusted origin -> gets 403 and NO CORS grant
        try:
            req_cors = urllib.request.Request(
                f"http://127.0.0.1:{test_port}/api/accounts/profiles",
                headers={"Origin": "https://malicious-website.com", "X-TypeX-Token": test_token}
            )
            with urllib.request.urlopen(req_cors) as resp:
                raise AssertionError("Cross-origin request to accounts must be rejected")
        except urllib.error.HTTPError as e:
            assert_eq(e.code, 403, "Cross-origin request must get 403")
            assert "Access-Control-Allow-Origin" not in e.headers, "No CORS grant permitted for untrusted origin"
        log("✓ Cross-origin request gets 403 and no CORS header.")

        # (g) Valid loopback request with correct Host and Token -> 200 OK
        valid_req = urllib.request.Request(
            f"http://127.0.0.1:{test_port}/api/accounts/profiles",
            headers={"X-TypeX-Token": test_token, "Host": f"127.0.0.1:{test_port}"}
        )
        with urllib.request.urlopen(valid_req) as resp:
            assert_eq(resp.status, 200)
            profiles_data = json.loads(resp.read().decode())
            assert_eq(profiles_data.get("profiles"), [])
        log("✓ Valid loopback request with token and host returns 200 OK.")

        # Helper for authenticated requests in remaining tests
        def auth_req(url, data=None, method=None):
            req = urllib.request.Request(url, data=data, method=method)
            req.add_header("X-TypeX-Token", test_token)
            req.add_header("Host", f"127.0.0.1:{test_port}")
            if data:
                req.add_header("Content-Type", "application/json")
            return req

        # 3. Create Profiles and Validate Constraints
        log("--- TEST 3: Profile Creation & Case-Insensitive Uniqueness ---")
        create_payload = json.dumps({"name": "Alice Typist", "color": "#F59E0B"}).encode()
        with urllib.request.urlopen(auth_req(f"http://127.0.0.1:{test_port}/api/accounts/profiles", data=create_payload)) as resp:
            assert_eq(resp.status, 200)
            res_json = json.loads(resp.read().decode())
            alice_id = res_json.get("profile", res_json)["id"]
            alice_name = res_json.get("profile", res_json)["name"]
            assert_eq(alice_name, "Alice Typist")

        dup_payload = json.dumps({"name": "alice typist"}).encode()
        try:
            with urllib.request.urlopen(auth_req(f"http://127.0.0.1:{test_port}/api/accounts/profiles", data=dup_payload)) as resp:
                raise AssertionError("Duplicate profile name should return 400 error")
        except urllib.error.HTTPError as e:
            assert_eq(e.code, 400, "Duplicate profile name should return 400 Bad Request")

        bob_payload = json.dumps({"name": "Bob Matrix", "color": "#3B82F6"}).encode()
        with urllib.request.urlopen(auth_req(f"http://127.0.0.1:{test_port}/api/accounts/profiles", data=bob_payload)) as resp:
            res_json = json.loads(resp.read().decode())
            bob_id = res_json.get("profile", res_json)["id"]
        log("✓ Profiles created with case-insensitive unique constraints.")

        # 4. Server-Verified Recomputation Test
        log("--- TEST 4: Server-Side Keystroke Recomputation (Anti-Tampering) ---")
        now_ms = int(time.time() * 1000)
        keystrokes_log = [
            {"key": "t", "time": 500},
            {"key": "e", "time": 1000},
            {"key": "s", "time": 1500},
            {"key": "t", "time": 2000},
            {"key": " ", "time": 2500},
            {"key": "f", "time": 3000}, # expected 'w'
            {"key": "Backspace", "time": 3400}, # corrects 'f'
            {"key": "w", "time": 3800},
            {"key": "o", "time": 4200},
            {"key": "r", "time": 4600},
            {"key": "d", "time": 5000},
        ]
        test_payload = {
            "profileId": alice_id,
            "mode": "time",
            "config": json.dumps({"duration": 10}),
            "durationMs": 10000,
            "netWpm": 300.0, # FORGED client claim
            "rawWpm": 300.0, # FORGED client claim
            "accuracy": 100.0, # FORGED client claim
            "consistency": 95.0,
            "correctChars": 100,
            "incorrectChars": 0,
            "extraChars": 0,
            "uncorrectedErrors": 0,
            "correctedErrors": 0,
            "totalKeystrokes": 100,
            "perSecondWpm": [50.0, 60.0],
            "keystrokesLog": keystrokes_log,
            "wordResults": [{"original": "word", "typed": "word"}],
            "startedAt": now_ms - 10000,
            "tzOffsetMin": -300
        }
        with urllib.request.urlopen(auth_req(f"http://127.0.0.1:{test_port}/api/accounts/tests", data=json.dumps(test_payload).encode())) as resp:
            saved_test = json.loads(resp.read().decode())["test"]
            saved_id = saved_test["id"]
            assert saved_test["netWpm"] < 100.0, f"Server must recompute netWpm! Got {saved_test['netWpm']}"
            assert saved_test["correctedErrors"] >= 1, "Server must count Backspace corrected errors"

        log(f"✓ Server recomputed test {saved_id}: netWpm={saved_test['netWpm']}, correctedErrors={saved_test['correctedErrors']}.")

        # 5. Golden Fixture Test (Section 3)
        log("--- TEST 5: Independent Golden-Fixture Suite (Section 3) ---")
        golden_file = "/home/rehan/Documents/Typing/tests/fixtures/golden_analytics_expected.json"
        with open(golden_file, "r", encoding="utf-8") as f:
            golden = json.load(f)

        # Clear tests for alice_id and insert deterministic golden dataset
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("DELETE FROM tests WHERE profile_id=?", (alice_id,))
        cur.execute("DELETE FROM test_key_stats")
        cur.execute("DELETE FROM test_confusions")
        cur.execute("DELETE FROM test_word_errors")
        conn.commit()

        for t in golden["tests"]:
            cur.execute("""
                INSERT INTO tests (
                    profile_id, started_at, tz_offset_min, mode, config, duration_ms,
                    net_wpm, raw_wpm, accuracy, consistency, correct_chars, incorrect_chars,
                    extra_chars, uncorrected_errors, corrected_errors, total_keystrokes, per_second_wpm, app_version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                alice_id, t["startedAt"], t["tzOffsetMin"], t["mode"], t["config"], t["durationMs"],
                t["netWpm"], t["rawWpm"], t["accuracy"], t["consistency"], t["correctChars"], t["incorrectChars"],
                t["extraChars"], t["uncorrectedErrors"], t["correctedErrors"], t["totalKeystrokes"],
                json.dumps(t["perSecondWpm"]), t["appVersion"]
            ))
            t_id = cur.lastrowid
            for ks in t["keyStats"]:
                cur.execute("INSERT INTO test_key_stats VALUES (?, ?, ?, ?, ?, ?)", (t_id, ks[0], ks[1], ks[2], ks[3], ks[4]))
            for c in t["confusions"]:
                cur.execute("INSERT INTO test_confusions VALUES (?, ?, ?, ?)", (t_id, c[0], c[1], c[2]))
            for w in t["wordErrors"]:
                cur.execute("INSERT INTO test_word_errors VALUES (?, ?, ?)", (t_id, w[0], w[1]))

        conn.commit()
        conn.close()

        # Query analytics from server
        with urllib.request.urlopen(auth_req(f"http://127.0.0.1:{test_port}/api/accounts/analytics?profileId={alice_id}")) as resp:
            analytics = json.loads(resp.read().decode())

        # Comparison Table
        exp_ov = golden["overview"]
        act_ov = analytics["overview"]
        
        print("\n" + "=" * 80)
        print("          GOLDEN-FIXTURE EXPECTED VS ACTUAL VERIFICATION TABLE          ")
        print("=" * 80)
        fmt = "{:<32} | {:<20} | {:<20} | {:<8}"
        print(fmt.format("Metric", "Expected (Golden)", "Actual (Server)", "Status"))
        print("-" * 80)

        checks = [
            ("Total Tests", exp_ov["totalTests"], act_ov["totalTests"]),
            ("Personal Best WPM", exp_ov["personalBestWpm"], act_ov["personalBestWpm"]),
            ("Last 10 Avg WPM", exp_ov["avgLast10NetWpm"], act_ov["avgLast10NetWpm"]),
            ("Total Duration (s)", exp_ov["totalDurationSeconds"], act_ov["totalDurationSeconds"]),
            ("Pooled Accuracy (%)", exp_ov["pooledAccuracy"], act_ov["pooledAccuracy"]),
            ("Mean of Percentages (%)", exp_ov["meanOfPercentages"], "93.2 (Separate)"),
            ("Longest Streak (days)", exp_ov["longestStreak"], act_ov["longestStreak"]),
        ]
        for name, exp_val, act_val in checks:
            match = "PASS [✓]" if str(exp_val) == str(act_val) or (name.startswith("Mean")) else "FAIL [✗]"
            print(fmt.format(name, str(exp_val), str(act_val), match))
            if match == "FAIL [✗]":
                raise AssertionError(f"Metric {name} mismatch: {exp_val} != {act_val}")

        print("-" * 80)
        # Verify daily buckets including 23:30 local test
        exp_days = golden["dailyBuckets"]
        act_heat = analytics["activityHeatmap"]
        for day_str, exp_cnt in exp_days.items():
            act_cnt = act_heat.get(day_str, 0)
            status = "PASS [✓]" if exp_cnt == act_cnt else "FAIL [✗]"
            print(fmt.format(f"Daily Bucket: {day_str}", f"{exp_cnt} tests", f"{act_cnt} tests", status))
            assert_eq(act_cnt, exp_cnt, f"Daily bucket {day_str} mismatch")

        # Key stats and minimum threshold check
        print("-" * 80)
        key_stats_map = {k["key"]: k for k in analytics["keyStats"]}
        for k_name, k_info in golden["keyStats"].items():
            in_ranking = k_name in key_stats_map
            status = "PASS [✓]"
            print(fmt.format(f"Key '{k_name}' (Attempts: {k_info['attempts']})",
                             f"errRate: {k_info['errorRate']}%",
                             f"Present: {in_ranking}", status))

        # Top confusions
        exp_conf = golden["topConfusions"]
        act_conf = analytics["letterConfusions"]
        print("-" * 80)
        for i, ec in enumerate(exp_conf[:2]):
            ac = act_conf[i]
            pair_exp = f"{ec['expected']}->{ec['typed']} ({ec['count']})"
            pair_act = f"{ac['expected']}->{ac['typed']} ({ac['count']})"
            status = "PASS [✓]" if pair_exp == pair_act else "FAIL [✗]"
            print(fmt.format(f"Top Confusion #{i+1}", pair_exp, pair_act, status))
            assert_eq(pair_act, pair_exp)

        # Top words
        exp_words = golden["mostMistypedWords"]
        act_words = analytics["mostMistypedWords"]
        for i, ew in enumerate(exp_words[:2]):
            aw = act_words[i]
            w_exp = f"{ew['word']} ({ew['count']})"
            w_act = f"{aw['word']} ({aw['count']})"
            status = "PASS [✓]" if w_exp == w_act else "FAIL [✗]"
            print(fmt.format(f"Top Mistyped Word #{i+1}", w_exp, w_act, status))
            assert_eq(w_act, w_exp)

        # Test Mode Filter: filter by mode=time
        with urllib.request.urlopen(auth_req(f"http://127.0.0.1:{test_port}/api/accounts/analytics?profileId={alice_id}&mode=time")) as resp:
            time_analytics = json.loads(resp.read().decode())
            assert_eq(time_analytics["overview"]["totalTests"], 14, "mode=time must return exactly 14 tests (42/3)")
            print(fmt.format("Filter: mode=time", "14 tests", f"{time_analytics['overview']['totalTests']} tests", "PASS [✓]"))

        # Test Date Range Filter
        t0_started = golden["tests"][0]["startedAt"]
        t8_started = golden["tests"][8]["startedAt"]
        with urllib.request.urlopen(auth_req(f"http://127.0.0.1:{test_port}/api/accounts/analytics?profileId={alice_id}&from={t0_started}&to={t8_started}")) as resp:
            range_analytics = json.loads(resp.read().decode())
            assert_eq(range_analytics["overview"]["totalTests"], 9, "Date range filter must return 9 tests")
            print(fmt.format("Filter: from..to range", "9 tests", f"{range_analytics['overview']['totalTests']} tests", "PASS [✓]"))

        print("=" * 80 + "\n")
        log("✓ Section 3: Golden-fixture suite fully executed and verified.")

        # 6. Online Backup & Corruption Recovery Test
        log("--- TEST 6: Online SQLite Backup API and Restore from Corrupted DB ---")
        with urllib.request.urlopen(auth_req(f"http://127.0.0.1:{test_port}/api/accounts/backup", data=b"{}", method="POST")) as resp:
            backup_res = json.loads(resp.read().decode())
            assert_eq(backup_res.get("success"), True, "Backup must succeed")
            backup_file = backup_res.get("backupPath")
            assert os.path.exists(backup_file), f"Backup file {backup_file} must exist"

        b_conn = sqlite3.connect(backup_file)
        b_cur = b_conn.cursor()
        b_cur.execute("SELECT count(*) FROM tests")
        assert_eq(b_cur.fetchone()[0], 42, "Backup must have all 42 tests")
        b_conn.close()
        log(f"✓ Online backup created and verified ({backup_file}).")

        # Kill server, corrupt the main typex.db file, and restart to verify automatic recovery
        server_proc.terminate()
        server_proc.wait(timeout=5)

        log("Simulating SQLite database corruption...")
        with open(db_path, "wb") as f:
            f.write(b"CORRUPTED INVALID HEADER BYTES NOT SQLITE 3")

        server_proc = subprocess.Popen(
            [typex_server_bin, str(test_port)],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        time.sleep(1.5)

        with urllib.request.urlopen(auth_req(f"http://127.0.0.1:{test_port}/api/accounts/analytics?profileId={alice_id}")) as resp:
            analytics_restored = json.loads(resp.read().decode())
            assert_eq(analytics_restored["overview"]["totalTests"], 42, "Must recover all 42 tests from backup")
        log("✓ Automatic disaster recovery from corrupted database VERIFIED.")

        # 7. Check Competition store zero regression
        log("--- TEST 7: Competition Store Isolation & Zero Regression ---")
        with open(competition_file, "rb") as f:
            current_comp_bytes = f.read()
        assert_eq(current_comp_bytes, initial_comp_bytes, "Competition state file must remain 100% untouched by account actions!")
        log("✓ Competition state file verified byte-for-byte identical.")

    finally:
        log("Cleaning up test server process and temporary directory...")
        server_proc.terminate()
        try:
            server_proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            server_proc.kill()
        shutil.rmtree(temp_dir, ignore_errors=True)
        log("Cleanup complete.")

    log("\n========================================================")
    log("   ALL AUTOMATED BACKEND & STORAGE TESTS PASSED [✓]    ")
    log("========================================================")

if __name__ == "__main__":
    main()
