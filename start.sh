#!/usr/bin/env bash
set -e

# Resolve script root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Ensure local node binary is in PATH if present
if [ -d "/home/rehan/.local/node/bin" ]; then
  export PATH="/home/rehan/.local/node/bin:$PATH"
fi

echo "======================================================="
echo "   ⚡ TypeX — Minimalist High-Performance Typing Engine  "
echo "======================================================="

# Clean up any lingering processes on ports 8080 and 3000
fuser -k 8080/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
sleep 0.5

# Verify backend binary exists or compile it
if [ ! -f "$ROOT_DIR/backend/typex_server" ]; then
  echo "[+] Compiling C++17 native engine..."
  g++ -std=c++17 -O3 -pthread backend/main.cpp backend/sqlite3.o -Ibackend/include -ldl -o backend/typex_server
  echo "[✓] C++ engine compiled successfully."
fi

# Launch C++ backend in background on port 8080 (dev mode, binds 0.0.0.0 for LAN testing)
echo "[+] Starting TypeX C++ Engine on port 8080..."
"$ROOT_DIR/backend/typex_server" --port 8080 --host 0.0.0.0 --data-dir "$ROOT_DIR/backend/data" &
BACKEND_PID=$!

# Ensure cleanup on shutdown
cleanup() {
  echo ""
  echo "[*] Gracefully stopping TypeX C++ Engine (PID $BACKEND_PID)..."
  kill "$BACKEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
  fuser -k 8080/tcp 2>/dev/null || true
  echo "[✓] TypeX successfully stopped."
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Wait up to 5 seconds for backend to be healthy and responsive
echo "[*] Verifying backend engine health on port 8080..."
HEALTHY=0
for i in {1..10}; do
  if curl -s "http://127.0.0.1:8080/api/words?count=1" >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 0.5
done

if [ "$HEALTHY" -eq 1 ]; then
  echo "[✓] Native C++ Engine is active and serving words at http://localhost:8080"
else
  echo "[!] Warning: Backend health check timed out. Checking backend process..."
  kill -0 "$BACKEND_PID" 2>/dev/null || echo "[!] Backend process exited prematurely!"
fi
echo "[+] Launching TypeX Frontend at http://localhost:3000..."
echo "======================================================="
echo "   👉 Open in your browser: http://localhost:3000      "
echo "   Press Ctrl+C to terminate both servers.             "
echo "======================================================="

# Launch Next.js dev server with pnpm
cd "$ROOT_DIR/frontend"
pnpm run dev
