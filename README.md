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

## 💻 Local Development Workflow

For development without desktop packaging:
```bash
# Start backend (port 8080) and Next.js frontend (port 3000)
./start.sh
```
Open [http://localhost:3000](http://localhost:3000) in your browser. All API proxy routes have been streamlined so the frontend communicates seamlessly with the C++17 engine.
# TypeX
