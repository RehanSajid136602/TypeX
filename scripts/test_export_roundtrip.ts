import ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { sanitizeCsvValue, buildExcelWorkbook, ExportData } from "../frontend/src/utils/exportUtils";

async function runExportVerification() {
  console.log("========================================================");
  console.log("       SECTION 4: EXPORT VERIFICATION & ROUNDTRIP       ");
  console.log("========================================================");

  // 1. CSV Formula Injection Test
  console.log("\n[1] Testing CSV Formula Injection Defense...");
  const rawAttacks = ["=1+1", "+100", "-50", "@SUM(A1:B2)", "Normal Text", -42, 100];
  const csvSanitized = rawAttacks.map(sanitizeCsvValue);

  // Text starting with =, +, -, @ must have leading apostrophe in CSV
  if (csvSanitized[0] !== "'=1+1") throw new Error("CSV failed to prefix =");
  if (csvSanitized[1] !== "'+100") throw new Error("CSV failed to prefix +");
  if (csvSanitized[2] !== "'-50") throw new Error("CSV failed to prefix -");
  if (csvSanitized[3] !== "'@SUM(A1:B2)") throw new Error("CSV failed to prefix @");
  if (csvSanitized[4] !== "Normal Text") throw new Error("CSV altered normal text");
  // Genuine negative numbers must stay numbers
  if (csvSanitized[5] !== -42 || typeof csvSanitized[5] !== "number") throw new Error("CSV corrupted genuine negative number");
  if (csvSanitized[6] !== 100 || typeof csvSanitized[6] !== "number") throw new Error("CSV corrupted positive number");
  console.log("✓ CSV: Text cells with =, +, -, @ prefixed with apostrophe; genuine negative numbers preserved as numbers.");

  // 2. XLSX Typed Cell and Round-Trip Test
  console.log("\n[2] Building XLSX via ExcelJS with Formula Attacks & Typed Cells...");
  const sampleData: ExportData = {
    profile: {
      name: "=DANGEROUS_PROFILE()",
      createdAt: "2026-05-01T10:00:00.000Z",
    },
    summary: {
      personalBestWpm: 127.5,
      personalBestDate: "2026-05-03T18:30:00.000Z",
      avgLast10Wpm: 118.2,
      avgAccuracy: 98.4,
      totalTests: 42,
      totalTimeTypedSeconds: 1330,
      currentStreak: 5,
      longestStreak: 5,
      wpmTrendPerWeek: -3.5, // Genuine negative number
    },
    tests: [
      {
        id: 1,
        startedAtIso: "2026-05-01T10:00:00.000Z",
        localTime: "2026-05-01 15:00:00",
        mode: "+time_attack",
        config: "-config_attack",
        durationSeconds: 30,
        netWpm: 127.5,
        rawWpm: 132.5,
        accuracy: 98.5,
        consistency: 92.0,
        correctChars: 380,
        incorrectChars: 10,
        extraChars: 0,
        uncorrectedErrors: 8,
        correctedErrors: 2,
        totalKeystrokes: 400,
      },
    ],
    mistypedKeys: [
      {
        key: "@at_key",
        attempts: 100,
        errors: 10,
        errorRatePct: 10.0,
        avgFlightMs: 150.0,
      },
    ],
    letterConfusions: [
      {
        expected: "e",
        typed: "r",
        count: 84,
      },
    ],
    mistypedWords: [
      {
        word: "=eval(cmd)",
        count: 42,
      },
    ],
    dailyActivity: [
      {
        date: "2026-05-01",
        testCount: 9,
        avgWpm: 110.0,
        avgAccuracy: 95.8,
      },
    ],
  };

  const wb = await buildExcelWorkbook(sampleData);
  const outDir = path.join("/tmp", "typex_export_audit");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const xlsxPath = path.join(outDir, "test_export.xlsx");
  await wb.xlsx.writeFile(xlsxPath);
  console.log(`✓ XLSX generated at: ${xlsxPath}`);

  // 3. Inspect raw cell types using ExcelJS read-back
  console.log("\n[3] Inspecting raw cell types & values...");
  const readWb = new ExcelJS.Workbook();
  await readWb.xlsx.readFile(xlsxPath);

  // Check Summary sheet (Row 1 is Header ["Metric", "Value"], Row 2 is Profile, Row 4 is PB, Row 12 is Trend)
  const summarySheet = readWb.getWorksheet("Summary")!;
  const profRow = summarySheet.getRow(2);
  const profCell = profRow.getCell(2);
  const pbRow = summarySheet.getRow(4);
  const pbCell = pbRow.getCell(2);
  const trendRow = summarySheet.getRow(12);
  const trendCell = trendRow.getCell(2);

  console.log(`  Cell Profile Name Raw Value: ${JSON.stringify(profCell.value)}`);
  console.log(`  Cell PB WPM Raw Value: ${JSON.stringify(pbCell.value)} (Type: ${typeof pbCell.value})`);
  console.log(`  Cell Trend (Genuine Negative) Raw Value: ${JSON.stringify(trendCell.value)} (Type: ${typeof trendCell.value})`);

  // Assert Profile Name is stored as string/richText, NOT formula
  if (typeof profCell.value === "object" && (profCell.value as any)?.formula) {
    throw new Error("Cell '=DANGEROUS_PROFILE()' was stored as an evaluated formula!");
  }
  // Assert PB is numeric
  if (typeof pbCell.value !== "number" || pbCell.value !== 127.5) {
    throw new Error(`Cell PB must be numeric 127.5, got ${pbCell.value}`);
  }
  // Assert Genuine negative number is numeric
  if (typeof trendCell.value !== "number" || trendCell.value !== -3.5) {
    throw new Error(`Cell Trend must be numeric -3.5, got ${trendCell.value}`);
  }

  // Check Tests sheet (+time_attack and -config_attack)
  const testsSheet = readWb.getWorksheet("Tests")!;
  const testDataRow = testsSheet.getRow(2);
  const modeVal = testDataRow.getCell(4).value;
  const configVal = testDataRow.getCell(5).value;
  console.log(`  Cell Mode Raw Value: ${JSON.stringify(modeVal)}`);
  console.log(`  Cell Config Raw Value: ${JSON.stringify(configVal)}`);
  if ((modeVal as any)?.formula || (configVal as any)?.formula) {
    throw new Error("Mode or Config stored as formula!");
  }

  // Check Mistyped Words sheet (=eval(cmd))
  const wordsSheet = readWb.getWorksheet("Mistyped Words")!;
  const wordRow = wordsSheet.getRow(2);
  const wordVal = wordRow.getCell(1).value;
  console.log(`  Cell Word Raw Value: ${JSON.stringify(wordVal)}`);
  if ((wordVal as any)?.formula) {
    throw new Error("Word '=eval(cmd)' stored as formula!");
  }

  // 4. Headless LibreOffice Conversion Test
  console.log("\n[4] Headless LibreOffice Conversion to CSV & Text Inspection...");
  try {
    execSync(`libreoffice --headless --convert-to csv --outdir "${outDir}" "${xlsxPath}"`, { stdio: "pipe" });
    const convertedCsv = path.join(outDir, "test_export.csv");
    const csvContent = fs.readFileSync(convertedCsv, "utf8");
    console.log("LibreOffice Headless Export CSV Output (First 6 lines):");
    console.log(csvContent.split("\n").slice(0, 6).join("\n"));

    // Verify '=DANGEROUS_PROFILE()' was displayed as text, not evaluated, and has NO stray literal apostrophe in XLSX
    if (csvContent.includes("#NAME?") || csvContent.includes("#REF!") || csvContent.includes("#VALUE!")) {
      throw new Error("LibreOffice evaluated formula injection attack!");
    }
    if (csvContent.includes("'=DANGEROUS_PROFILE()")) {
      throw new Error("XLSX has stray literal apostrophe in displayed cell!");
    }
    if (!csvContent.includes("=DANGEROUS_PROFILE()")) {
      throw new Error("Displayed text missing expected '=DANGEROUS_PROFILE()'");
    }
    console.log("✓ LibreOffice headlessly rendered the sheet: string is preserved as raw text with 0 evaluation and 0 stray apostrophes.");
  } catch (err: any) {
    console.error("LibreOffice verification error:", err.message);
    throw err;
  }

  console.log("\n========================================================");
  console.log("   EXPORT VERIFICATION & ROUNDTRIP PASSED [✓]          ");
  console.log("========================================================");
}

runExportVerification().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
