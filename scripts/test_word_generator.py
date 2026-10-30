#!/usr/bin/env python3
import urllib.request
import json
import sys

def test_anti_repetition_and_neighbors():
    print("[*] Testing Anti-Repetition (no repeat in 20 words, no identical neighbors)...")
    url = "http://localhost:8080/api/words?tier=english_1k&count=100&mode=natural"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
    
    words = data["words"]
    assert len(words) == 100, f"Expected 100 words, got {len(words)}"
    
    # Check no identical neighbors
    for i in range(len(words) - 1):
        assert words[i] != words[i + 1], f"Identical neighbor found: {words[i]} at index {i} and {i+1}"
    
    # Check no repeat within 20 words
    for i in range(len(words)):
        window = words[max(0, i - 20):i]
        assert words[i] not in window, f"Word '{words[i]}' at index {i} repeated within past 20 words: {window}"
    
    print("[✓] PASSED: No identical neighbors and no repeat within last 20 words across 100 words.")

def test_fresh_words_on_restart():
    print("[*] Testing Fresh Words on Every Restart...")
    url = "http://localhost:8080/api/words?tier=english_1k&count=25&mode=natural"
    with urllib.request.urlopen(url) as resp:
        set1 = json.loads(resp.read().decode())["words"]
    with urllib.request.urlopen(url) as resp:
        set2 = json.loads(resp.read().decode())["words"]
        
    assert set1 != set2, "Expected fresh word sets on restart, but got identical sets!"
    print(f"[✓] PASSED: Consecutive generations are unique (Set 1 start: {set1[:3]} vs Set 2 start: {set2[:3]}).")

def test_simulated_120s_at_200wpm():
    print("[*] Testing Simulated 120s at 200 WPM (Endless Stream)...")
    # 200 WPM for 2 minutes = 400 words.
    # Time mode requests initial chunk of 100 words, then when within 30 words of end,
    # requests next chunk of 100 with excludeRecent.
    buffer = []
    total_words_streamed = 0
    recent = []
    
    # Initial chunk
    url = "http://localhost:8080/api/words?tier=english_1k&count=100&mode=natural"
    with urllib.request.urlopen(url) as resp:
        chunk = json.loads(resp.read().decode())["words"]
        buffer.extend(chunk)
        total_words_streamed += len(chunk)

    user_index = 0
    fetch_count = 0
    # Simulate user typing 400 words
    while user_index < 400:
        # Check if prefetch condition met
        if len(buffer) - user_index <= 30:
            fetch_count += 1
            recent = buffer[-20:]
            exclude_param = urllib.parse.quote(",".join(recent))
            next_url = f"http://localhost:8080/api/words?tier=english_1k&count=100&mode=natural&excludeRecent={exclude_param}"
            with urllib.request.urlopen(next_url) as resp:
                next_chunk = json.loads(resp.read().decode())["words"]
                assert len(next_chunk) == 100, "Failed to get 100 words in chunk"
                # Check boundary: first word of new chunk must not repeat in the last 20 words
                assert next_chunk[0] not in recent, f"Boundary violation: {next_chunk[0]} was in recent {recent}"
                buffer.extend(next_chunk)
                total_words_streamed += len(next_chunk)
        
        # User types a word
        assert user_index < len(buffer), f"Stream starved at index {user_index}!"
        user_index += 1
        
    print(f"[✓] PASSED: Successfully typed 400 words (120s @ 200 WPM) without stalling.")
    print(f"    Total words streamed: {total_words_streamed} across {fetch_count + 1} chunks.")

if __name__ == "__main__":
    import urllib.parse
    test_anti_repetition_and_neighbors()
    test_fresh_words_on_restart()
    test_simulated_120s_at_200wpm()
    print("\nALL GENERATOR AND STREAM TESTS PASSED!")
