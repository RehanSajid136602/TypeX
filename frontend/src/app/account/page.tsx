"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useProfile } from "@/context/ProfileContext";
import { exportToCsv, exportToXlsx, ExportData } from "@/utils/exportUtils";
import { authenticatedFetch } from "@/utils/apiSecurity";
import {
  Trophy,
  Flame,
  Clock,
  Target,
  TrendingUp,
  Download,
  AlertTriangle,
  RotateCcw,
  Calendar,
  Layers,
  ArrowLeft,
  ChevronDown,
  Trash2,
  Edit2,
  Archive,
  BarChart2,
  Database,
  ExternalLink,
} from "lucide-react";

// Biomechanical key to finger & hand mapping
const KEY_BIOMECHANICS: Record<string, { hand: "LEFT" | "RIGHT"; finger: string }> = {
  q: { hand: "LEFT", finger: "L Pinky" },
  a: { hand: "LEFT", finger: "L Pinky" },
  z: { hand: "LEFT", finger: "L Pinky" },
  "1": { hand: "LEFT", finger: "L Pinky" },
  w: { hand: "LEFT", finger: "L Ring" },
  s: { hand: "LEFT", finger: "L Ring" },
  x: { hand: "LEFT", finger: "L Ring" },
  "2": { hand: "LEFT", finger: "L Ring" },
  e: { hand: "LEFT", finger: "L Middle" },
  d: { hand: "LEFT", finger: "L Middle" },
  c: { hand: "LEFT", finger: "L Middle" },
  "3": { hand: "LEFT", finger: "L Middle" },
  r: { hand: "LEFT", finger: "L Index" },
  f: { hand: "LEFT", finger: "L Index" },
  v: { hand: "LEFT", finger: "L Index" },
  t: { hand: "LEFT", finger: "L Index" },
  g: { hand: "LEFT", finger: "L Index" },
  b: { hand: "LEFT", finger: "L Index" },
  "4": { hand: "LEFT", finger: "L Index" },
  "5": { hand: "LEFT", finger: "L Index" },
  y: { hand: "RIGHT", finger: "R Index" },
  u: { hand: "RIGHT", finger: "R Index" },
  h: { hand: "RIGHT", finger: "R Index" },
  j: { hand: "RIGHT", finger: "R Index" },
  n: { hand: "RIGHT", finger: "R Index" },
  m: { hand: "RIGHT", finger: "R Index" },
  "6": { hand: "RIGHT", finger: "R Index" },
  "7": { hand: "RIGHT", finger: "R Index" },
  i: { hand: "RIGHT", finger: "R Middle" },
  k: { hand: "RIGHT", finger: "R Middle" },
  ",": { hand: "RIGHT", finger: "R Middle" },
  "8": { hand: "RIGHT", finger: "R Middle" },
  o: { hand: "RIGHT", finger: "R Ring" },
  l: { hand: "RIGHT", finger: "R Ring" },
  ".": { hand: "RIGHT", finger: "R Ring" },
  "9": { hand: "RIGHT", finger: "R Ring" },
  p: { hand: "RIGHT", finger: "R Pinky" },
  ";": { hand: "RIGHT", finger: "R Pinky" },
  "/": { hand: "RIGHT", finger: "R Pinky" },
  "0": { hand: "RIGHT", finger: "R Pinky" },
  "-": { hand: "RIGHT", finger: "R Pinky" },
  "=": { hand: "RIGHT", finger: "R Pinky" },
  " ": { hand: "RIGHT", finger: "Thumb" },
};

export default function AccountPage() {
  const { activeProfile, profiles, switchProfile, updateProfile, deleteProfile } = useProfile();

  // Filters
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d" | "all" | "custom">("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [modeFilter, setModeFilter] = useState<string>("all");
  const [durationFilter, setDurationFilter] = useState<string>("all");

  // Analytics data from backend
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Detail Modal
  const [selectedTest, setSelectedTest] = useState<any | null>(null);
  const [movingAvgSmoothing, setMovingAvgSmoothing] = useState<boolean>(false);
  const [movingAvgWindow, setMovingAvgWindow] = useState<5 | 10>(5);

  // Profile management dialogs
  const [isRenaming, setIsRenaming] = useState<boolean>(false);
  const [renameInput, setRenameInput] = useState<string>("");
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState<string>("");
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Danger zone
  const [isConfirmingDangerDelete, setIsConfirmingDangerDelete] = useState<boolean>(false);
  const [dangerDeleteInput, setDangerDeleteInput] = useState<string>("");

  // Hover states for tooltips
  const [hoveredPoint, setHoveredPoint] = useState<any | null>(null);
  const [hoveredKey, setHoveredKey] = useState<any | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!activeProfile) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        profileId: String(activeProfile.id),
      });

      const now = Date.now();
      if (dateRange === "7d") {
        params.append("from", String(now - 7 * 86400 * 1000));
      } else if (dateRange === "30d") {
        params.append("from", String(now - 30 * 86400 * 1000));
      } else if (dateRange === "90d") {
        params.append("from", String(now - 90 * 86400 * 1000));
      } else if (dateRange === "custom") {
        if (customFrom) params.append("from", String(new Date(customFrom).getTime()));
        if (customTo) params.append("to", String(new Date(customTo).getTime() + 86399999));
      }

      if (modeFilter !== "all") params.append("mode", modeFilter);
      if (durationFilter !== "all") params.append("duration", durationFilter);

      const res = await authenticatedFetch(`/api/accounts/analytics?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load analytics: HTTP ${res.status}`);
      }
      const data = await res.json();
      setAnalytics(data);
    } catch (err: any) {
      setError(err.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [activeProfile, dateRange, customFrom, customTo, modeFilter, durationFilter]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Handle Profile Rename
  const handleRename = async () => {
    if (!activeProfile || !renameInput.trim()) return;
    try {
      await updateProfile(activeProfile.id, renameInput.trim());
      setIsRenaming(false);
      setStatusNotice("Profile renamed successfully.");
      setTimeout(() => setStatusNotice(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Handle Profile Delete
  const handleDeleteProfile = async () => {
    if (!activeProfile) return;
    if (deleteConfirmationText.trim().toLowerCase() !== activeProfile.name.toLowerCase()) {
      alert("Name does not match confirmation.");
      return;
    }
    try {
      await deleteProfile(activeProfile.id);
      setIsConfirmingDelete(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Danger zone: Backup database
  const handleBackupNow = async () => {
    try {
      const res = await authenticatedFetch("/api/accounts/backup", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusNotice(`Backup created: ${data.backupPath}`);
      } else {
        alert(data.error || "Backup failed");
      }
    } catch (err: any) {
      alert("Backup error: " + err.message);
    }
  };

  // Danger zone: Delete all data
  const handleDeleteAllData = async () => {
    if (dangerDeleteInput !== "DELETE ALL DATA") {
      alert("Please type 'DELETE ALL DATA' exactly to confirm.");
      return;
    }
    try {
      const res = await authenticatedFetch("/api/accounts/danger/delete-all", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        window.location.href = "/";
      } else {
        alert(data.error || "Delete failed");
      }
    } catch (err: any) {
      alert("Failed: " + err.message);
    }
  };

  // Prepare Export Data
  const getExportData = (): ExportData | null => {
    if (!analytics || !activeProfile) return null;

    const tests = (analytics.recentTests || []).map((t: any) => {
      const d = new Date(t.startedAt);
      return {
        id: t.id,
        startedAtIso: d.toISOString(),
        localTime: d.toLocaleString(),
        mode: t.mode,
        config: t.config,
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
      };
    });

    const mistypedKeys = (analytics.keyStats || []).map((k: any) => ({
      key: k.key,
      attempts: k.attempts,
      errors: k.errors,
      errorRatePct: Number(((k.errors / Math.max(1, k.attempts)) * 100).toFixed(2)),
      avgFlightMs: k.flightN > 0 ? Math.round(k.flightSum / k.flightN) : 0,
    }));

    const letterConfusions = (analytics.confusions || []).map((c: any) => ({
      expected: c.expected,
      typed: c.typed,
      count: c.count,
    }));

    const mistypedWords = (analytics.wordErrors || []).map((w: any) => ({
      word: w.word,
      count: w.count,
    }));

    const dailyActivity = (analytics.dailyActivity || []).map((d: any) => ({
      date: d.day,
      testCount: d.count,
      avgWpm: Number(d.avgWpm.toFixed(1)),
      avgAccuracy: Number(d.avgAccuracy.toFixed(1)),
    }));

    return {
      profile: {
        name: activeProfile.name,
        createdAt: new Date(activeProfile.createdAt).toISOString(),
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
      mistypedKeys,
      letterConfusions,
      mistypedWords,
      dailyActivity,
    };
  };

  const handleExportCsv = () => {
    const data = getExportData();
    if (data && activeProfile) {
      exportToCsv(data, activeProfile.name);
    }
  };

  const handleExportXlsx = () => {
    const data = getExportData();
    if (data && activeProfile) {
      exportToXlsx(data, activeProfile.name);
    }
  };

  // Biomechanical Hand and Finger Error Rates
  const biomechanicsStats = useMemo(() => {
    if (!analytics?.keyStats) return { leftHand: 0, rightHand: 0, fingers: {} };
    let leftErrors = 0,
      leftAttempts = 0;
    let rightErrors = 0,
      rightAttempts = 0;
    const fingerStats: Record<string, { errors: number; attempts: number }> = {};

    analytics.keyStats.forEach((k: any) => {
      const bio = KEY_BIOMECHANICS[k.key.toLowerCase()];
      if (bio) {
        if (bio.hand === "LEFT") {
          leftErrors += k.errors;
          leftAttempts += k.attempts;
        } else if (bio.hand === "RIGHT") {
          rightErrors += k.errors;
          rightAttempts += k.attempts;
        }
        if (!fingerStats[bio.finger]) {
          fingerStats[bio.finger] = { errors: 0, attempts: 0 };
        }
        fingerStats[bio.finger].errors += k.errors;
        fingerStats[bio.finger].attempts += k.attempts;
      }
    });

    const leftRate = leftAttempts > 0 ? (leftErrors / leftAttempts) * 100 : 0;
    const rightRate = rightAttempts > 0 ? (rightErrors / rightAttempts) * 100 : 0;

    const fingerRates: Record<string, number> = {};
    Object.keys(fingerStats).forEach((f) => {
      fingerRates[f] =
        fingerStats[f].attempts > 0 ? (fingerStats[f].errors / fingerStats[f].attempts) * 100 : 0;
    });

    return {
      leftHand: Number(leftRate.toFixed(1)),
      rightHand: Number(rightRate.toFixed(1)),
      fingers: fingerRates,
    };
  }, [analytics]);

  // Calculate moving average points for tests
  const timelinePoints = useMemo(() => {
    if (!analytics?.recentTests || analytics.recentTests.length === 0) return [];
    // Sort chronologically ascending
    const sorted = [...analytics.recentTests].sort((a: any, b: any) => a.startedAt - b.startedAt);

    return sorted.map((t: any, idx: number) => {
      let maWpm = null;
      if (movingAvgSmoothing) {
        const start = Math.max(0, idx - movingAvgWindow + 1);
        const windowSlice = sorted.slice(start, idx + 1);
        const sum = windowSlice.reduce((acc: number, curr: any) => acc + curr.netWpm, 0);
        maWpm = sum / windowSlice.length;
      }
      return {
        id: t.id,
        startedAt: t.startedAt,
        netWpm: t.netWpm,
        rawWpm: t.rawWpm,
        accuracy: t.accuracy,
        maWpm,
        mode: t.mode,
      };
    });
  }, [analytics, movingAvgSmoothing, movingAvgWindow]);

  if (!activeProfile) {
    return (
      <div className="min-h-screen bg-[var(--bg-color)] text-[var(--typed-color)] flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-[var(--surface-color)] border border-[var(--surface-border)] rounded-2xl p-8 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center">
            <Trophy className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold font-mono-custom tracking-tight">Guest Mode Active</h1>
          <p className="text-[var(--untyped-color)] text-sm">
            Guest mode does not track persistent typing history. Create or select a local profile to
            view detailed analytics, milestones, and error heatmaps.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20"
          >
            <ArrowLeft className="w-4 h-4" /> Return to Arena
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-[var(--typed-color)] flex flex-col selection:bg-amber-500/30 selection:text-amber-300">
      {/* Top Navigation */}
      <header className="border-b border-[var(--surface-border)] bg-[var(--surface-color)]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-xs font-mono-custom text-[var(--untyped-color)] hover:text-amber-400 transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Arena
            </Link>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="text-lg font-black tracking-wider uppercase font-mono-custom text-amber-400">
                TypeX
              </span>
              <span className="text-xs uppercase tracking-widest text-[var(--untyped-color)] font-mono-custom">
                Analytics
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Profile Pill & Switcher */}
            <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-3 py-1.5 rounded-xl">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: activeProfile.color || "#f59e0b" }}
              />
              <span className="text-sm font-semibold font-mono-custom text-white">
                {activeProfile.name}
              </span>
              <button
                onClick={() => {
                  setRenameInput(activeProfile.name);
                  setIsRenaming(true);
                }}
                title="Rename profile"
                className="text-[var(--untyped-color)] hover:text-white transition-colors ml-1"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            </div>

            {/* Export buttons */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleExportCsv}
                disabled={!analytics || analytics.overview?.totalTests === 0}
                className="flex items-center gap-1.5 text-xs font-mono-custom font-semibold bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg text-white transition-all shadow-sm"
              >
                <Download className="w-3 h-3 text-amber-400" /> CSV
              </button>
              <button
                onClick={handleExportXlsx}
                disabled={!analytics || analytics.overview?.totalTests === 0}
                className="flex items-center gap-1.5 text-xs font-mono-custom font-semibold bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 disabled:hover:bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-lg text-amber-300 transition-all shadow-sm"
              >
                <Download className="w-3 h-3 text-amber-400" /> XLSX
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-8 flex-1 w-full space-y-8">
        {statusNotice && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm font-mono-custom flex items-center justify-between">
            <span>{statusNotice}</span>
            <button
              onClick={() => setStatusNotice(null)}
              className="text-amber-400 hover:text-white font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Global Filter Toolbar */}
        <section className="bg-[var(--surface-color)] border border-[var(--surface-border)] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs uppercase font-mono-custom text-[var(--untyped-color)] tracking-wider">
              Range:
            </span>
            <div className="flex items-center bg-black/40 border border-white/5 rounded-xl p-1 gap-1">
              {(["7d", "30d", "90d", "all", "custom"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono-custom transition-all ${
                    dateRange === r
                      ? "bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20"
                      : "text-[var(--untyped-color)] hover:text-white"
                  }`}
                >
                  {r === "all" ? "All Time" : r.toUpperCase()}
                </button>
              ))}
            </div>

            {dateRange === "custom" && (
              <div className="flex items-center gap-2 bg-black/30 px-3 py-1 rounded-xl border border-white/10 text-xs font-mono-custom">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-transparent text-white border-0 focus:outline-none"
                />
                <span className="text-gray-500">→</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-transparent text-white border-0 focus:outline-none"
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-mono-custom text-[var(--untyped-color)]">
                Mode:
              </span>
              <select
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value)}
                className="bg-black/40 border border-white/10 text-white rounded-xl px-3 py-1.5 text-xs font-mono-custom focus:outline-none focus:border-amber-500/50"
              >
                <option value="all">All Modes</option>
                <option value="time">Time</option>
                <option value="words">Words</option>
                <option value="learn">Learn</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-mono-custom text-[var(--untyped-color)]">
                Duration:
              </span>
              <select
                value={durationFilter}
                onChange={(e) => setDurationFilter(e.target.value)}
                className="bg-black/40 border border-white/10 text-white rounded-xl px-3 py-1.5 text-xs font-mono-custom focus:outline-none focus:border-amber-500/50"
              >
                <option value="all">All Configs</option>
                <option value="15">15s</option>
                <option value="30">30s</option>
                <option value="60">60s</option>
                <option value="120">120s</option>
              </select>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="py-24 text-center space-y-3 font-mono-custom text-[var(--untyped-color)]">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm">Aggregating telemetry rows...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl font-mono-custom">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-400" />
            <p>{error}</p>
          </div>
        ) : (
          <>
            {/* Overview Metric Cards */}
            <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
              {/* PB */}
              <div className="col-span-2 bg-[var(--surface-color)] border border-[var(--surface-border)] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-bl-full pointer-events-none group-hover:bg-amber-500/10 transition-colors" />
                <div className="flex items-center gap-2 text-xs font-mono-custom uppercase tracking-wider text-[var(--untyped-color)] mb-2">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" /> Personal Best
                </div>
                <div className="text-3xl font-black font-mono-custom tracking-tight text-white flex items-baseline gap-1">
                  {analytics.overview?.personalBestWpm
                    ? analytics.overview.personalBestWpm.toFixed(1)
                    : "--"}
                  <span className="text-xs font-normal text-[var(--untyped-color)]">WPM</span>
                </div>
                <div className="text-[11px] font-mono-custom text-[var(--untyped-color)] mt-2">
                  {analytics.overview?.personalBestStartedAt
                    ? new Date(analytics.overview.personalBestStartedAt).toLocaleDateString()
                    : "No tests recorded"}
                </div>
              </div>

              {/* Avg Last 10 */}
              <div className="col-span-2 bg-[var(--surface-color)] border border-[var(--surface-border)] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
                <div className="flex items-center gap-2 text-xs font-mono-custom uppercase tracking-wider text-[var(--untyped-color)] mb-2">
                  <TrendingUp className="w-3.5 h-3.5 text-sky-400" /> Avg Last 10
                </div>
                <div className="text-3xl font-black font-mono-custom tracking-tight text-white flex items-baseline gap-1">
                  {analytics.overview?.avgLast10NetWpm
                    ? analytics.overview.avgLast10NetWpm.toFixed(1)
                    : "--"}
                  <span className="text-xs font-normal text-[var(--untyped-color)]">WPM</span>
                </div>
                <div className="text-[11px] font-mono-custom text-[var(--untyped-color)] mt-2">
                  Rolling recent speed
                </div>
              </div>

              {/* Pooled Accuracy */}
              <div className="col-span-2 bg-[var(--surface-color)] border border-[var(--surface-border)] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
                <div className="flex items-center gap-2 text-xs font-mono-custom uppercase tracking-wider text-[var(--untyped-color)] mb-2">
                  <Target className="w-3.5 h-3.5 text-emerald-400" /> Accuracy
                </div>
                <div className="text-3xl font-black font-mono-custom tracking-tight text-emerald-400 flex items-baseline gap-1">
                  {analytics.overview?.overallAccuracy
                    ? analytics.overview.overallAccuracy.toFixed(1)
                    : "--"}
                  <span className="text-xs font-normal text-[var(--untyped-color)]">%</span>
                </div>
                <div className="text-[11px] font-mono-custom text-[var(--untyped-color)] mt-2">
                  Pooled character accuracy
                </div>
              </div>

              {/* Tests & Typing Time */}
              <div className="col-span-2 bg-[var(--surface-color)] border border-[var(--surface-border)] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
                <div className="flex items-center gap-2 text-xs font-mono-custom uppercase tracking-wider text-[var(--untyped-color)] mb-2">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" /> Activity
                </div>
                <div className="text-3xl font-black font-mono-custom tracking-tight text-white flex items-baseline gap-1">
                  {analytics.overview?.totalTests || 0}
                  <span className="text-xs font-normal text-[var(--untyped-color)]">tests</span>
                </div>
                <div className="text-[11px] font-mono-custom text-[var(--untyped-color)] mt-2">
                  {Math.round((analytics.overview?.totalDurationMs || 0) / 60000)}m typing time
                </div>
              </div>

              {/* Streaks & Trend */}
              <div className="col-span-4 bg-[var(--surface-color)] border border-[var(--surface-border)] rounded-2xl p-5 shadow-lg flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center">
                    <Flame className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-xs font-mono-custom uppercase tracking-wider text-[var(--untyped-color)]">
                      Current Streak
                    </div>
                    <div className="text-2xl font-black font-mono-custom text-white">
                      {analytics.streak?.currentStreak || 0}{" "}
                      <span className="text-xs font-normal text-[var(--untyped-color)]">
                        days (Best: {analytics.streak?.longestStreak || 0})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-l border-white/10 pl-6">
                  <div className="text-xs font-mono-custom uppercase tracking-wider text-[var(--untyped-color)]">
                    Weekly Trend
                  </div>
                  <div className="text-lg font-black font-mono-custom">
                    {analytics.trend?.sampleSize >= 5 ? (
                      <span
                        className={
                          analytics.trend.wpmChangePerWeek >= 0 ? "text-emerald-400" : "text-rose-400"
                        }
                      >
                        {analytics.trend.wpmChangePerWeek >= 0 ? "+" : ""}
                        {analytics.trend.wpmChangePerWeek.toFixed(1)} WPM/wk
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--untyped-color)] font-normal">
                        Needs 5+ tests
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Biomechanics Hand Balance */}
              <div className="col-span-4 bg-[var(--surface-color)] border border-[var(--surface-border)] rounded-2xl p-5 shadow-lg flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-xs font-mono-custom uppercase tracking-wider text-[var(--untyped-color)]">
                    Hand Error Rates
                  </div>
                  <div className="text-sm font-mono-custom text-white">
                    Left:{" "}
                    <span className="text-amber-400 font-bold">{biomechanicsStats.leftHand}%</span>{" "}
                    | Right:{" "}
                    <span className="text-sky-400 font-bold">{biomechanicsStats.rightHand}%</span>
                  </div>
                  <div className="text-[11px] font-mono-custom text-[var(--untyped-color)]">
                    Biomechanical workload distribution
                  </div>
                </div>
                <div className="w-32 h-3 bg-black/40 rounded-full overflow-hidden flex border border-white/10">
                  <div
                    className="bg-amber-400 h-full"
                    style={{
                      width: `${Math.max(
                        5,
                        Math.min(
                          95,
                          (biomechanicsStats.leftHand /
                            Math.max(0.1, biomechanicsStats.leftHand + biomechanicsStats.rightHand)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                  <div
                    className="bg-sky-400 h-full"
                    style={{
                      width: `${Math.max(
                        5,
                        Math.min(
                          95,
                          (biomechanicsStats.rightHand /
                            Math.max(0.1, biomechanicsStats.leftHand + biomechanicsStats.rightHand)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </section>

            {/* Main Charts Section */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Chart 1: Net WPM Over Time */}
              <div className="bg-[var(--surface-color)] border border-[var(--surface-border)] rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold font-mono-custom uppercase tracking-wider text-white">
                      Net WPM Over Time
                    </h2>
                    <p className="text-xs font-mono-custom text-[var(--untyped-color)]">
                      Chronological test performance
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs font-mono-custom text-[var(--untyped-color)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={movingAvgSmoothing}
                        onChange={(e) => setMovingAvgSmoothing(e.target.checked)}
                        className="rounded bg-black/50 border-white/20 text-amber-500 focus:ring-0"
                      />
                      <span>Moving Avg</span>
                    </label>
                    {movingAvgSmoothing && (
                      <select
                        value={movingAvgWindow}
                        onChange={(e) => setMovingAvgWindow(Number(e.target.value) as 5 | 10)}
                        className="bg-black/50 border border-white/10 text-white rounded px-2 py-0.5 text-xs font-mono-custom"
                      >
                        <option value={5}>5 tests</option>
                        <option value={10}>10 tests</option>
                      </select>
                    )}
                  </div>
                </div>

                {timelinePoints.length < 2 ? (
                  <div className="h-64 flex items-center justify-center text-xs font-mono-custom text-[var(--untyped-color)] border border-dashed border-white/10 rounded-xl">
                    Need at least 2 recorded tests to render timeline
                  </div>
                ) : (
                  <div className="relative">
                    <svg
                      viewBox="0 0 600 240"
                      className="w-full h-64 overflow-visible"
                      style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))" }}
                    >
                      {/* Grid lines */}
                      {[0, 40, 80, 120, 160, 200].map((val) => {
                        const y = 220 - (val / 200) * 190;
                        return (
                          <g key={val}>
                            <line
                              x1="40"
                              y1={y}
                              x2="590"
                              y2={y}
                              stroke="rgba(255,255,255,0.06)"
                              strokeDasharray="4 4"
                            />
                            <text
                              x="32"
                              y={y + 4}
                              fill="var(--untyped-color)"
                              fontSize="10"
                              textAnchor="end"
                              fontFamily="var(--font-mono)"
                            >
                              {val}
                            </text>
                          </g>
                        );
                      })}

                      {/* Area & Line */}
                      {(() => {
                        const maxW = 200;
                        const pts = timelinePoints.map((p, i) => {
                          const x = 40 + (i / (timelinePoints.length - 1)) * 550;
                          const y = 220 - (Math.min(maxW, p.netWpm) / maxW) * 190;
                          return { x, y, ...p };
                        });

                        const pathStr = pts.reduce(
                          (acc, p, idx) => (idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
                          ""
                        );
                        const areaStr = `${pathStr} L ${pts[pts.length - 1].x} 220 L ${pts[0].x} 220 Z`;

                        return (
                          <>
                            <defs>
                              <linearGradient id="wpmGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>
                            <path d={areaStr} fill="url(#wpmGrad)" />
                            <path
                              d={pathStr}
                              fill="none"
                              stroke="#f59e0b"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />

                            {/* Moving average line */}
                            {movingAvgSmoothing && (
                              <path
                                d={pts.reduce((acc, p, idx) => {
                                  if (p.maWpm === null) return acc;
                                  const my = 220 - (Math.min(maxW, p.maWpm) / maxW) * 190;
                                  return acc === "" ? `M ${p.x} ${my}` : `${acc} L ${p.x} ${my}`;
                                }, "")}
                                fill="none"
                                stroke="#38bdf8"
                                strokeWidth="2"
                                strokeDasharray="3 3"
                              />
                            )}

                            {/* Data points */}
                            {pts.map((p, idx) => (
                              <circle
                                key={idx}
                                cx={p.x}
                                cy={p.y}
                                r={hoveredPoint?.id === p.id ? 6 : 3.5}
                                fill={hoveredPoint?.id === p.id ? "#ffffff" : "#f59e0b"}
                                stroke="#12141a"
                                strokeWidth="2"
                                className="cursor-pointer transition-all"
                                onMouseEnter={() => setHoveredPoint(p)}
                                onMouseLeave={() => setHoveredPoint(null)}
                              />
                            ))}
                          </>
                        );
                      })()}
                    </svg>

                    {/* Tooltip */}
                    {hoveredPoint && (
                      <div className="absolute top-2 right-4 bg-black/90 border border-amber-500/40 p-2.5 rounded-xl shadow-2xl text-xs font-mono-custom space-y-1 backdrop-blur-md pointer-events-none z-20">
                        <div className="text-amber-400 font-bold">
                          {hoveredPoint.netWpm.toFixed(1)} Net WPM
                        </div>
                        <div className="text-[var(--untyped-color)]">
                          Acc: {hoveredPoint.accuracy.toFixed(1)}% | Mode: {hoveredPoint.mode}
                        </div>
                        <div className="text-gray-500 text-[10px]">
                          {new Date(hoveredPoint.startedAt).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Chart 2: Accuracy Over Time */}
              <div className="bg-[var(--surface-color)] border border-[var(--surface-border)] rounded-2xl p-6 shadow-xl space-y-4">
                <div>
                  <h2 className="text-sm font-bold font-mono-custom uppercase tracking-wider text-white">
                    Accuracy Over Time
                  </h2>
                  <p className="text-xs font-mono-custom text-[var(--untyped-color)]">
                    Target baseline precision (%)
                  </p>
                </div>

                {timelinePoints.length < 2 ? (
                  <div className="h-64 flex items-center justify-center text-xs font-mono-custom text-[var(--untyped-color)] border border-dashed border-white/10 rounded-xl">
                    Need at least 2 recorded tests to render timeline
                  </div>
                ) : (
                  <svg
                    viewBox="0 0 600 240"
                    className="w-full h-64 overflow-visible"
                    style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))" }}
                  >
                    {[0, 25, 50, 75, 100].map((val) => {
                      const y = 220 - (val / 100) * 190;
                      return (
                        <g key={val}>
                          <line
                            x1="40"
                            y1={y}
                            x2="590"
                            y2={y}
                            stroke="rgba(255,255,255,0.06)"
                            strokeDasharray="4 4"
                          />
                          <text
                            x="32"
                            y={y + 4}
                            fill="var(--untyped-color)"
                            fontSize="10"
                            textAnchor="end"
                            fontFamily="var(--font-mono)"
                          >
                            {val}%
                          </text>
                        </g>
                      );
                    })}

                    {(() => {
                      const pts = timelinePoints.map((p, i) => {
                        const x = 40 + (i / (timelinePoints.length - 1)) * 550;
                        const y = 220 - (Math.min(100, Math.max(0, p.accuracy)) / 100) * 190;
                        return { x, y, ...p };
                      });

                      const pathStr = pts.reduce(
                        (acc, p, idx) => (idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
                        ""
                      );

                      return (
                        <>
                          <path
                            d={pathStr}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {pts.map((p, idx) => (
                            <circle
                              key={idx}
                              cx={p.x}
                              cy={p.y}
                              r="3.5"
                              fill="#10b981"
                              stroke="#12141a"
                              strokeWidth="2"
                            />
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                )}
              </div>

              {/* Chart 3: WPM Distribution Histogram */}
              <div className="bg-[var(--surface-color)] border border-[var(--surface-border)] rounded-2xl p-6 shadow-xl space-y-4">
                <div>
                  <h2 className="text-sm font-bold font-mono-custom uppercase tracking-wider text-white">
                    Speed Distribution Histogram
                  </h2>
                  <p className="text-xs font-mono-custom text-[var(--untyped-color)]">
                    Bucket frequency across tests
                  </p>
                </div>

                {!analytics.histogram || analytics.histogram.length === 0 ? (
                  <div className="h-56 flex items-center justify-center text-xs font-mono-custom text-[var(--untyped-color)] border border-dashed border-white/10 rounded-xl">
                    No histogram buckets available
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(() => {
                      const maxCount = Math.max(
                        ...analytics.histogram.map((h: any) => h.count),
                        1
                      );
                      return analytics.histogram.map((h: any) => (
                        <div key={h.bucket} className="flex items-center gap-3 text-xs font-mono-custom">
                          <span className="w-16 text-right text-[var(--untyped-color)]">
                            {h.bucket}
                          </span>
                          <div className="flex-1 h-5 bg-black/40 rounded-lg overflow-hidden border border-white/5 relative">
                            <div
                              className="h-full bg-gradient-to-r from-amber-500/60 to-amber-500 rounded-lg transition-all duration-500"
                              style={{ width: `${(h.count / maxCount) * 100}%` }}
                            />
                            <span className="absolute right-2 top-0.5 text-[10px] text-white font-bold">
                              {h.count}
                            </span>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>

              {/* Chart 4: Daily Activity Calendar Heatmap */}
              <div className="bg-[var(--surface-color)] border border-[var(--surface-border)] rounded-2xl p-6 shadow-xl space-y-4">
                <div>
                  <h2 className="text-sm font-bold font-mono-custom uppercase tracking-wider text-white">
                    Activity Heatmap (Local Days)
                  </h2>
                  <p className="text-xs font-mono-custom text-[var(--untyped-color)]">
                    Consistent training intensity over the last 90 days
                  </p>
                </div>

                {(() => {
                  const dayMap = new Map<string, number>();
                  (analytics.dailyActivity || []).forEach((d: any) => dayMap.set(d.day, d.count));

                  // Generate last 12 weeks of days (84 days)
                  const tiles: { dateStr: string; count: number }[] = [];
                  const today = new Date();
                  for (let i = 83; i >= 0; i--) {
                    const d = new Date(today);
                    d.setDate(today.getDate() - i);
                    const iso = d.toISOString().split("T")[0];
                    tiles.push({ dateStr: iso, count: dayMap.get(iso) || 0 });
                  }

                  return (
                    <div className="flex flex-wrap gap-1.5 p-2 bg-black/40 rounded-xl border border-white/5">
                      {tiles.map((t) => {
                        let colorClass = "bg-white/5";
                        if (t.count >= 10) colorClass = "bg-amber-400";
                        else if (t.count >= 6) colorClass = "bg-amber-500/80";
                        else if (t.count >= 3) colorClass = "bg-amber-500/50";
                        else if (t.count >= 1) colorClass = "bg-amber-500/25";

                        return (
                          <div
                            key={t.dateStr}
                            title={`${t.dateStr}: ${t.count} tests`}
                            className={`w-3.5 h-3.5 rounded-sm ${colorClass} transition-colors hover:scale-125 cursor-pointer`}
                          />
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </section>

            {/* Error Diagnostics Section */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Keyboard Error Heatmap HUD */}
              <div className="lg:col-span-2 bg-[var(--surface-color)] border border-[var(--surface-border)] rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold font-mono-custom uppercase tracking-wider text-white">
                      Keyboard Error Heatmap HUD
                    </h2>
                    <p className="text-xs font-mono-custom text-[var(--untyped-color)]">
                      Per-key error rate (%) across filtered tests
                    </p>
                  </div>
                  {hoveredKey && (
                    <div className="text-xs font-mono-custom bg-black/60 px-3 py-1 rounded-lg border border-amber-500/30 text-amber-300">
                      Key &apos;{hoveredKey.key}&apos;: {hoveredKey.errors} errors / {hoveredKey.attempts} attempts (
                      {hoveredKey.rate}%)
                    </div>
                  )}
                </div>

                {(() => {
                  const keyStatsMap = new Map<string, any>();
                  (analytics.keyStats || []).forEach((k: any) =>
                    keyStatsMap.set(k.key.toLowerCase(), k)
                  );

                  const keyboardRows = [
                    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
                    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
                    ["z", "x", "c", "v", "b", "n", "m"],
                  ];

                  return (
                    <div className="space-y-2 p-4 bg-black/40 rounded-xl border border-white/5 flex flex-col items-center">
                      {keyboardRows.map((row, rIdx) => (
                        <div key={rIdx} className="flex gap-2 justify-center">
                          {row.map((k) => {
                            const stat = keyStatsMap.get(k);
                            const attempts = stat?.attempts || 0;
                            const errors = stat?.errors || 0;
                            const rate =
                              attempts >= 10 ? Number(((errors / attempts) * 100).toFixed(1)) : 0;

                            let bg = "bg-white/5 text-[var(--untyped-color)]";
                            if (attempts >= 10) {
                              if (rate > 15) bg = "bg-red-500/40 text-red-200 border-red-500/60";
                              else if (rate > 8)
                                bg = "bg-orange-500/30 text-orange-200 border-orange-500/40";
                              else if (rate > 3)
                                bg = "bg-yellow-500/20 text-yellow-200 border-yellow-500/30";
                              else bg = "bg-emerald-500/20 text-emerald-200 border-emerald-500/30";
                            }

                            return (
                              <button
                                key={k}
                                onMouseEnter={() =>
                                  setHoveredKey({ key: k, attempts, errors, rate })
                                }
                                onMouseLeave={() => setHoveredKey(null)}
                                className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center border border-white/5 font-mono-custom font-bold transition-all hover:scale-110 ${bg}`}
                              >
                                <span className="text-sm uppercase">{k}</span>
                                <span className="text-[9px] opacity-70">
                                  {attempts >= 10 ? `${rate}%` : "-"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Letter Confusions & Ranked Mistakes */}
              <div className="bg-[var(--surface-color)] border border-[var(--surface-border)] rounded-2xl p-6 shadow-xl space-y-4">
                <div>
                  <h2 className="text-sm font-bold font-mono-custom uppercase tracking-wider text-white">
                    Top Letter Confusions
                  </h2>
                  <p className="text-xs font-mono-custom text-[var(--untyped-color)]">
                    Expected → Actually Typed
                  </p>
                </div>

                {!analytics.confusions || analytics.confusions.length === 0 ? (
                  <div className="py-12 text-center text-xs font-mono-custom text-[var(--untyped-color)] border border-dashed border-white/10 rounded-xl">
                    No letter confusions recorded
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {analytics.confusions.slice(0, 8).map((c: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 bg-black/40 rounded-xl border border-white/5 font-mono-custom text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded bg-amber-500/20 text-amber-300 font-bold flex items-center justify-center">
                            {c.expected}
                          </span>
                          <span className="text-[var(--untyped-color)]">→</span>
                          <span className="w-6 h-6 rounded bg-red-500/20 text-red-300 font-bold flex items-center justify-center">
                            {c.typed}
                          </span>
                        </div>
                        <span className="text-white font-bold">{c.count} times</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Most Mistyped Words */}
            <section className="bg-[var(--surface-color)] border border-[var(--surface-border)] rounded-2xl p-6 shadow-xl space-y-4">
              <div>
                <h2 className="text-sm font-bold font-mono-custom uppercase tracking-wider text-white">
                  Most-Mistyped Words
                </h2>
                <p className="text-xs font-mono-custom text-[var(--untyped-color)]">
                  Words that caused the highest error friction
                </p>
              </div>

              {!analytics.wordErrors || analytics.wordErrors.length === 0 ? (
                <div className="py-8 text-center text-xs font-mono-custom text-[var(--untyped-color)] border border-dashed border-white/10 rounded-xl">
                  No word errors recorded
                </div>
              ) : (
                <div className="flex flex-wrap gap-2.5">
                  {analytics.wordErrors.slice(0, 15).map((w: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-black/40 border border-white/10 px-3 py-1.5 rounded-xl font-mono-custom text-xs"
                    >
                      <span className="text-red-300 font-bold">{w.word}</span>
                      <span className="text-[10px] text-[var(--untyped-color)] bg-white/5 px-1.5 py-0.5 rounded">
                        {w.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Recent Tests Table */}
            <section className="bg-[var(--surface-color)] border border-[var(--surface-border)] rounded-2xl p-6 shadow-xl space-y-4">
              <div>
                <h2 className="text-sm font-bold font-mono-custom uppercase tracking-wider text-white">
                  Recent Tests History
                </h2>
                <p className="text-xs font-mono-custom text-[var(--untyped-color)]">
                  Click any row to inspect per-second curve and error breakdown
                </p>
              </div>

              {!analytics.recentTests || analytics.recentTests.length === 0 ? (
                <div className="py-12 text-center text-xs font-mono-custom text-[var(--untyped-color)] border border-dashed border-white/10 rounded-xl">
                  No recent tests match the filter criteria
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono-custom text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-[var(--untyped-color)] uppercase">
                        <th className="pb-3 pl-2">Date / Time</th>
                        <th className="pb-3">Mode</th>
                        <th className="pb-3">Net WPM</th>
                        <th className="pb-3">Raw WPM</th>
                        <th className="pb-3">Accuracy</th>
                        <th className="pb-3">Consistency</th>
                        <th className="pb-3">Duration</th>
                        <th className="pb-3 pr-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {analytics.recentTests.map((t: any) => (
                        <tr
                          key={t.id}
                          onClick={() => setSelectedTest(t)}
                          className="hover:bg-white/5 cursor-pointer transition-colors group"
                        >
                          <td className="py-3 pl-2 text-white">
                            {new Date(t.startedAt).toLocaleString()}
                          </td>
                          <td className="py-3 uppercase text-amber-400 font-semibold">{t.mode}</td>
                          <td className="py-3 font-bold text-white text-sm">{t.netWpm.toFixed(1)}</td>
                          <td className="py-3 text-[var(--untyped-color)]">{t.rawWpm.toFixed(1)}</td>
                          <td className="py-3 text-emerald-400 font-semibold">
                            {t.accuracy.toFixed(1)}%
                          </td>
                          <td className="py-3 text-[var(--untyped-color)]">
                            {t.consistency ? `${t.consistency.toFixed(1)}%` : "-"}
                          </td>
                          <td className="py-3 text-[var(--untyped-color)]">
                            {Math.round(t.durationMs / 1000)}s
                          </td>
                          <td className="py-3 pr-2 text-right">
                            <span className="text-amber-400 group-hover:underline">Inspect →</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Danger Zone */}
            <section className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 shadow-xl space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold font-mono-custom uppercase tracking-wider text-red-300">
                    Database &amp; Profile Danger Zone
                  </h2>
                  <p className="text-xs font-mono-custom text-[var(--untyped-color)]">
                    Local maintenance, backups, and irreversible reset options
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-2">
                <button
                  onClick={handleBackupNow}
                  className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2.5 rounded-xl text-xs font-mono-custom text-white transition-all shadow-sm"
                >
                  <Database className="w-4 h-4 text-amber-400" /> Backup Database Now
                </button>

                <button
                  onClick={() => setIsConfirmingDelete(true)}
                  className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 px-4 py-2.5 rounded-xl text-xs font-mono-custom text-red-300 transition-all shadow-sm"
                >
                  <Trash2 className="w-4 h-4 text-red-400" /> Delete Profile &apos;
                  {activeProfile.name}&apos;
                </button>

                <button
                  onClick={() => setIsConfirmingDangerDelete(true)}
                  className="flex items-center gap-2 bg-red-900/30 hover:bg-red-900/50 border border-red-700/50 px-4 py-2.5 rounded-xl text-xs font-mono-custom text-red-200 transition-all shadow-sm ml-auto"
                >
                  <AlertTriangle className="w-4 h-4 text-red-400" /> Delete All TypeX Data
                </button>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Selected Test Detail Modal */}
      {selectedTest && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 z-50">
          <div className="max-w-2xl w-full bg-[var(--surface-color)] border border-[var(--surface-border)] rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-bold font-mono-custom text-white">Test Breakdown</h3>
                <p className="text-xs font-mono-custom text-[var(--untyped-color)]">
                  {new Date(selectedTest.startedAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedTest(null)}
                className="text-[var(--untyped-color)] hover:text-white font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-4 gap-4 text-center font-mono-custom">
              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <div className="text-[10px] text-[var(--untyped-color)] uppercase">Net WPM</div>
                <div className="text-xl font-bold text-amber-400">
                  {selectedTest.netWpm.toFixed(1)}
                </div>
              </div>
              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <div className="text-[10px] text-[var(--untyped-color)] uppercase">Accuracy</div>
                <div className="text-xl font-bold text-emerald-400">
                  {selectedTest.accuracy.toFixed(1)}%
                </div>
              </div>
              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <div className="text-[10px] text-[var(--untyped-color)] uppercase">Keystrokes</div>
                <div className="text-xl font-bold text-white">{selectedTest.totalKeystrokes}</div>
              </div>
              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <div className="text-[10px] text-[var(--untyped-color)] uppercase">Errors</div>
                <div className="text-xl font-bold text-rose-400">
                  {selectedTest.uncorrectedErrors + selectedTest.correctedErrors}
                </div>
              </div>
            </div>

            {/* Per-second Curve Chart */}
            <div className="space-y-2">
              <div className="text-xs font-mono-custom uppercase tracking-wider text-[var(--untyped-color)]">
                Per-Second WPM Curve
              </div>
              {selectedTest.perSecondWpm && selectedTest.perSecondWpm.length > 0 ? (
                <svg viewBox="0 0 500 160" className="w-full h-40 bg-black/40 rounded-xl border border-white/5 p-2">
                  {(() => {
                    const curve = selectedTest.perSecondWpm;
                    const maxV = Math.max(...curve, 40);
                    const pts = curve.map((v: number, i: number) => {
                      const x = 20 + (i / Math.max(1, curve.length - 1)) * 460;
                      const y = 140 - (v / maxV) * 120;
                      return { x, y };
                    });
                    const d = pts.reduce(
                      (acc: string, p: any, idx: number) =>
                        idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`,
                      ""
                    );
                    return (
                      <path
                        d={d}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    );
                  })()}
                </svg>
              ) : (
                <div className="h-32 flex items-center justify-center text-xs font-mono-custom text-[var(--untyped-color)] border border-dashed border-white/10 rounded-xl">
                  No per-second telemetry saved for this test
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedTest(null)}
                className="px-5 py-2 bg-white/10 hover:bg-white/20 text-white font-mono-custom text-xs rounded-xl transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Dialog */}
      {isRenaming && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 z-50">
          <div className="max-w-md w-full bg-[var(--surface-color)] border border-[var(--surface-border)] rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold font-mono-custom text-white">Rename Profile</h3>
            <input
              type="text"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono-custom text-white focus:outline-none focus:border-amber-500"
              placeholder="New profile name"
            />
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setIsRenaming(false)}
                className="px-4 py-2 text-xs font-mono-custom text-[var(--untyped-color)] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono-custom rounded-xl"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Profile Confirmation Dialog */}
      {isConfirmingDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 z-50">
          <div className="max-w-md w-full bg-[var(--surface-color)] border border-red-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-lg font-bold font-mono-custom">Delete Profile</h3>
            </div>
            <p className="text-xs text-[var(--untyped-color)] font-mono-custom">
              This will permanently delete profile &apos;{activeProfile.name}&apos; and all its
              recorded tests. Type <span className="text-white font-bold">{activeProfile.name}</span>{" "}
              below to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmationText}
              onChange={(e) => setDeleteConfirmationText(e.target.value)}
              placeholder={activeProfile.name}
              className="w-full bg-black/50 border border-red-500/30 rounded-xl px-4 py-2.5 text-sm font-mono-custom text-white focus:outline-none focus:border-red-500"
            />
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setIsConfirmingDelete(false)}
                className="px-4 py-2 text-xs font-mono-custom text-[var(--untyped-color)] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProfile}
                disabled={
                  deleteConfirmationText.trim().toLowerCase() !== activeProfile.name.toLowerCase()
                }
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold text-xs font-mono-custom rounded-xl"
              >
                Delete Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Data Confirmation Dialog */}
      {isConfirmingDangerDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 z-50">
          <div className="max-w-md w-full bg-[var(--surface-color)] border border-red-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-lg font-bold font-mono-custom">Delete All Data</h3>
            </div>
            <p className="text-xs text-[var(--untyped-color)] font-mono-custom">
              This will delete all profiles, all tests, and reset TypeX back to a clean state.
              Type <span className="text-red-400 font-bold">DELETE ALL DATA</span> below to confirm:
            </p>
            <input
              type="text"
              value={dangerDeleteInput}
              onChange={(e) => setDangerDeleteInput(e.target.value)}
              placeholder="DELETE ALL DATA"
              className="w-full bg-black/50 border border-red-500/30 rounded-xl px-4 py-2.5 text-sm font-mono-custom text-white focus:outline-none focus:border-red-500"
            />
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setIsConfirmingDangerDelete(false)}
                className="px-4 py-2 text-xs font-mono-custom text-[var(--untyped-color)] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAllData}
                disabled={dangerDeleteInput !== "DELETE ALL DATA"}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold text-xs font-mono-custom rounded-xl"
              >
                Erase Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
