import ExcelJS from "exceljs";

export interface ExportData {
  profile: {
    name: string;
    createdAt: string;
  };
  summary: {
    personalBestWpm: number;
    personalBestDate: string;
    avgLast10Wpm: number;
    avgAccuracy: number;
    totalTests: number;
    totalTimeTypedSeconds: number;
    currentStreak: number;
    longestStreak: number;
    wpmTrendPerWeek: number;
  };
  tests: Array<{
    id: number;
    startedAtIso: string;
    localTime: string;
    mode: string;
    config: string;
    durationSeconds: number;
    netWpm: number;
    rawWpm: number;
    accuracy: number;
    consistency: number;
    correctChars: number;
    incorrectChars: number;
    extraChars: number;
    uncorrectedErrors: number;
    correctedErrors: number;
    totalKeystrokes: number;
  }>;
  mistypedKeys: Array<{
    key: string;
    attempts: number;
    errors: number;
    errorRatePct: number;
    avgFlightMs: number;
  }>;
  letterConfusions: Array<{
    expected: string;
    typed: string;
    count: number;
  }>;
  mistypedWords: Array<{
    word: string;
    count: number;
  }>;
  dailyActivity: Array<{
    date: string;
    testCount: number;
    avgWpm: number;
    avgAccuracy: number;
  }>;
}

/**
 * Defense against spreadsheet formula injection in CSV exports.
 * For CSV files, any text cell starting with =, +, -, or @ is prepended with a single apostrophe (').
 * Genuine numbers (including negative numbers) remain numeric and are not prepended.
 */
export function sanitizeCsvValue(val: any): any {
  if (typeof val === "string") {
    if (val.length > 0 && ["=", "+", "-", "@"].includes(val[0])) {
      return `'${val}`;
    }
  }
  return val;
}

export function exportToCsv(data: ExportData, profileName: string): void {
  const sanitize = (v: any) => {
    const s = String(sanitizeCsvValue(v) ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines: string[] = [];

  // Summary section
  lines.push(sanitize("TypeX Export - Summary"));
  lines.push(`${sanitize("Profile")},${sanitize(data.profile.name)}`);
  lines.push(`${sanitize("Personal Best Net WPM")},${sanitize(data.summary.personalBestWpm)}`);
  lines.push(`${sanitize("Personal Best Date")},${sanitize(data.summary.personalBestDate)}`);
  lines.push(`${sanitize("Average Net WPM (Last 10)")},${sanitize(data.summary.avgLast10Wpm)}`);
  lines.push(`${sanitize("Average Accuracy (%)")},${sanitize(data.summary.avgAccuracy)}`);
  lines.push(`${sanitize("Total Tests")},${sanitize(data.summary.totalTests)}`);
  lines.push(`${sanitize("Total Typing Time (s)")},${sanitize(data.summary.totalTimeTypedSeconds)}`);
  lines.push(`${sanitize("Current Streak (days)")},${sanitize(data.summary.currentStreak)}`);
  lines.push(`${sanitize("Longest Streak (days)")},${sanitize(data.summary.longestStreak)}`);
  lines.push(`${sanitize("WPM Trend / Week")},${sanitize(data.summary.wpmTrendPerWeek)}`);
  lines.push("");

  // Tests table
  lines.push(sanitize("Tests"));
  const testHeaders = [
    "Test ID",
    "Started At (ISO-8601 UTC)",
    "Local Time",
    "Mode",
    "Config",
    "Duration (s)",
    "Net WPM",
    "Raw WPM",
    "Accuracy (%)",
    "Consistency (%)",
    "Correct Chars",
    "Incorrect Chars",
    "Extra Chars",
    "Uncorrected Errors",
    "Corrected Errors",
    "Total Keystrokes",
  ];
  lines.push(testHeaders.map(sanitize).join(","));

  data.tests.forEach((t) => {
    lines.push(
      [
        t.id,
        t.startedAtIso,
        t.localTime,
        t.mode,
        t.config,
        t.durationSeconds,
        t.netWpm,
        t.rawWpm,
        t.accuracy,
        t.consistency,
        t.correctChars,
        t.incorrectChars,
        t.extraChars,
        t.uncorrectedErrors,
        t.correctedErrors,
        t.totalKeystrokes,
      ]
        .map(sanitize)
        .join(",")
    );
  });

  lines.push("");
  lines.push(sanitize("Mistyped Keys"));
  lines.push(["Key", "Attempts", "Errors", "Error Rate (%)", "Avg Flight Time (ms)"].map(sanitize).join(","));
  data.mistypedKeys.forEach((k) => {
    lines.push([k.key, k.attempts, k.errors, k.errorRatePct, k.avgFlightMs].map(sanitize).join(","));
  });

  lines.push("");
  lines.push(sanitize("Letter Confusions"));
  lines.push(["Expected Key", "Typed Key", "Count"].map(sanitize).join(","));
  data.letterConfusions.forEach((c) => {
    lines.push([c.expected, c.typed, c.count].map(sanitize).join(","));
  });

  lines.push("");
  lines.push(sanitize("Mistyped Words"));
  lines.push(["Word", "Error Count"].map(sanitize).join(","));
  data.mistypedWords.forEach((w) => {
    lines.push([w.word, w.count].map(sanitize).join(","));
  });

  lines.push("");
  lines.push(sanitize("Daily Activity"));
  lines.push(["Date", "Test Count", "Avg WPM", "Avg Accuracy (%)"].map(sanitize).join(","));
  data.dailyActivity.forEach((d) => {
    lines.push([d.date, d.testCount, d.avgWpm, d.avgAccuracy].map(sanitize).join(","));
  });

  // UTF-8 BOM \uFEFF ensures Excel recognizes UTF-8 encoded text properly
  const csvContent = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `typex-${profileName.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}-${dateStr}.csv`;

  triggerDownload(blob, filename);
}

/**
 * Builds an ExcelJS Workbook with typed cells:
 * - Text cells beginning with '=', '+', '-', or '@' are explicitly assigned as string values
 *   (cell.value = String(val), cell.type = ExcelJS.ValueType.String), preventing formula evaluation
 *   without injecting a literal stray apostrophe into the text.
 * - Genuine numbers (including negative numbers) are stored with cell.value = Number(val) (numeric).
 */
export async function buildExcelWorkbook(data: ExportData): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TypeX";
  wb.created = new Date();

  // Helper to add typed row
  const addTypedRow = (worksheet: ExcelJS.Worksheet, values: any[]) => {
    const row = worksheet.addRow([]);
    values.forEach((val, idx) => {
      const cell = row.getCell(idx + 1);
      if (typeof val === "number") {
        cell.value = val;
      } else if (typeof val === "string") {
        // Enforce plain text value so Excel treats it as raw string, not a formula
        cell.value = { richText: [{ text: val }] };
      } else if (val === null || val === undefined) {
        cell.value = "";
      } else {
        cell.value = String(val);
      }
    });
    row.commit();
  };

  // 1. Summary Sheet
  const wsSummary = wb.addWorksheet("Summary");
  wsSummary.columns = [{ header: "Metric", key: "metric", width: 30 }, { header: "Value", key: "value", width: 30 }];
  addTypedRow(wsSummary, ["Profile", data.profile.name]);
  addTypedRow(wsSummary, ["Profile Created", data.profile.createdAt]);
  addTypedRow(wsSummary, ["Personal Best Net WPM", data.summary.personalBestWpm]);
  addTypedRow(wsSummary, ["Personal Best Date", data.summary.personalBestDate]);
  addTypedRow(wsSummary, ["Average Net WPM (Last 10)", data.summary.avgLast10Wpm]);
  addTypedRow(wsSummary, ["Average Accuracy (%)", data.summary.avgAccuracy]);
  addTypedRow(wsSummary, ["Total Tests", data.summary.totalTests]);
  addTypedRow(wsSummary, ["Total Typing Time (s)", data.summary.totalTimeTypedSeconds]);
  addTypedRow(wsSummary, ["Current Streak (days)", data.summary.currentStreak]);
  addTypedRow(wsSummary, ["Longest Streak (days)", data.summary.longestStreak]);
  addTypedRow(wsSummary, ["WPM Trend / Week", data.summary.wpmTrendPerWeek]);

  // 2. Tests Sheet
  const wsTests = wb.addWorksheet("Tests");
  const testHeaders = [
    "Test ID",
    "Started At (ISO)",
    "Local Time",
    "Mode",
    "Config",
    "Duration (s)",
    "Net WPM",
    "Raw WPM",
    "Accuracy (%)",
    "Consistency (%)",
    "Correct Chars",
    "Incorrect Chars",
    "Extra Chars",
    "Uncorrected Errors",
    "Corrected Errors",
    "Total Keystrokes",
  ];
  wsTests.addRow(testHeaders);
  data.tests.forEach((t) => {
    addTypedRow(wsTests, [
      t.id,
      t.startedAtIso,
      t.localTime,
      t.mode,
      t.config,
      t.durationSeconds,
      t.netWpm,
      t.rawWpm,
      t.accuracy,
      t.consistency,
      t.correctChars,
      t.incorrectChars,
      t.extraChars,
      t.uncorrectedErrors,
      t.correctedErrors,
      t.totalKeystrokes,
    ]);
  });

  // 3. Mistyped Keys Sheet
  const wsKeys = wb.addWorksheet("Mistyped Keys");
  wsKeys.addRow(["Key", "Attempts", "Errors", "Error Rate (%)", "Avg Flight Time (ms)"]);
  data.mistypedKeys.forEach((k) => {
    addTypedRow(wsKeys, [k.key, k.attempts, k.errors, k.errorRatePct, k.avgFlightMs]);
  });

  // 4. Letter Confusions Sheet
  const wsConf = wb.addWorksheet("Letter Confusions");
  wsConf.addRow(["Expected Key", "Typed Key", "Count"]);
  data.letterConfusions.forEach((c) => {
    addTypedRow(wsConf, [c.expected, c.typed, c.count]);
  });

  // 5. Mistyped Words Sheet
  const wsWords = wb.addWorksheet("Mistyped Words");
  wsWords.addRow(["Word", "Error Count"]);
  data.mistypedWords.forEach((w) => {
    addTypedRow(wsWords, [w.word, w.count]);
  });

  // 6. Daily Activity Sheet
  const wsDaily = wb.addWorksheet("Daily Activity");
  wsDaily.addRow(["Date", "Test Count", "Avg WPM", "Avg Accuracy (%)"]);
  data.dailyActivity.forEach((d) => {
    addTypedRow(wsDaily, [d.date, d.testCount, d.avgWpm, d.avgAccuracy]);
  });

  return wb;
}

export async function exportToXlsx(data: ExportData, profileName: string): Promise<void> {
  const wb = await buildExcelWorkbook(data);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `typex-${profileName.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}-${dateStr}.xlsx`;

  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
