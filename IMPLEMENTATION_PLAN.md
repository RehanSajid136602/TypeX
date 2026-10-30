# TypeX Linux Desktop Packaging (.deb) Implementation Plan

## 1. Architectural Decisions & Rationale

### A. Shell Evaluation & Decision
- **Options Evaluated:**
  1. **Tauri 2 (Rust-based WebView)**: Tauri 2 provides a native WebKitGTK window over `127.0.0.1`. However, target machines or build systems without Rust toolchains cannot compile it, and the packaging tool adds huge Rust dependencies.
  2. **Electron**: Extremely heavy (~150MB+ bundle, bundled Chromium/Node.js), high memory usage, violates our goal of a minimalist, lightweight package.
  3. **Launcher script opening default browser**: Not a self-contained desktop app experience; no window lifecycle control, cannot guarantee process cleanup when browser tab is closed.
  4. **Native C++/WebKitGTK Single-Window Desktop Shell (`typex-app`) with WebKit2GTK 4.1 runtime**:
     - **Decision**: Recommended and chosen! Compiles directly with `g++ -std=c++17` using dynamic linking / dlopen or GObject runtime bindings for `libwebkit2gtk-4.1.so.0` and `libgtk-3.so.0`.
     - **Size**: Shell binary is ~50KB (compared to 150MB Electron).
     - **Dependencies (`Depends`)**: `libwebkit2gtk-4.1-0 (>= 2.40.0) | libwebkit2gtk-4.0-37, libgtk-3-0 (>= 3.24.0) | libgtk-3-0t64, libc6 (>= 2.34), libstdc++6 (>= 11)`.
     - **Lifecycle**: Starts backend on a dynamic free port, polls `/api/health`, displays the native window once healthy, and **always terminates the backend child process on quit, crash, or window close**. Includes a Unix domain socket single-instance lock to activate the existing window if launched twice.

### B. Frontend Export vs Backend Serving Decision
- **Options Evaluated:**
  1. **Static Export (`output: "export"`) with C++ serving static files**:
     - Next.js static export fails on server API routes (`Route /api/... with output: export`), requiring deleting Next API routes and migrating all requests to direct C++ backend endpoints.
     - With C++ serving both static HTML/JS/CSS and `/api/*` endpoints on the same port/origin, browser CORS issues disappear completely, static assets are bundled without needing Node.js runtime on target systems, and the binary footprint is minimal.
  2. **Bundling Next standalone server (`output: "standalone"`)**:
     - Requires bundling Node.js runtime inside the `.deb` package (or requiring node on the target machine, which violates the constraint: "No dependency on anything preinstalled beyond declared .deb dependencies. No Node, pnpm, or compiler on the target machine").
     - **Decision**: Option (a) — Static export of the frontend. We will remove the redundant proxy routes in `frontend/src/app/api/` (since all endpoints exist natively on the C++ backend), configure `output: "export"` in `next.config.ts`, refactor frontend fetches to same-origin relative paths (`/api/...`), and configure `cpp-httplib`'s `svr.set_mount_point("/", staticDir)` so the C++ engine seamlessly serves static assets as well as all `/api/` routes! This works flawlessly in both dev (`start.sh` proxies or runs standalone) and production.

### C. Data Directory & Migration
- **XDG Specification**: Honor `$XDG_DATA_HOME/TypeX` (defaulting to `~/.local/share/TypeX`).
- **Writable Data**: `mastery_profile.json`, `competition_state.json`, `admin_pin.json`, backups, logs.
- **Read-Only Data**: Word lists (`english_1k.txt`, `english_10k.txt`, etc.) ship read-only in `/usr/share/typex/data`.
- **First-run import**: If dev data files exist (e.g., from local checkout or earlier run) and destination doesn't exist, safely import without overwriting existing data.

### D. Admin PIN Security
- No default PIN.
- First-run setup modal in `/admin` prompts the user to create a PIN if none is configured.
- Salted SHA-256 hash stored in `~/.local/share/TypeX/admin_pin.json` with permissions 0600.
- All admin endpoints (`/api/competition/config`, `/api/competition/paragraphs/generate`, `/api/competition/contestants/*`, `/api/competition/round/*`, `/api/competition/results/*`, `/api/competition/export/*`) refuse requests with HTTP 403 / 401 until the PIN is set and verified.
- New endpoints:
  - `GET /api/admin/pin-status` -> `{ "configured": bool }`
  - `POST /api/admin/setup-pin` -> `{ "pin": "..." }` (only allowed if not configured or with old pin)

### E. Host Mode & Dynamic Port Binding
- Default binding: `127.0.0.1` on a dynamically allocated free port (finds available port in 8080-8999 range or OS-assigned).
- Host mode setting: when toggled on in Stage Admin, backend binds to `0.0.0.0`, advertising LAN IP (e.g. `http://192.168.x.x:<port>/compete`, `/leaderboard`, `/admin`) with copy buttons and security warning.

---

## 2. Step-by-Step Implementation Checklist

- [ ] **Step 1: Backend Architecture Updates (`backend/`)**
  - [ ] Add CLI arguments: `--port <port>`, `--host <127.0.0.1|0.0.0.0>`, `--data-dir <dir>`, `--static-dir <dir>`, `--wordlists-dir <dir>`.
  - [ ] Support static file serving via `httplib::Server::set_mount_point("/", staticDir)` with fallback to `index.html` for SPA client-side routes.
  - [ ] Separate writable data directory (`TYPEX_DATA_DIR` / `--data-dir`) from read-only word lists directory (`TYPEX_WORDLISTS_DIR` / `--wordlists-dir`).
  - [ ] Add Admin PIN hashing (salted SHA-256) and persistent storage in `admin_pin.json`.
  - [ ] Add `/api/admin/pin-status`, `/api/admin/setup-pin`, and enforce PIN verification across all admin endpoints.
  - [ ] Expose app version (`1.0.0`) in `/api/health` and `/api/version`.
  - [ ] Add `/api/system/network` endpoint to return LAN IP addresses, active bind host, and port for Host Mode display.
  - [ ] Support dynamic Host Mode toggle or restart without losing state.

- [ ] **Step 2: Frontend Refactor for Static Export & First-Run PIN Modal (`frontend/`)**
  - [ ] Remove `src/app/api/` proxy routes so `next build` with `output: "export"` succeeds cleanly.
  - [ ] Ensure all API requests use relative `/api/...` endpoints.
  - [ ] Update `next.config.ts` with `output: "export"` and `trailingSlash: false` / unoptimized images.
  - [ ] Implement First-Run Admin PIN Setup modal in `src/app/admin/page.tsx` with premium obsidian glassmorphism UI.
  - [ ] Add Host Mode network banner in `src/app/admin/page.tsx` showing LAN URLs (`/compete`, `/leaderboard`, `/admin`), one-click copy buttons, and LAN access security warning.
  - [ ] Add version badge `v1.0.0` in `Footer.tsx`.
  - [ ] Verify static build `pnpm build` generates pure static HTML/JS/CSS assets in `out/`.

- [ ] **Step 3: Native Desktop Shell (`typex-app`)**
  - [ ] Develop `typex-app` C++ GTK3 + WebKit2GTK wrapper.
  - [ ] Implement dynamic port selection (scans for open port, avoids conflicts).
  - [ ] Implement robust child process management with PID tracking, SIGCHLD handler, parent-death monitor (prctl PR_SET_PDEATHSIG), and window-destroy cleanup ensuring zero orphaned processes.
  - [ ] Single-instance lock via Unix domain socket (`/tmp/typex-<uid>.sock`) to bring running window to foreground if launched again.

- [ ] **Step 4: Debian Packaging (`.deb`)**
  - [ ] Create simple distinctive TypeX SVG and PNG icons (16, 32, 48, 64, 128, 256, 512).
  - [ ] Create `typex.desktop` with categories `Utility;Education;`, `StartupWMClass=typex-app`.
  - [ ] Create Debian control file with proper `Depends`, `Installed-Size`, `Maintainer`, `Description`.
  - [ ] Create package layout in `build/debian/`:
    - `/usr/bin/typex` (wrapper launcher / shell)
    - `/usr/lib/typex/typex-server` (C++ engine)
    - `/usr/lib/typex/typex-app` (native WebKitGTK window)
    - `/usr/share/typex/web/` (Next.js static export)
    - `/usr/share/typex/data/` (read-only word lists)
    - `/usr/share/applications/typex.desktop`
    - `/usr/share/icons/hicolor/...`
  - [ ] Add npm/pnpm scripts in root `package.json`: `pnpm build:deb`, `pnpm package`.
  - [ ] Build package with `dpkg-deb --build --root-owner-group`.

- [ ] **Step 5: Testing & Verification**
  - [ ] Verify package structure, permissions, and file size.
  - [ ] Verify backend headless smoke test with isolated data directory (`~/.local/share/TypeX`).
  - [ ] Test health endpoint, typing results save, competition registration, admin PIN setup.
  - [ ] Verify uninstall leaves user data intact in `~/.local/share/TypeX`.
  - [ ] Produce complete verification report with proofs.
