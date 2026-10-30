const fs = require("fs");
const path = require("path");

const liveStatePath = path.resolve(__dirname, "../../backend/data/competition_state.json");
const backupDir = path.resolve(__dirname, "../../backend/data/backups");

if (!fs.existsSync(liveStatePath)) {
  console.error(`[Error] Live state file not found at ${liveStatePath}`);
  process.exit(1);
}

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const timestamp = Date.now();
const backupFile = path.join(backupDir, `competition_state-${timestamp}.json`);

fs.copyFileSync(liveStatePath, backupFile);
console.log(`[✓] Live event state successfully backed up to:`);
console.log(`    ${backupFile}`);
