'use strict';

const {
  app,
  BrowserWindow,
  dialog,
  shell,
  session,
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
// Node's net module, not electron's: electron exports a `net` with the Chromium
// networking API (net.request), which has no createServer(). Importing it as
// `net` from the electron module made findFreePort() throw
// "net.createServer is not a function", so the backend never started.
const net = require('net');
const { spawn, spawnSync } = require('child_process');

app.setName('TypeX');

const APP_TITLE = 'TypeX';
const BACKGROUND_COLOR = '#0b0c10'; // Obsidian theme
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 800;
const MIN_WIDTH = 960;
const MIN_HEIGHT = 640;
const HEALTH_TIMEOUT_MS = 15000;
const HEALTH_POLL_MS = 200;

let mainWindow = null;
let backendProcess = null;
let backendPort = null;
let backendHost = '127.0.0.1';
let quitting = false;
let backendReady = false;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function isStageHost(argv) {
  return argv.some((arg) => arg === '--stage-host' || arg === '--stage-host=true');
}

function stageHostMode() {
  return isStageHost(process.argv.slice(1));
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = addr && typeof addr === 'object' ? addr.port : null;
      srv.close(() => {
        if (!port) reject(new Error('Could not determine a free port'));
        else resolve(port);
      });
    });
  });
}

function resourcesBase() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
}

function backendExecutablePath() {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, '..', 'backend');
  const exe = process.platform === 'win32' ? 'typex_server.exe' : 'typex_server';
  const candidate = path.join(base, exe);
  if (fs.existsSync(candidate)) return candidate;
  const alt = path.join(base, 'typex_server');
  if (fs.existsSync(alt)) return alt;
  const winAlt = path.join(base, 'TypeX.exe');
  if (fs.existsSync(winAlt)) return winAlt;
  return candidate;
}

function bundledWordlistsDir() {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'backend', 'data')
    : path.join(__dirname, '..', 'backend', 'data');
  return base;
}

function bundledWebDir() {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'web')
    : path.join(__dirname, '..', 'frontend', 'out');
  return base;
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_e) {
    // best effort
  }
}

function migrateLegacyDbNextToExe(userDataDir) {
  // Older builds may have left typex.db next to the executable. Copy once; never delete.
  try {
    const target = path.join(userDataDir, 'typex.db');
    if (fs.existsSync(target)) return;
    const candidates = [path.dirname(process.execPath)];
    if (process.resourcesPath) {
      candidates.push(path.dirname(process.resourcesPath));
    }
    for (const dir of candidates) {
      const legacy = path.join(dir, 'typex.db');
      if (legacy === target) continue;
      if (fs.existsSync(legacy)) {
        ensureDir(userDataDir);
        fs.copyFileSync(legacy, target);
        return;
      }
    }
  } catch (_e) {
    // Do not block startup on migration failure.
  }
}

function allowedLocalOrigin(urlString) {
  if (!backendPort) return false;
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'http:') return false;
    const host = u.hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') return false;
    return String(u.port) === String(backendPort);
  } catch (_e) {
    return false;
  }
}

function isExternalHttp(urlString) {
  try {
    const u = new URL(urlString);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_e) {
    return false;
  }
}

function pollHealth(port, deadlineMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + deadlineMs;
    const attempt = () => {
      const req = http.get(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/health',
          timeout: 1500,
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(body);
            } else if (Date.now() < deadline) {
              setTimeout(attempt, HEALTH_POLL_MS);
            } else {
              reject(new Error('Backend health check failed: HTTP ' + res.statusCode));
            }
          });
        }
      );
      req.on('timeout', () => {
        req.destroy();
        if (Date.now() < deadline) setTimeout(attempt, HEALTH_POLL_MS);
        else reject(new Error('Backend health check timed out'));
      });
      req.on('error', () => {
        if (Date.now() < deadline) setTimeout(attempt, HEALTH_POLL_MS);
        else reject(new Error('Backend did not become ready on 127.0.0.1:' + port));
      });
    };
    attempt();
  });
}

function killBackendTreeSync() {
  if (!backendProcess || !backendProcess.pid) return;
  const pid = backendProcess.pid;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch (_e) {
        try {
          backendProcess.kill('SIGTERM');
        } catch (_e2) {}
      }
    }
  } catch (_e) {
    // best effort
  }
  backendProcess = null;
}

function killBackendTree() {
  if (!backendProcess || !backendProcess.pid) return;
  const pid = backendProcess.pid;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch (_e) {
        try {
          backendProcess.kill('SIGTERM');
        } catch (_e2) {}
      }
    }
  } catch (_e) {
    // best effort
  }
  backendProcess = null;
}

async function startBackend() {
  const stage = stageHostMode();
  backendHost = stage ? '0.0.0.0' : '127.0.0.1';
  backendPort = await findFreePort();

  const userDataDir = app.getPath('userData');
  ensureDir(userDataDir);
  migrateLegacyDbNextToExe(userDataDir);

  const exe = backendExecutablePath();
  if (!fs.existsSync(exe)) {
    throw new Error('Backend executable not found: ' + exe);
  }

  const args = [
    '--port',
    String(backendPort),
    '--host',
    backendHost,
    '--data-dir',
    userDataDir,
    '--wordlists-dir',
    bundledWordlistsDir(),
    '--web-dir',
    bundledWebDir(),
  ];

  backendProcess = spawn(exe, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  backendReady = false;

  let stderr = '';
  backendProcess.stderr.on('data', (d) => {
    stderr += d.toString();
    if (stderr.length > 8000) stderr = stderr.slice(-8000);
  });
  backendProcess.stdout.on('data', () => {});

  const earlyExit = new Promise((_resolve, reject) => {
    backendProcess.once('error', (err) => reject(err));
    backendProcess.once('exit', (code, signal) => {
      if (!backendReady && !quitting) {
        reject(
          new Error(
            'Backend exited before becoming ready (code ' +
              code +
              ', signal ' +
              signal +
              '). ' +
              (stderr ? stderr.trim().slice(-1200) : '')
          )
        );
      }
    });
  });

  await Promise.race([pollHealth(backendPort, HEALTH_TIMEOUT_MS), earlyExit]);
  backendReady = true;

  backendProcess.on('exit', (code, signal) => {
    if (quitting) return;
    const msg =
      'The TypeX backend stopped unexpectedly (code ' +
      code +
      ', signal ' +
      signal +
      '). The application will close.';
    dialog.showErrorBox('TypeX Backend Stopped', msg);
    quitting = true;
    app.quit();
  });
}

function iconPath() {
  const candidates = [
    path.join(__dirname, 'build', 'icon.ico'),
    path.join(__dirname, '..', 'assets', 'icons', 'typex.ico'),
    path.join(process.resourcesPath || '', 'icon.ico'),
  ];
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c)) return c;
    } catch (_e) {}
  }
  return undefined;
}

function createWindow() {
  const stage = stageHostMode();
  const startPath = stage ? '/admin' : '/';
  const preload = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    center: true,
    show: false,
    title: APP_TITLE,
    backgroundColor: BACKGROUND_COLOR,
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: fs.existsSync(preload) ? preload : undefined,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  if (app.isPackaged) {
    mainWindow.webContents.on('devtools-opened', () => {
      try {
        mainWindow.webContents.closeDevTools();
      } catch (_e) {}
    });
    mainWindow.webContents.on('context-menu', (e) => e.preventDefault());
  }

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttp(url) && !allowedLocalOrigin(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (allowedLocalOrigin(url)) return;
    event.preventDefault();
    if (isExternalHttp(url)) {
      shell.openExternal(url);
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const url = 'http://127.0.0.1:' + backendPort + startPath;
  return mainWindow.loadURL(url);
}

app.on('before-quit', () => {
  quitting = true;
  killBackendTreeSync();
});

app.on('will-quit', () => {
  killBackendTreeSync();
});

app.on('window-all-closed', () => {
  quitting = true;
  killBackendTree();
  app.quit();
});

process.on('exit', () => {
  killBackendTreeSync();
});

async function main() {
  if (!gotSingleInstanceLock) return;
  await app.whenReady();

  // Keep permissions tight; this app only needs local HTTP.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  try {
    await startBackend();
    await createWindow();
  } catch (err) {
    const detail = err && err.stack ? err.stack : String(err);
    dialog.showErrorBox('TypeX Failed to Start', 'The local backend could not be started.\n\n' + detail);
    quitting = true;
    killBackendTreeSync();
    app.quit();
  }
}

main().catch((err) => {
  try {
    dialog.showErrorBox('TypeX Error', String(err && err.stack ? err.stack : err));
  } catch (_e) {}
  quitting = true;
  killBackendTreeSync();
  app.quit();
});
