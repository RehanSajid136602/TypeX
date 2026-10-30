# TypeX — Minimalist High-Performance Typing Platform & Stage Competition Engine

TypeX is an ultra-minimalist, 120fps fluid typing platform and stage competition system powered by a high-throughput C++17 native telemetry engine paired with a reactive Next.js 16 (React 19 / TypeScript / Tailwind CSS) frontend.

---

## 📦 Linux Desktop Installation (`.deb` Package)

TypeX ships as a standalone, zero-node-dependency Linux `.deb` desktop installer supporting **Ubuntu 22.04 LTS, Ubuntu 24.04 LTS, and Debian 12 (Bookworm) amd64**.

### 1. Build the `.deb` Package
To compile all native Release binaries, export static web assets, and package the installer:
```bash
# Using pnpm monorepo script:
pnpm build:deb

# Or alternatively:
pnpm package
```
The output package will be generated at:
```bash
dist/typex_1.0.0_amd64.deb
```

### 2. Install on Target Machine
Install the package using `apt` so runtime dependencies (`libwebkit2gtk-4.1-0`, `libgtk-3-0`, `libc6`, `libstdc++6`) resolve automatically:
```bash
sudo apt install ./dist/typex_1.0.0_amd64.deb
```

### 3. Launching TypeX
- **From Application Menu**: Search for **TypeX** in your desktop environment's application launcher.
- **From Terminal**:
  ```bash
  typex
  ```
- **Single-Instance Enforcement**: Launching `typex` when an existing instance is active safely focuses the running window without spawning duplicate backends or conflicting ports.
- **Process Lifecycle**: The C++ engine starts as a managed child process on a dynamic loopback port. When the TypeX window is closed, quits, or receives a signal, the child backend process is immediately reaped. Zero orphaned or zombie processes remain.

### 4. Writable Data Locations & Data Safety
- **Writable User Data Directory**: Stored in `~/.local/share/TypeX` (honors `$XDG_DATA_HOME/TypeX`).
  - `mastery_profile.json` (Typing mastery and key telemetry statistics)
  - `competition_state.json` (Live event state, batch rosters, recorded results)
  - `admin_pin.json` (Salted SHA-256 hash of your Master Admin PIN, permission `0600`)
  - `backups/` (Automated timestamped backups)
- **Read-Only System Data**: Word lists (`english_1k.txt`, `english_10k.txt`, etc.) ship read-only in `/usr/share/typex/data`.
- **First-Run Import**: If dev data files exist from a local workspace or previous build, TypeX automatically imports them without overwriting existing data.
- **Package Removal / Purge**: Removing or purging the `typex` package (`sudo apt remove typex` or `sudo apt purge typex`) **never touches user data**. All user statistics and competition profiles remain safely preserved in `~/.local/share/TypeX`.

---

## 🌐 Enabling Host Mode for Local Network Competitions

By default, the backend binds strictly to `127.0.0.1` for maximum security. When hosting an on-stage or classroom tournament across multiple machines:

### 1. Start in Host Mode
Launch with the `--host 0.0.0.0` flag or set `TYPEX_BIND_HOST=0.0.0.0`:
```bash
typex --host 0.0.0.0
# Or headless:
typex-server --host 0.0.0.0 --port 8080
```

### 2. Stage Admin Network Telemetry
Open the Stage Admin screen in TypeX (`/admin`):
- The **Network Mode** banner will illuminate green: `Host Mode (LAN Broadcast Active 0.0.0.0)`.
- It dynamically lists your machine's LAN IP addresses (e.g. `192.168.1.100`) and provides one-click **Copy** buttons for:
  - Contestant Screen: `http://<LAN_IP>:<PORT>/compete`
  - Projector Board: `http://<LAN_IP>:<PORT>/leaderboard`
  - Admin Cockpit: `http://<LAN_IP>:<PORT>/admin`
- **Security Notice**: Anyone on your local Wi-Fi or wired network can access the contestant registration and leaderboard screens. Your Stage Admin dashboard is protected by your Master Admin PIN.

---

## 🔒 Master Admin PIN Setup

TypeX has **no default insecure PIN**. 
1. On the very first visit to the Stage Admin panel (`/admin`), a **First-Run Security Setup** modal prompts you to initialize your Master Admin PIN (minimum 4 characters).
2. The PIN is salted and hashed using SHA-256 and stored in `~/.local/share/TypeX/admin_pin.json` with strict `0600` user permissions.
3. All admin operations (round control, contestant disqualification/redo, paragraph generation, event reset) refuse requests until the PIN is verified.
4. You can also override the PIN via the `TYPEX_ADMIN_PIN` environment variable when automating headless tournament servers.

---

## 🏆 Running a Stage Competition Event

1. **Host Launches TypeX in Host Mode**:
   ```bash
   typex --host 0.0.0.0
   ```
2. **Projector Setup**:
   - Connect the secondary display or projector and navigate to `/leaderboard`.
   - Click **Fullscreen** for a clean, 16:9 widescreen scoreboard with real-time sub-batch split reveals.
3. **Contestant Stage Machine(s)**:
   - Contestants open `/compete` and enter their Name, Registration ID, and Department.
4. **Admin Cockpit**:
   - The Stage Director opens `/admin`, logs in with their Master Admin PIN, selects paragraph rules, batch sizes (default 3), and controls round countdowns and podium reveals.
5. **CSV Export**:
   - Click **Export CSV** in `/admin` at any point to download official 1-decimal net speed rankings.

---

## 👤 Local User Profiles & Database Storage

TypeX features an offline, privacy-first local user profile system:
- **No Cloud, No Passwords, No Network Tracking**: All typing history is saved locally on your device.
- **Data Storage Location**:
  - **Linux**: `~/.local/share/TypeX/typex.db` (respects `$XDG_DATA_HOME/TypeX` and `TYPEX_DATA_DIR`).
  - **Windows**: `%LOCALAPPDATA%\TypeX\typex.db`.
- **SQLite Engine**: Powered by a raw SQLite amalgamation compiled directly into the C++ backend.
  - Runs with WAL mode (`journal_mode=WAL`), foreign keys enforced, busy timeout (5000ms), and synchronous `NORMAL`.
  - Numbered non-destructive migrations tracked with `PRAGMA user_version`.
  - Per-test storage of key stats, letter confusions, and word errors for flexible SQL aggregation.
- **Competition Isolation**: The competition store (`competition_state.json`) is completely isolated from personal profiles. Competition contestants never appear in personal profiles, and profile data is never exposed to tournament screens.
- **First-Run Profile Setup**:
  - On first launch with no profiles, a bold modal prompts you to enter your typist name (1-40 characters, case-insensitively unique) or choose **Continue as Guest** (nothing is saved).
  - The Master Admin PIN setup is reserved strictly for `/admin` so normal typists are never blocked.
- **Profile Switching & Management**:
  - The top header features a profile chip showing the active user name and avatar color with a quick dropdown to switch profiles, add a new profile, open the Account page, or switch to Guest mode.
  - The last-used profile is automatically restored across restarts.

---

## 📊 Analytics & Account Dashboard (`/account`)

Navigate to `/account` via the profile dropdown or by visiting `/account`:
- **Global Filters**: Filter all statistics and charts by Date Range (7 Days, 30 Days, 90 Days, All Time, or Custom Date Picker), Mode (`time`, `words`, `learn`), and Duration/Word count.
- **Overview Cards**:
  - **Personal Best Net WPM** with test date.
  - **Rolling Average Net WPM** (last 10 tests).
  - **Pooled Accuracy (%)**: Aggregated across total characters, avoiding flawed averages of percentages.
  - **Activity**: Total tests and cumulative typing time.
  - **Current & Longest Daily Streak**: Local-day bucketing using each test's recorded timezone offset.
  - **Weekly Trend**: Linear regression WPM change per week.
  - **Biomechanical Balance**: Hand and finger error rate distribution.
- **Interactive SVG Charts**:
  - **Net WPM Over Time**: Chronological test history with an optional toggleable Moving Average (5 or 10 tests).
  - **Accuracy Over Time**: Precision baseline tracking.
  - **Speed Histogram**: Bucket frequency across tests.
  - **Daily Activity Heatmap**: 12-week GitHub-style consistency tiles.
  - **Keyboard HUD Error Heatmap**: Interactive ANSI 60% keyboard colored by error rate per key with attempt counts on hover.
  - **Top Letter Confusions**: Expected $\rightarrow$ Typed breakdown.
  - **Most-Mistyped Words**: Ranked list of error-friction words.
- **Recent Tests History**: Detailed sortable table with one-click inspection of per-second telemetry curves and mistake breakdowns.
- **Danger Zone**:
  - **Backup Database Now**: Creates an instant online snapshot in `backups/`.
  - **Delete Profile**: Requires typing the profile name to confirm (creates an automated backup first).
  - **Delete All Data**: Requires typing `DELETE ALL DATA` to erase local test history.

---

## 💾 CSV & Real XLSX Multi-Sheet Export

Export your complete history honoring active filters from `/account`:
- **CSV Export**:
  - Formatted in UTF-8 with BOM (`\uFEFF`) so Microsoft Excel seamlessly opens non-ASCII profile names and symbols.
  - ISO-8601 UTC timestamps paired with local human-readable time columns.
  - **Spreadsheet Formula Injection Defense**: Any text cell starting with `=`, `+`, `-`, or `@` is prefixed with `'` to prevent command execution.
- **XLSX Export**:
  - Real Excel `.xlsx` multi-sheet workbook containing:
    1. `Summary`: High-level metrics, personal bests, and streaks.
    2. `Tests`: Complete row-by-row telemetry.
    3. `Mistyped Keys`: Per-key attempts, errors, rates, and flight times.
    4. `Letter Confusions`: Ranked character mistakes.
    5. `Mistyped Words`: Friction vocabulary.
    6. `Daily Activity`: Local day test counts, speeds, and accuracies.
- **Default Filename**: `typex-<name>-<yyyy-mm-dd>.csv|xlsx`.

---

## 🛡️ Database Backups & Automatic Disaster Recovery

- **Online Backup API**: Uses the native SQLite Online Backup API to safely capture clean snapshots without database locking.
- **Retention**: Up to 7 daily online backups are retained inside `~/.local/share/TypeX/backups/`.
- **Integrity Check**: On server startup, `PRAGMA integrity_check` runs automatically. If database corruption is detected, TypeX automatically restores the newest valid backup from `backups/` and alerts the user.

---

## 🔒 Privacy & Network Security (LAN Guardrails)

- When hosting tournaments with `--host 0.0.0.0`, TypeX binds to the local network so peers can access `/compete` and `/leaderboard`.
- **Loopback Enforcement**: All `/api/accounts/*` endpoints (profiles, tests, analytics, exports, backups, and danger actions) strictly verify peer IP addresses. Requests originating from non-loopback addresses (`!127.0.0.1` and `!::1`) receive `403 Forbidden`. Personal typist data is never reachable from LAN contestants.
- **Zero External Telemetry**: No network requests or telemetry pings are made to external servers.

---

## 🪟 Windows Installer (64-bit NSIS) & Packaging

- **Windows Architecture**: x64-only native build installing to `C:\Program Files\TypeX`.
- **Per-Machine Installation**:
  - App binaries (`TypeX.exe`), static web assets, and word corpora install to `C:\Program Files\TypeX`.
  - **User Data Separation**: User databases and profiles are strictly written to `%LOCALAPPDATA%\TypeX`. The installer never writes user data to `Program Files`.
  - Registers in **Windows Settings $\rightarrow$ Installed apps / Add or remove programs** with Publisher, Version, and Icon.
  - Creates Start Menu and Desktop shortcuts.
  - Supports silent installation (`/S`) and custom install paths.
  - **Uninstaller Behavior**: Preserves `%LOCALAPPDATA%\TypeX` data by default and during silent uninstall (`/S`). An interactive prompt allows optional deletion of personal data.
- **GitHub Actions CI/CD (`.github/workflows/release.yml`)**:
  - Cross-compiles the C++ backend with MinGW-w64 and links SQLite.
  - Packages both the portable `.zip` bundle and the NSIS per-machine installer (`TypeX-Setup.exe`).

---

## 💻 Local Development Workflow

For development without desktop packaging:
```bash
# Start backend (port 8080) and Next.js frontend (port 3000)
./start.sh
```
Open [http://localhost:3000](http://localhost:3000) in your browser. All API proxy routes have been streamlined so the frontend communicates seamlessly with the C++17 engine.
