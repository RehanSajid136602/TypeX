"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Volume2,
  VolumeX,
  AlertTriangle,
  Download,
  Upload,
  RotateCcw,
  Check,
  FileSpreadsheet,
  FileText,
  Database,
  Sparkles,
} from "lucide-react";
import {
  useSettings,
  THEME_BACKGROUNDS,
  THEME_DEFAULT_CARETS,
  THEME_DEFAULT_CORRECT,
  FONT_SIZE_REM,
  getContrastRatio,
} from "@/context/SettingsContext";
import {
  CaretStyle,
  StopOnError,
  FontSize,
  ThemeName,
  SwitchProfile,
} from "@/types/typing";
import { useSoundEngine } from "@/hooks/useSoundEngine";
import { useProfile } from "@/context/ProfileContext";
import { authenticatedFetch } from "@/utils/apiSecurity";
import { exportToCsv, exportToXlsx, ExportData } from "@/utils/exportUtils";

// Curated Swatches
const CORRECT_COLOR_SWATCHES = [
  { label: "Theme default", value: "default", displayColor: THEME_DEFAULT_CORRECT },
  { label: "Emerald", value: "#10b981", displayColor: "#10b981" },
  { label: "Amber Gold", value: "#f59e0b", displayColor: "#f59e0b" },
  { label: "Cyan Ice", value: "#66fcf1", displayColor: "#66fcf1" },
  { label: "Lavender", value: "#a78bfa", displayColor: "#a78bfa" },
  { label: "Pure White", value: "#ffffff", displayColor: "#ffffff" },
];

const CARET_COLOR_SWATCHES = [
  { label: "Theme default", value: "default" },
  { label: "Amber Gold", value: "#f59e0b" },
  { label: "Tokyo Blue", value: "#7aa2f7" },
  { label: "Nordic Ice", value: "#88c0d0" },
  { label: "Neon Cyan", value: "#66fcf1" },
  { label: "Vivid Coral", value: "#fb7185" },
  { label: "Pure White", value: "#ffffff" },
];

export default function SettingsPage() {
  const { settings, updateSetting, resetSettings } = useSettings();
  const { playSampleStroke } = useSoundEngine();
  const { activeProfile } = useProfile();

  // Custom hex states
  const [customCorrectHex, setCustomCorrectHex] = useState(
    settings.correctColor !== "default" ? settings.correctColor : ""
  );
  const [customCaretHex, setCustomCaretHex] = useState(
    settings.caretColor !== "default" ? settings.caretColor : ""
  );

  // Data operation states
  const [dataNotice, setDataNotice] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Resolved colors
  const effectiveCorrectColor =
    settings.correctColor === "default" ? THEME_DEFAULT_CORRECT : settings.correctColor;
  const effectiveCaretColor =
    settings.caretColor === "default" ? THEME_DEFAULT_CARETS[settings.theme] : settings.caretColor;
  const themeBackground = THEME_BACKGROUNDS[settings.theme] || "#0b0c10";

  // Contrast ratio check
  const contrastRatio = getContrastRatio(effectiveCorrectColor, themeBackground);
  const isLowContrast = contrastRatio < 3.0;

  // Custom Hex Handlers
  const handleApplyCustomCorrect = (val: string) => {
    let clean = val.trim();
    if (!clean.startsWith("#")) clean = "#" + clean;
    setCustomCorrectHex(clean);
    if (/^#[0-9A-Fa-f]{6}$/.test(clean)) {
      updateSetting("correctColor", clean);
    }
  };

  const handleApplyCustomCaret = (val: string) => {
    let clean = val.trim();
    if (!clean.startsWith("#")) clean = "#" + clean;
    setCustomCaretHex(clean);
    if (/^#[0-9A-Fa-f]{6}$/.test(clean)) {
      updateSetting("caretColor", clean);
    }
  };

  // Switch Profile Selection
  const handleSelectProfile = (profile: SwitchProfile) => {
    updateSetting("soundProfile", profile);
    playSampleStroke(profile);
  };

  // ─── Data Operations ───────────────────────────────────────────────────────

  // 1. Export CSV / Excel
  const handleExport = async (format: "csv" | "xlsx") => {
    try {
      setDataNotice({ type: "info", msg: `Generating ${format.toUpperCase()} export...` });
      const profileId = activeProfile?.id || -1;
      const res = await authenticatedFetch(`/api/accounts/analytics?profileId=${profileId}`);
      let exportData: ExportData;
      if (res.ok) {
        const analytics = await res.json();
        const tests = (analytics.tests || []).map((t: any) => ({
          id: t.id,
          startedAtIso: new Date(t.startedAt).toISOString(),
          localTime: new Date(t.startedAt).toLocaleString(),
          mode: t.mode,
          config: typeof t.config === "string" ? t.config : JSON.stringify(t.config || {}),
          durationSeconds: Math.round(t.durationMs / 1000),
          netWpm: Number(t.netWpm.toFixed(1)),
          rawWpm: Number(t.rawWpm.toFixed(1)),
          accuracy: Number(t.accuracy.toFixed(1)),
          consistency: Number(t.consistency?.toFixed(1) || 0),
          correctChars: t.correctChars || 0,
          incorrectChars: t.incorrectChars || 0,
          extraChars: t.extraChars || 0,
          uncorrectedErrors: t.uncorrectedErrors || 0,
          correctedErrors: t.correctedErrors || 0,
          totalKeystrokes: t.totalKeystrokes || 0,
        }));
        exportData = {
          profile: {
            name: activeProfile?.name || "TypeX_Practice",
            createdAt: activeProfile ? new Date(activeProfile.createdAt).toISOString() : new Date().toISOString(),
          },
          summary: {
            personalBestWpm: Number((analytics.overview?.personalBestWpm || 0).toFixed(1)),
            personalBestDate: analytics.overview?.personalBestStartedAt
              ? new Date(analytics.overview.personalBestStartedAt).toISOString()
              : "-",
            avgLast10Wpm: Number((analytics.overview?.avgLast10NetWpm || 0).toFixed(1)),
            avgAccuracy: Number((analytics.overview?.overallAccuracy || 0).toFixed(1)),
            totalTests: analytics.overview?.totalTests || 0,
            totalTimeTypedSeconds: Math.round((analytics.overview?.totalDurationMs || 0) / 1000),
            currentStreak: analytics.streak?.currentStreak || 0,
            longestStreak: analytics.streak?.longestStreak || 0,
            wpmTrendPerWeek: Number((analytics.trend?.wpmChangePerWeek || 0).toFixed(2)),
          },
          tests,
          mistypedKeys: [],
          letterConfusions: [],
          mistypedWords: [],
          dailyActivity: [],
        };
      } else {
        // Fallback minimal export data
        exportData = {
          profile: { name: activeProfile?.name || "TypeX_Practice", createdAt: new Date().toISOString() },
          summary: {
            personalBestWpm: 0,
            personalBestDate: "-",
            avgLast10Wpm: 0,
            avgAccuracy: 0,
            totalTests: 0,
            totalTimeTypedSeconds: 0,
            currentStreak: 0,
            longestStreak: 0,
            wpmTrendPerWeek: 0,
          },
          tests: [],
          mistypedKeys: [],
          letterConfusions: [],
          mistypedWords: [],
          dailyActivity: [],
        };
      }

      if (format === "csv") {
        exportToCsv(exportData, activeProfile?.name || "TypeX_Practice");
      } else {
        exportToXlsx(exportData, activeProfile?.name || "TypeX_Practice");
      }
      setDataNotice({ type: "success", msg: `${format.toUpperCase()} export downloaded successfully.` });
    } catch (err: any) {
      setDataNotice({ type: "error", msg: `Export failed: ${err.message || err}` });
    }
  };

  // 2. Backup Download
  const handleBackupDownload = async () => {
    try {
      setDataNotice({ type: "info", msg: "Creating online backup snapshot..." });
      const res = await authenticatedFetch("/api/accounts/backup/download");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Backup download failed");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `typex-backup-${Date.now()}.db`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setDataNotice({ type: "success", msg: "SQLite database backup downloaded." });
    } catch (err: any) {
      setDataNotice({ type: "error", msg: err.message || "Failed to download backup" });
    }
  };

  // 3. Restore Upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsRestoring(true);
      setDataNotice({ type: "info", msg: "Validating SQLite header & integrity..." });

      const buffer = await file.arrayBuffer();
      const res = await authenticatedFetch("/api/accounts/restore", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: buffer,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Database restore rejected by validation");
      }

      setDataNotice({
        type: "success",
        msg: `Database restored successfully. Safety copy created at: ${data.safetyBackup || "backups"}`,
      });
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      setDataNotice({ type: "error", msg: err.message || "Database restore failed" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setIsRestoring(false);
    }
  };

  // 4. Reset All Data
  const handleConfirmReset = async () => {
    if (resetConfirmInput !== "RESET") return;
    try {
      setIsResetting(true);
      const res = await authenticatedFetch("/api/accounts/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "RESET" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Reset failed");
      }
      resetSettings();
      setIsResetModalOpen(false);
      setResetConfirmInput("");
      setDataNotice({
        type: "success",
        msg: `All data reset. Safety copy preserved at: ${data.safetyBackup}`,
      });
    } catch (err: any) {
      setDataNotice({ type: "error", msg: err.message || "Failed to reset database" });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-[var(--typed-color)] font-mono-custom pb-20 selection:bg-amber-500/20 selection:text-amber-200">
      {/* Top Navigation Bar */}
      <div className="w-full border-b border-white/[0.08] bg-black/30 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-xs text-[var(--inactive-color)] hover:text-white transition-colors group px-2 py-1 rounded-md hover:bg-white/[0.05]"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              <span>Back to Arena</span>
            </Link>
            <div className="h-4 w-px bg-white/15" />
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight text-[var(--typed-color)]">
                Settings
              </span>
              <span className="text-[10px] uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold">
                Personal Practice
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--inactive-color)]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="hidden sm:inline">Persistence: SQLite Direct (Raw SQL)</span>
          </div>
        </div>
      </div>

      {/* Main Content Layout: 2 Columns on Desktop, Sticky Preview */}
      <div className="max-w-6xl mx-auto px-6 pt-8">
        {/* Status Notice Toast / Banner */}
        {dataNotice && (
          <div
            className={`mb-6 p-3.5 rounded-xl text-xs flex items-center justify-between border ${
              dataNotice.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : dataNotice.type === "error"
                ? "bg-red-500/10 border-red-500/30 text-red-300"
                : "bg-blue-500/10 border-blue-500/30 text-blue-300"
            }`}
          >
            <div className="flex items-center gap-2">
              {dataNotice.type === "error" ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <Check className="w-4 h-4 shrink-0" />
              )}
              <span>{dataNotice.msg}</span>
            </div>
            <button
              onClick={() => setDataNotice(null)}
              className="opacity-70 hover:opacity-100 text-xs px-2 py-0.5"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN: Instrument Controls */}
          <div className="lg:col-span-7 space-y-8">
            {/* ─── SECTION 1: TYPING ────────────────────────────────────── */}
            <section className="bg-[var(--surface-color)] border border-white/[0.08] rounded-2xl p-6 shadow-xl space-y-6">
              <div className="border-b border-white/[0.08] pb-3">
                <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold opacity-90">
                  Telemetry &amp; Input Dynamics
                </span>
                <h2 className="text-base font-bold text-white tracking-tight mt-0.5">Typing</h2>
              </div>

              {/* 1. Caret Style */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--typed-color)] font-medium">1. Caret Style</span>
                  <span className="text-[var(--inactive-color)] text-[11px] capitalize">{settings.caretStyle}</span>
                </div>
                <div className="inline-flex w-full p-1 rounded-xl bg-black/40 border border-white/[0.08] gap-1">
                  {(["line", "block", "underline"] as CaretStyle[]).map((style) => {
                    const isActive = settings.caretStyle === style;
                    return (
                      <button
                        key={style}
                        type="button"
                        onClick={() => updateSetting("caretStyle", style)}
                        className={`flex-1 py-2 text-xs rounded-lg transition-all capitalize font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                          isActive
                            ? "bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                            : "text-[var(--inactive-color)] hover:text-white hover:bg-white/[0.04]"
                        }`}
                      >
                        <span className="opacity-70 text-[10px]">
                          {style === "line" ? "❙" : style === "block" ? "█" : "—"}
                        </span>
                        <span>{style}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Smooth Caret */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--typed-color)] font-medium">2. Smooth Caret</span>
                  <span className="text-[var(--inactive-color)] text-[11px]">
                    {settings.smoothCaret ? "Spring physics enabled" : "Instant jump"}
                  </span>
                </div>
                <div className="inline-flex w-full p-1 rounded-xl bg-black/40 border border-white/[0.08] gap-1">
                  {[
                    { label: "On", val: true },
                    { label: "Off", val: false },
                  ].map((item) => {
                    const isActive = settings.smoothCaret === item.val;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => updateSetting("smoothCaret", item.val)}
                        className={`flex-1 py-2 text-xs rounded-lg transition-all font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                          isActive
                            ? "bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                            : "text-[var(--inactive-color)] hover:text-white hover:bg-white/[0.04]"
                        }`}
                      >
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[var(--inactive-color)] opacity-75 pt-0.5">
                  Spring physics apply during live typing; static preview does not animate caret motion.
                </p>
              </div>

              {/* 3. Stop on Error */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--typed-color)] font-medium">3. Stop on Error</span>
                  <span className="text-[var(--inactive-color)] text-[11px] capitalize">{settings.stopOnError}</span>
                </div>
                <div className="inline-flex w-full p-1 rounded-xl bg-black/40 border border-white/[0.08] gap-1">
                  {(["off", "letter", "word"] as StopOnError[]).map((mode) => {
                    const isActive = settings.stopOnError === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updateSetting("stopOnError", mode)}
                        className={`flex-1 py-2 text-xs rounded-lg transition-all capitalize font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                          isActive
                            ? "bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                            : "text-[var(--inactive-color)] hover:text-white hover:bg-white/[0.04]"
                        }`}
                      >
                        <span>{mode}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] text-[var(--inactive-color)] space-y-1 pt-0.5">
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                    <span>
                      {settings.stopOnError === "letter"
                        ? "Letter mode: Incorrect keystrokes are rejected immediately."
                        : settings.stopOnError === "word"
                        ? "Word mode: Space key cannot advance until the active word is typed correctly."
                        : "Off mode: Free flow error tracking without input blocking."}
                    </span>
                  </div>
                  <p className="text-amber-400/80 text-[10.5px]">
                    Note: Tests run with 'Letter' reject do not count toward Learn curriculum unlock milestones.
                  </p>
                </div>
              </div>
            </section>

            {/* ─── SECTION 2: COLORS ────────────────────────────────────── */}
            <section className="bg-[var(--surface-color)] border border-white/[0.08] rounded-2xl p-6 shadow-xl space-y-6">
              <div className="border-b border-white/[0.08] pb-3">
                <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold opacity-90">
                  Chroma &amp; Spectral Palette
                </span>
                <h2 className="text-base font-bold text-white tracking-tight mt-0.5">Colors</h2>
              </div>

              {/* 4. Correct-Character Color */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--typed-color)] font-medium">4. Correct-Character Color</span>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full border border-white/20"
                      style={{ backgroundColor: effectiveCorrectColor }}
                    />
                    <span className="text-[11px] text-[var(--inactive-color)] uppercase">
                      {settings.correctColor === "default" ? "Theme default (#22c55e)" : settings.correctColor}
                    </span>
                  </div>
                </div>

                {/* Swatches + Custom Hex */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {CORRECT_COLOR_SWATCHES.map((swatch) => {
                    const isSelected = settings.correctColor === swatch.value;
                    return (
                      <button
                        key={swatch.value}
                        type="button"
                        onClick={() => {
                          updateSetting("correctColor", swatch.value);
                          if (swatch.value !== "default") setCustomCorrectHex(swatch.value);
                        }}
                        className={`group relative h-9 px-3 rounded-xl border flex items-center gap-2 transition-all cursor-pointer ${
                          isSelected
                            ? "border-amber-400/80 bg-white/[0.08] shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                            : "border-white/[0.08] bg-black/30 hover:border-white/20 hover:bg-white/[0.04]"
                        }`}
                        title={swatch.label}
                      >
                        <span
                          className="w-4 h-4 rounded-full border border-white/20 shadow-inner flex items-center justify-center shrink-0"
                          style={{ backgroundColor: swatch.displayColor }}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 text-black font-bold stroke-[3]" />}
                        </span>
                        <span className={`text-xs ${isSelected ? "text-white font-medium" : "text-zinc-400"}`}>
                          {swatch.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Hex Input */}
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-xs text-[var(--inactive-color)]">Custom Hex:</span>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      maxLength={7}
                      placeholder="#22c55e"
                      value={customCorrectHex}
                      onChange={(e) => handleApplyCustomCorrect(e.target.value)}
                      className="w-28 bg-black/40 border border-white/[0.12] focus:border-amber-400 px-3 py-1.5 rounded-lg text-xs font-mono-custom text-white focus:outline-none transition-colors"
                    />
                    {customCorrectHex && /^#[0-9A-Fa-f]{6}$/.test(customCorrectHex) && (
                      <span
                        className="absolute right-2 w-3 h-3 rounded-full border border-white/20"
                        style={{ backgroundColor: customCorrectHex }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* 5. Caret Color */}
              <div className="space-y-3 pt-3 border-t border-white/[0.06]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--typed-color)] font-medium">5. Caret Color</span>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full border border-white/20"
                      style={{ backgroundColor: effectiveCaretColor }}
                    />
                    <span className="text-[11px] text-[var(--inactive-color)] uppercase">
                      {settings.caretColor === "default"
                        ? `Theme default (${THEME_DEFAULT_CARETS[settings.theme]})`
                        : settings.caretColor}
                    </span>
                  </div>
                </div>

                {/* Swatches + Custom Hex */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {CARET_COLOR_SWATCHES.map((swatch) => {
                    const isSelected = settings.caretColor === swatch.value;
                    const displayColor =
                      swatch.value === "default"
                        ? THEME_DEFAULT_CARETS[settings.theme]
                        : swatch.value;

                    return (
                      <button
                        key={swatch.value}
                        type="button"
                        onClick={() => {
                          updateSetting("caretColor", swatch.value);
                          if (swatch.value !== "default") setCustomCaretHex(swatch.value);
                        }}
                        className={`group relative h-9 px-3 rounded-xl border flex items-center gap-2 transition-all cursor-pointer ${
                          isSelected
                            ? "border-amber-400/80 bg-white/[0.08] shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                            : "border-white/[0.08] bg-black/30 hover:border-white/20 hover:bg-white/[0.04]"
                        }`}
                        title={swatch.label}
                      >
                        <span
                          className="w-4 h-4 rounded-full border border-white/20 shadow-inner flex items-center justify-center shrink-0"
                          style={{ backgroundColor: displayColor }}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 text-black font-bold stroke-[3]" />}
                        </span>
                        <span className={`text-xs ${isSelected ? "text-white font-medium" : "text-zinc-400"}`}>
                          {swatch.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Hex Input */}
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-xs text-[var(--inactive-color)]">Custom Hex:</span>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      maxLength={7}
                      placeholder={THEME_DEFAULT_CARETS[settings.theme]}
                      value={customCaretHex}
                      onChange={(e) => handleApplyCustomCaret(e.target.value)}
                      className="w-28 bg-black/40 border border-white/[0.12] focus:border-amber-400 px-3 py-1.5 rounded-lg text-xs font-mono-custom text-white focus:outline-none transition-colors"
                    />
                    {customCaretHex && /^#[0-9A-Fa-f]{6}$/.test(customCaretHex) && (
                      <span
                        className="absolute right-2 w-3 h-3 rounded-full border border-white/20"
                        style={{ backgroundColor: customCaretHex }}
                      />
                    )}
                  </div>
                </div>

                <p className="text-[11px] text-[var(--inactive-color)] opacity-75">
                  Errors stay red and are not customizable.
                </p>
              </div>
            </section>

            {/* ─── SECTION 3: APPEARANCE ─────────────────────────────────── */}
            <section className="bg-[var(--surface-color)] border border-white/[0.08] rounded-2xl p-6 shadow-xl space-y-6">
              <div className="border-b border-white/[0.08] pb-3">
                <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold opacity-90">
                  Visual Surface &amp; Metrics
                </span>
                <h2 className="text-base font-bold text-white tracking-tight mt-0.5">Appearance</h2>
              </div>

              {/* 6. Theme */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--typed-color)] font-medium">6. Theme</span>
                  <span className="text-[var(--inactive-color)] text-[11px] capitalize">{settings.theme}</span>
                </div>
                <div className="inline-flex w-full p-1 rounded-xl bg-black/40 border border-white/[0.08] gap-1">
                  {[
                    { id: "obsidian", label: "Obsidian Gold" },
                    { id: "tokyo", label: "Tokyo Night" },
                    { id: "nordic", label: "Nordic Frost" },
                  ].map((t) => {
                    const isActive = settings.theme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => updateSetting("theme", t.id as ThemeName)}
                        className={`flex-1 py-2 text-xs rounded-lg transition-all font-medium flex items-center justify-center gap-2 cursor-pointer ${
                          isActive
                            ? "bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                            : "text-[var(--inactive-color)] hover:text-white hover:bg-white/[0.04]"
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-white/20"
                          style={{ backgroundColor: THEME_BACKGROUNDS[t.id as ThemeName] }}
                        />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 7. Font Size */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--typed-color)] font-medium">7. Font Size</span>
                  <span className="text-[var(--inactive-color)] text-[11px]">{FONT_SIZE_REM[settings.fontSize]}</span>
                </div>
                <div className="inline-flex w-full p-1 rounded-xl bg-black/40 border border-white/[0.08] gap-1">
                  {(["S", "M", "L", "XL"] as FontSize[]).map((size) => {
                    const isActive = settings.fontSize === size;
                    return (
                      <button
                        key={size}
                        type="button"
                        onClick={() => updateSetting("fontSize", size)}
                        className={`flex-1 py-2 text-xs rounded-lg transition-all font-medium flex items-center justify-center gap-1 cursor-pointer ${
                          isActive
                            ? "bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                            : "text-[var(--inactive-color)] hover:text-white hover:bg-white/[0.04]"
                        }`}
                      >
                        <span>{size}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[var(--inactive-color)] opacity-75">
                  Keep the existing monospace font (JetBrains Mono). Zero layout shift guaranteed.
                </p>
              </div>
            </section>

            {/* ─── SECTION 4: SOUND ─────────────────────────────────────── */}
            <section className="bg-[var(--surface-color)] border border-white/[0.08] rounded-2xl p-6 shadow-xl space-y-6">
              <div className="border-b border-white/[0.08] pb-3">
                <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold opacity-90">
                  Acoustic Synthesis (Web Audio)
                </span>
                <h2 className="text-base font-bold text-white tracking-tight mt-0.5">Sound</h2>
              </div>

              {/* 8. Volume Slider (0 - 100) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--typed-color)] font-medium">8. Volume</span>
                  <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                    {settings.volume === 0 ? (
                      <>
                        <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-zinc-500">Muted (0)</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>{settings.volume}%</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={settings.volume}
                    onChange={(e) => updateSetting("volume", parseInt(e.target.value, 10))}
                    className="w-full h-1.5 bg-black/60 rounded-lg appearance-none cursor-pointer accent-amber-400 border border-white/[0.08]"
                  />
                </div>
              </div>

              {/* 9. Switch Profile */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--typed-color)] font-medium">9. Switch Profile</span>
                  <span className="text-[var(--inactive-color)] text-[11px] capitalize">
                    {settings.soundProfile} profile active
                  </span>
                </div>
                <div className="inline-flex w-full p-1 rounded-xl bg-black/40 border border-white/[0.08] gap-1">
                  {(["clicky", "thocky", "soft"] as SwitchProfile[]).map((prof) => {
                    const isActive = settings.soundProfile === prof;
                    return (
                      <button
                        key={prof}
                        type="button"
                        onClick={() => handleSelectProfile(prof)}
                        className={`flex-1 py-2 text-xs rounded-lg transition-all capitalize font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                          isActive
                            ? "bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                            : "text-[var(--inactive-color)] hover:text-white hover:bg-white/[0.04]"
                        }`}
                      >
                        <Sparkles className="w-3 h-3 opacity-60" />
                        <span>{prof}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[var(--inactive-color)] opacity-75">
                  Selecting a profile plays one sample keystroke immediately. Pure Web Audio synthesis with no audio assets.
                </p>
              </div>
            </section>

            {/* ─── SECTION 5: DATA OPERATIONS (3 Buttons, Not Settings) ───── */}
            <section className="bg-[var(--surface-color)] border border-white/[0.08] rounded-2xl p-6 shadow-xl space-y-6">
              <div className="border-b border-white/[0.08] pb-3">
                <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold opacity-90">
                  Maintenance &amp; Archival
                </span>
                <h2 className="text-base font-bold text-white tracking-tight mt-0.5">
                  Data (3 Operations)
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 1. Export CSV / Excel */}
                <div className="bg-black/30 border border-white/[0.08] rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-white font-semibold">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                      <span>Export Data</span>
                    </div>
                    <p className="text-[11px] text-[var(--inactive-color)] mt-1">
                      Download practice telemetry &amp; analytics report.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleExport("csv")}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-1 font-medium"
                    >
                      <FileText className="w-3 h-3 text-emerald-400" />
                      <span>CSV</span>
                    </button>
                    <button
                      onClick={() => handleExport("xlsx")}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-1 font-medium"
                    >
                      <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                      <span>Excel</span>
                    </button>
                  </div>
                </div>

                {/* 2. Backup / Restore */}
                <div className="bg-black/30 border border-white/[0.08] rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-white font-semibold">
                      <Database className="w-4 h-4 text-blue-400" />
                      <span>Backup / Restore</span>
                    </div>
                    <p className="text-[11px] text-[var(--inactive-color)] mt-1">
                      Download raw SQLite copy or upload validated replacement.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleBackupDownload}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-1 font-medium"
                    >
                      <Download className="w-3 h-3 text-blue-400" />
                      <span>Backup</span>
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isRestoring}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-1 font-medium disabled:opacity-50"
                    >
                      <Upload className="w-3 h-3 text-blue-400" />
                      <span>{isRestoring ? "..." : "Restore"}</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".db,.sqlite,.sqlite3"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* 3. Reset All Data */}
                <div className="bg-red-500/[0.04] border border-red-500/20 rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-red-300 font-semibold">
                      <RotateCcw className="w-4 h-4 text-red-400" />
                      <span>Reset All Data</span>
                    </div>
                    <p className="text-[11px] text-[var(--inactive-color)] mt-1">
                      Requires typing RESET. Automatic safety backup saved first.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsResetModalOpen(true)}
                    className="w-full py-1.5 px-3 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs text-red-300 hover:text-red-200 transition-all cursor-pointer font-medium"
                  >
                    Reset All Data
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN: Sticky Live Preview Instrument Card */}
          <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
            <div
              className="border border-white/[0.12] rounded-2xl p-6 shadow-2xl relative overflow-hidden transition-all duration-300"
              style={{ backgroundColor: themeBackground }}
            >
              {/* Header inside Preview Box */}
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-xs uppercase tracking-wider font-semibold text-white">
                    Live Practice Preview
                  </span>
                </div>
                <div className="text-[10px] text-[var(--inactive-color)] uppercase">
                  Theme: {settings.theme}
                </div>
              </div>

              {/* Contrast warning chip if ratio < 3:1 */}
              {isLowContrast && (
                <div className="mt-4 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2 animate-pulse">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Warning: Contrast ratio {contrastRatio.toFixed(1)}:1 is below the recommended 3:1 minimum against this background.
                  </span>
                </div>
              )}

              {/* Static 2-Line Sample Text (Zero animation, exact theme & font size) */}
              <div className="py-8">
                <div
                  className="font-mono-custom tracking-tight leading-[1.75] select-none space-y-1"
                  style={{ fontSize: FONT_SIZE_REM[settings.fontSize] }}
                >
                  {/* Line 1: 'the quick brown fox jumps' */}
                  <div className="whitespace-nowrap flex items-baseline">
                    {/* Typed correct characters */}
                    <span style={{ color: effectiveCorrectColor }}>the quick br</span>

                    {/* One wrong character with error underline */}
                    <span className="text-[#ef4444] border-b-2 border-[#ef4444]">o</span>

                    {/* Caret at current glyph in chosen style and color */}
                    {settings.caretStyle === "line" && (
                      <span
                        className="inline-block w-[2.5px] rounded-full mx-[1px] align-baseline self-center"
                        style={{
                          height: "1.2em",
                          backgroundColor: effectiveCaretColor,
                          boxShadow: `0 0 10px 1px ${effectiveCaretColor}`,
                        }}
                      />
                    )}
                    {settings.caretStyle === "block" && (
                      <span
                        className="inline-block px-1 rounded-xs align-baseline"
                        style={{
                          backgroundColor: effectiveCaretColor,
                          opacity: 0.5,
                          color: "#fff",
                        }}
                      >
                        w
                      </span>
                    )}
                    {settings.caretStyle === "underline" && (
                      <span
                        className="inline-block border-b-4 align-baseline"
                        style={{
                          borderColor: effectiveCaretColor,
                          boxShadow: `0 2px 8px ${effectiveCaretColor}`,
                        }}
                      >
                        w
                      </span>
                    )}

                    {/* Upcoming untyped characters dimmed */}
                    <span className="opacity-45 text-[var(--untyped-color)]">
                      {settings.caretStyle === "line" ? "wn fox jumps" : "n fox jumps"}
                    </span>
                  </div>

                  {/* Line 2: 'over the lazy dog' (upcoming characters dimmed) */}
                  <div className="whitespace-nowrap opacity-45 text-[var(--untyped-color)]">
                    over the lazy dog
                  </div>
                </div>
              </div>

              {/* Technical Telemetry Metadata at card bottom */}
              <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between text-[10px] text-[var(--inactive-color)]">
                <div>Contrast: {contrastRatio.toFixed(1)}:1</div>
                <div>Caret: {settings.caretStyle}</div>
                <div>Size: {settings.fontSize} ({FONT_SIZE_REM[settings.fontSize]})</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── RESET CONFIRMATION MODAL ────────────────────────────────────── */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#12141a] border border-red-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Confirm Total Data Reset
                </h3>
                <p className="text-xs text-zinc-400">
                  Irreversible action. An automatic safety backup will be created first.
                </p>
              </div>
            </div>

            <div className="bg-black/50 border border-white/[0.08] rounded-xl p-3 text-xs text-zinc-300 space-y-2">
              <p>This will erase all test records, mastery profiles, and personal preferences.</p>
              <p>
                To confirm, type <span className="text-red-400 font-bold">RESET</span> in the box below:
              </p>
            </div>

            <input
              type="text"
              placeholder="Type RESET to confirm"
              value={resetConfirmInput}
              onChange={(e) => setResetConfirmInput(e.target.value)}
              className="w-full bg-black/60 border border-white/[0.12] focus:border-red-400 px-3 py-2 rounded-xl text-xs font-mono-custom text-white focus:outline-none"
            />

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsResetModalOpen(false);
                  setResetConfirmInput("");
                }}
                className="flex-1 py-2 px-3 rounded-xl border border-white/[0.1] hover:bg-white/[0.05] text-xs text-zinc-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetConfirmInput !== "RESET" || isResetting}
                onClick={handleConfirmReset}
                className="flex-1 py-2 px-3 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors"
              >
                {isResetting ? "Resetting..." : "Confirm Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
