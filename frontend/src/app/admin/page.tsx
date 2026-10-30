"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import {
  CompetitionState,
  ProjectorView,
  Contestant,
  DICTIONARY_TIERS,
  DictionaryTier,
} from "@/types/typing";
import {
  Lock,
  Unlock,
  Play,
  RotateCcw,
  SkipForward,
  UserX,
  Trash2,
  Download,
  Users,
  Settings,
  Tv,
  Keyboard,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowRight,
  ShieldCheck,
  Plus,
  Edit2,
  Save,
  X,
  Wifi,
  Copy,
  KeyRound,
  Globe,
  Database,
} from "lucide-react";

export default function AdminPage() {
  const [pin, setPin] = useState<string>("");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [pinError, setPinError] = useState<string>("");
  const [pinConfigured, setPinConfigured] = useState<boolean | null>(null);
  const [newSetupPin, setNewSetupPin] = useState<string>("");
  const [confirmSetupPin, setConfirmSetupPin] = useState<string>("");
  const [setupError, setSetupError] = useState<string>("");
  const [state, setState] = useState<CompetitionState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isPending, startTransition] = useTransition();

  // Network & Host mode info
  const [networkInfo, setNetworkInfo] = useState<{
    host: string;
    port: number;
    isHostMode: boolean;
    lanIps: string[];
    lanUrls: Array<{ ip: string; competeUrl: string; leaderboardUrl: string; adminUrl: string }>;
    activeDataDir?: string;
    appVersion?: string;
  } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string>("");

  // Inputs for config editing
  const [eventName, setEventName] = useState<string>("");
  const [timeLimitSeconds, setTimeLimitSeconds] = useState<number>(60);
  const [paragraphWordCount, setParagraphWordCount] = useState<number>(40);
  const [tier, setTier] = useState<DictionaryTier>("english_1k");
  const [batchSize, setBatchSize] = useState<number>(3);
  const [paragraphRule, setParagraphRule] = useState<"same_for_batch" | "random_per_contestant">("same_for_batch");
  const [revealMode, setRevealMode] = useState<"instant" | "batch">("instant");
  const [syncWindowSeconds, setSyncWindowSeconds] = useState<number>(10);
  const [revealHoldSeconds, setRevealHoldSeconds] = useState<number>(15);

  // Inputs for contestant adding & editing
  const [singleName, setSingleName] = useState<string>("");
  const [bulkNames, setBulkNames] = useState<string>("");
  const [showBulkModal, setShowBulkModal] = useState<boolean>(false);
  const [showParagraphModal, setShowParagraphModal] = useState<boolean>(false);
  const [editingContestant, setEditingContestant] = useState<Contestant | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [editRegId, setEditRegId] = useState<string>("");
  const [editDepartment, setEditDepartment] = useState<string>("");

  // Inline editing for unnamed or any result record
  const [editingResultId, setEditingResultId] = useState<string | null>(null);
  const [inlineResultName, setInlineResultName] = useState<string>("");
  const [inlineResultRegId, setInlineResultRegId] = useState<string>("");
  const [inlineResultDept, setInlineResultDept] = useState<string>("");

  // Status message
  const [actionMessage, setActionMessage] = useState<string>("");

  // Typed confirmation modal for Reset Event
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [resetConfirmText, setResetConfirmText] = useState<string>("");

  const showFeedback = (msg: string) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(""), 4000);
  };

  // Poll state every 1s
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/competition/state");
      if (res.ok) {
        const data: CompetitionState = await res.json();
        setState(data);
      }
    } catch (err) {
      console.warn("Failed to poll competition state", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 1000);
    return () => clearInterval(interval);
  }, [fetchState]);

  // Keep local config inputs synced when state updates (if not actively editing)
  useEffect(() => {
    if (state && !eventName) {
      setEventName(state.config.eventName);
      setTimeLimitSeconds(state.config.timeLimitSeconds);
      setParagraphWordCount(state.config.paragraphWordCount);
      setTier((state.config.tier as DictionaryTier) || "english_1k");
      setBatchSize(state.config.batchSize);
      setParagraphRule(state.config.paragraphRule);
      setRevealMode(state.config.revealMode || "instant");
      if (typeof state.config.syncWindowSeconds === "number") {
        setSyncWindowSeconds(state.config.syncWindowSeconds);
      }
      if (typeof state.config.revealHoldSeconds === "number") {
        setRevealHoldSeconds(state.config.revealHoldSeconds);
      }
    }
  }, [state, eventName]);

  // Check PIN configuration on mount
  const checkPinStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/pin-status");
      if (res.ok) {
        const data = await res.json();
        setPinConfigured(Boolean(data.configured));
      }
    } catch (err) {
      console.warn("Failed to check PIN status", err);
    }
  }, []);

  // Fetch Network & Host mode info
  const fetchNetworkInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/system/network");
      if (res.ok) {
        const data = await res.json();
        setNetworkInfo(data);
      }
    } catch (err) {
      console.warn("Failed to fetch network info", err);
    }
  }, []);

  // Handle first-run PIN creation
  const handleCreatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError("");
    if (newSetupPin.length < 4) {
      setSetupError("PIN must be at least 4 characters long.");
      return;
    }
    if (newSetupPin !== confirmSetupPin) {
      setSetupError("PINs do not match.");
      return;
    }

    try {
      const res = await fetch("/api/admin/setup-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPin: newSetupPin }),
      });
      const data = await res.json();
      if (res.ok && data.configured) {
        setPin(newSetupPin);
        setPinConfigured(true);
        setIsAuthenticated(true);
        sessionStorage.setItem("typex_admin_pin", newSetupPin);
        showFeedback("Master Admin PIN successfully created!");
      } else {
        setSetupError(data.error || "Failed to configure PIN.");
      }
    } catch {
      setSetupError("Could not reach backend to set PIN.");
    }
  };

  // Handle PIN verification
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError("");
    try {
      const res = await fetch("/api/competition/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.valid) {
        setIsAuthenticated(true);
        sessionStorage.setItem("typex_admin_pin", pin);
        showFeedback("Admin session authenticated");
      } else if (data.configured === false) {
        setPinConfigured(false);
        setPinError("Admin PIN is not configured. Please initialize your security PIN.");
      } else {
        setPinError("Invalid Admin PIN");
      }
    } catch {
      setPinError("Could not reach backend");
    }
  };

  // Auto restore pin from sessionStorage
  useEffect(() => {
    checkPinStatus();
    fetchNetworkInfo();

    const savedPin = sessionStorage.getItem("typex_admin_pin");
    if (savedPin) {
      fetch("/api/competition/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: savedPin }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.valid) {
            setPin(savedPin);
            setIsAuthenticated(true);
          } else if (data.configured === false) {
            setPinConfigured(false);
          }
        })
        .catch(() => {});
    }
  }, [checkPinStatus, fetchNetworkInfo]);

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(""), 2500);
  };

  const sendAction = async (endpoint: string, payload: Record<string, unknown>) => {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, ...payload }),
      });
      if (!res.ok) {
        const err = await res.json();
        showFeedback(`Error: ${err.error || "Action failed"}`);
        return;
      }
      const data: CompetitionState = await res.json();
      setState(data);
    } catch {
      showFeedback("Network error");
    }
  };

  // Actions
  const handleSaveConfig = () => {
    sendAction("/api/competition/config", {
      eventName,
      timeLimitSeconds,
      paragraphWordCount,
      tier,
      batchSize,
      paragraphRule,
      revealMode,
      syncWindowSeconds,
      revealHoldSeconds,
    });
    showFeedback("Configuration saved");
  };

  const handleSaveResultEdit = async (resultId: string) => {
    try {
      const res = await fetch("/api/competition/results/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          id: resultId,
          name: inlineResultName.trim(),
          regId: inlineResultRegId.trim(),
          department: inlineResultDept.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        showFeedback(`Error: ${err.error || "Failed to update result"}`);
        return;
      }
      const data: CompetitionState = await res.json();
      setState(data);
      setEditingResultId(null);
      showFeedback("Result record updated");
    } catch {
      showFeedback("Network error updating result");
    }
  };

  const handleGenerateParagraphs = () => {
    sendAction("/api/competition/paragraphs/generate", {
      tier,
      wordCount: paragraphWordCount,
    });
    showFeedback("5-paragraph pool regenerated with length and punctuation constraints");
  };

  const handleAddSingleContestant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleName.trim()) return;
    sendAction("/api/competition/contestants/add", { name: singleName.trim() });
    setSingleName("");
    showFeedback("Contestant added");
  };

  const handleAddBulkContestants = () => {
    const names = bulkNames
      .split("\n")
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    if (names.length === 0) return;
    sendAction("/api/competition/contestants/add", { names });
    setBulkNames("");
    setShowBulkModal(false);
    showFeedback(`Added ${names.length} contestants in batches of ${batchSize}`);
  };

  const handleRoundControl = (action: string, extra: Record<string, unknown> = {}) => {
    sendAction("/api/competition/round/control", { action, ...extra });
  };

  const handleContestantStatus = (id: string, action: string, extra: Record<string, unknown> = {}) => {
    sendAction("/api/competition/contestants/status", { id, action, ...extra });
  };

  const handleOpenEdit = (c: Contestant) => {
    setEditingContestant(c);
    setEditName(c.name);
    setEditRegId(c.regId || "");
    setEditDepartment(c.department || "General");
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContestant) return;
    handleContestantStatus(editingContestant.id, "edit", {
      name: editName.trim(),
      regId: editRegId.trim(),
      department: editDepartment.trim(),
    });
    setEditingContestant(null);
    showFeedback("Contestant details updated");
  };

  const handleGrantRedo = (id: string) => {
    handleContestantStatus(id, "grant_redo");
    showFeedback("Redo granted. Contestant can re-enter their Registration ID.");
  };

  const handleExportCsv = () => {
    const link = document.createElement("a");
    link.href = "/api/competition/export-csv";
    link.download = `typex_results_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Group contestants by batch
  const batches: { batchIndex: number; contestants: Contestant[] }[] = [];
  if (state?.contestants) {
    state.contestants.forEach((c) => {
      const bIdx = c.batchIndex;
      if (!batches[bIdx]) {
        batches[bIdx] = { batchIndex: bIdx, contestants: [] };
      }
      batches[bIdx].contestants.push(c);
    });
  }

  // Active contestant & batch
  const currentBatch = state?.currentBatchIndex ?? 0;
  const activeContestant = state?.contestants.find((c) => c.id === state.activeContestantId);

  // If not authenticated, render login barrier or first-run setup
  if (!isAuthenticated) {
    if (pinConfigured === false) {
      return (
        <main className="min-h-screen bg-[var(--bg)] text-[var(--typed)] font-mono-custom flex flex-col justify-center items-center px-4">
          <div className="w-full max-w-md p-8 rounded-2xl bg-[var(--surface-color)] border border-amber-500/30 shadow-2xl backdrop-blur-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 animate-pulse" />
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-[var(--typed)]">TypeX Security Setup</h1>
                <p className="text-xs text-amber-400 font-medium">First-Run Master PIN Initialization</p>
              </div>
            </div>

            <p className="text-xs text-[var(--inactive-color)] mb-5 leading-relaxed">
              No master PIN has been configured. To protect Competition Admin controls and Stage operations, please establish a secure PIN.
            </p>

            <form onSubmit={handleCreatePin} className="flex flex-col gap-4">
              <div>
                <label className="block text-[11px] text-[var(--inactive-color)] uppercase tracking-wider mb-2">
                  New Admin PIN
                </label>
                <input
                  type="password"
                  value={newSetupPin}
                  onChange={(e) => setNewSetupPin(e.target.value)}
                  placeholder="Min. 4 characters"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-center text-lg tracking-[0.25em] font-mono-custom text-amber-400 focus:outline-none focus:border-amber-500/60 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[var(--inactive-color)] uppercase tracking-wider mb-2">
                  Confirm Admin PIN
                </label>
                <input
                  type="password"
                  value={confirmSetupPin}
                  onChange={(e) => setConfirmSetupPin(e.target.value)}
                  placeholder="Re-enter PIN"
                  className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-center text-lg tracking-[0.25em] font-mono-custom text-amber-400 focus:outline-none focus:border-amber-500/60 transition-colors"
                />
              </div>

              {setupError && (
                <p className="text-xs text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> {setupError}
                </p>
              )}

              <button
                type="submit"
                className="w-full py-3 mt-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20 active:scale-[0.98]"
              >
                <ShieldCheck className="w-4 h-4" /> Save Master PIN & Enter Admin
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-center text-xs text-[var(--inactive-color)]">
              <Link href="/" className="hover:text-[var(--typed)] transition-colors">
                ← Return to Arena
              </Link>
              <span className="opacity-50">Saved to ~/.local/share/TypeX</span>
            </div>
          </div>
        </main>
      );
    }

    return (
      <main className="min-h-screen bg-[var(--bg)] text-[var(--typed)] font-mono-custom flex flex-col justify-center items-center px-4">
        <div className="w-full max-w-md p-8 rounded-2xl bg-[var(--surface-color)] border border-[var(--surface-border)] shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-[var(--typed)]">TypeX Stage Admin</h1>
              <p className="text-xs text-[var(--inactive-color)]">Enter Admin Security PIN to manage event</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-[11px] text-[var(--inactive-color)] uppercase tracking-wider mb-2">
                Security PIN
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-center text-xl tracking-[0.3em] font-mono-custom text-amber-400 focus:outline-none focus:border-amber-500/60 transition-colors"
              />
            </div>

            {pinError && (
              <p className="text-xs text-rose-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> {pinError}
              </p>
            )}

            <button
              type="submit"
              className="w-full py-3 mt-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20 active:scale-[0.98]"
            >
              <Unlock className="w-4 h-4" /> Authenticate Admin
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-center text-xs text-[var(--inactive-color)]">
            <Link href="/" className="hover:text-[var(--typed)] transition-colors">
              ← Return to Arena
            </Link>
            <span className="opacity-50">Protected by Hashed Master PIN</span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--typed)] font-mono-custom p-6 md:p-8 flex flex-col gap-6">
      {/* Top Header Bar */}
      <header className="w-full max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-[var(--typed)] hover:opacity-80 transition-opacity"
          >
            Type<span className="text-[var(--accent-color)]">X</span>
            <span className="ml-2 text-xs font-normal text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
              STAGE ADMIN
            </span>
          </Link>
          <span className="text-xs text-[var(--inactive-color)] hidden sm:inline">
            • {state?.config.eventName || "Live Championship"}
          </span>
        </div>

        {/* Quick Screen Links */}
        <div className="flex items-center gap-3">
          <Link
            href="/compete"
            target="_blank"
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-amber-500/40 text-xs text-[var(--typed)] flex items-center gap-1.5 transition-colors"
          >
            <Keyboard className="w-3.5 h-3.5 text-amber-400" /> Contestant Screen ↗
          </Link>
          <Link
            href="/leaderboard"
            target="_blank"
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-cyan-500/40 text-xs text-[var(--typed)] flex items-center gap-1.5 transition-colors"
          >
            <Tv className="w-3.5 h-3.5 text-cyan-400" /> Projector Board ↗
          </Link>
          <button
            onClick={() => {
              sessionStorage.removeItem("typex_admin_pin");
              setIsAuthenticated(false);
            }}
            className="px-2.5 py-1.5 rounded-lg text-xs text-[var(--inactive-color)] hover:text-rose-400 transition-colors"
          >
            Lock
          </button>
        </div>
      </header>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div className="w-full max-w-7xl mx-auto px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage("")} className="opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Host Mode & Network Status Banner */}
      {networkInfo && (
        <div className="w-full max-w-7xl mx-auto p-4 rounded-2xl bg-[var(--surface-color)] border border-cyan-500/30 shadow-lg flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${networkInfo.isHostMode ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              <span className="text-xs font-semibold text-[var(--typed)] uppercase tracking-wider flex items-center gap-1.5">
                <Wifi className="w-4 h-4 text-cyan-400" />
                Network Mode: {networkInfo.isHostMode ? "Host Mode (LAN Broadcast Active 0.0.0.0)" : "Local Host Only (127.0.0.1)"}
              </span>
            </div>
            <span className="text-[11px] text-[var(--inactive-color)]">
              Engine Port: <strong className="text-amber-400">{networkInfo.port}</strong>
            </span>
          </div>

          {networkInfo.isHostMode ? (
            <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300/90 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  <strong>LAN Broadcast Notice:</strong> Anyone on your local network can reach the contestant and leaderboard screens. Your Stage Admin panel is strictly protected by your Admin Security PIN.
                </span>
              </div>

              {networkInfo.lanUrls && networkInfo.lanUrls.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-1">
                  {networkInfo.lanUrls.map((item, idx) => (
                    <div key={idx} className="flex flex-col gap-1.5 p-3 rounded-xl bg-black/40 border border-white/5">
                      <span className="text-[10px] text-[var(--inactive-color)] font-mono uppercase">Interface {item.ip}</span>
                      
                      <div className="flex items-center justify-between text-xs bg-white/5 px-2 py-1.5 rounded-lg border border-white/5">
                        <span className="truncate text-amber-300 font-mono text-[11px]">/compete</span>
                        <button
                          onClick={() => copyToClipboard(item.competeUrl)}
                          className="px-2 py-0.5 rounded text-[10px] bg-white/10 hover:bg-amber-500 hover:text-black transition-colors flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" /> {copiedUrl === item.competeUrl ? "Copied!" : "Copy"}
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-xs bg-white/5 px-2 py-1.5 rounded-lg border border-white/5">
                        <span className="truncate text-cyan-300 font-mono text-[11px]">/leaderboard</span>
                        <button
                          onClick={() => copyToClipboard(item.leaderboardUrl)}
                          className="px-2 py-0.5 rounded text-[10px] bg-white/10 hover:bg-cyan-500 hover:text-black transition-colors flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" /> {copiedUrl === item.leaderboardUrl ? "Copied!" : "Copy"}
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-xs bg-white/5 px-2 py-1.5 rounded-lg border border-white/5">
                        <span className="truncate text-purple-300 font-mono text-[11px]">/admin</span>
                        <button
                          onClick={() => copyToClipboard(item.adminUrl)}
                          className="px-2 py-0.5 rounded text-[10px] bg-white/10 hover:bg-purple-500 hover:text-black transition-colors flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" /> {copiedUrl === item.adminUrl ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-[var(--inactive-color)] flex items-center justify-between pt-1">
              <span>App is isolated to local machine. To allow stage contestants over Wi-Fi/LAN, start with <code className="text-amber-400 bg-white/5 px-1 py-0.5 rounded">--host 0.0.0.0</code> or set <code className="text-amber-400 bg-white/5 px-1 py-0.5 rounded">TYPEX_BIND_HOST=0.0.0.0</code>.</span>
            </div>
          )}
        </div>
      )}

      {/* Main Grid: Left Control Cockpit, Right Contestant & Batch Manager */}
      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 cols): Round Control & Live Telemetry & Projector View */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          {/* Active Round Control Cockpit */}
          <div className="p-5 rounded-2xl bg-[var(--surface-color)] border border-[var(--surface-border)] shadow-xl flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-[var(--inactive-color)] font-semibold flex items-center gap-2">
                <Play className="w-3.5 h-3.5 text-amber-400" /> Live Stage Cockpit
              </span>
              <span
                className={`text-[11px] uppercase px-2 py-0.5 rounded font-bold ${
                  state?.roundState === "typing"
                    ? "bg-emerald-500/20 text-emerald-400 animate-pulse border border-emerald-500/30"
                    : state?.roundState === "countdown"
                    ? "bg-amber-500/20 text-amber-400 animate-bounce border border-amber-500/30"
                    : state?.roundState === "ready"
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : "bg-white/5 text-[var(--inactive-color)]"
                }`}
              >
                State: {state?.roundState || "idle"}
              </span>
            </div>

            {/* Currently Active Contestant Info */}
            <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex flex-col gap-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--inactive-color)]">Selected Contestant:</span>
                <span className="text-amber-400 font-semibold">
                  Batch #{currentBatch + 1}
                </span>
              </div>
              <div className="text-lg font-bold text-[var(--typed)]">
                {activeContestant ? activeContestant.name : "None Selected"}
              </div>
              {activeContestant?.assignedParagraphText && (
                <div className="text-[11px] text-[var(--inactive-color)] line-clamp-2 italic">
                  &ldquo;{activeContestant.assignedParagraphText}&rdquo;
                </div>
              )}
            </div>

            {/* Live Typing Stream (if typing) */}
            {state?.roundState === "typing" && (
              <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-emerald-400 uppercase">Live WPM</div>
                  <div className="text-2xl font-bold text-emerald-300">
                    {state.liveStream.currentWpm}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-emerald-400 uppercase">Accuracy</div>
                  <div className="text-2xl font-bold text-emerald-300">
                    {state.liveStream.currentAccuracy}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-emerald-400 uppercase">Progress</div>
                  <div className="text-sm font-semibold text-emerald-200">
                    {state.liveStream.cursorPosition} / {state.liveStream.totalChars}
                  </div>
                </div>
              </div>
            )}

            {/* Round Command Buttons */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => handleRoundControl("start_countdown")}
                disabled={!activeContestant || state?.roundState === "typing"}
                className="py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-30 disabled:pointer-events-none text-black font-semibold text-xs flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer shadow-lg shadow-amber-500/20"
              >
                <Play className="w-4 h-4 fill-current" /> Start (3-2-1 Sync)
              </button>

              <button
                onClick={() => handleRoundControl("stop")}
                className="py-3 px-4 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-semibold text-xs flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer"
              >
                <UserX className="w-4 h-4" /> Stop / Abort
              </button>

              <button
                onClick={() => handleRoundControl("redo")}
                disabled={!activeContestant}
                className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-[var(--typed)] border border-white/10 text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" /> Redo (Glitch)
              </button>

              <button
                onClick={() => handleRoundControl("next_contestant")}
                className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-[var(--typed)] border border-white/10 text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <SkipForward className="w-3.5 h-3.5 text-cyan-400" /> Next Contestant
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => handleRoundControl("close_batch")}
                className="py-2.5 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                Close Current Batch
              </button>

              <button
                onClick={() => handleRoundControl("next_batch")}
                className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-[var(--typed)] border border-white/10 text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                Advance to Next Batch →
              </button>
            </div>
          </div>

          {/* Projector Display View Controller */}
          <div className="p-5 rounded-2xl bg-[var(--surface-color)] border border-[var(--surface-border)] shadow-xl flex flex-col gap-3">
            <span className="text-xs uppercase tracking-wider text-[var(--inactive-color)] font-semibold flex items-center gap-2">
              <Tv className="w-3.5 h-3.5 text-cyan-400" /> Projector View Control
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {(["overall", "batch", "podium", "live"] as ProjectorView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => handleRoundControl("set_projector_view", { view: v })}
                  className={`py-2 px-3 rounded-lg border text-xs capitalize transition-all cursor-pointer ${
                    state?.projectorView === v
                      ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-bold shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                      : "bg-black/30 border-white/5 text-[var(--inactive-color)] hover:text-[var(--typed)]"
                  }`}
                >
                  {v === "overall" && "Overall Board"}
                  {v === "batch" && "Current Batch"}
                  {v === "podium" && "Top 3 Podium"}
                  {v === "live" && "Live Big Typing"}
                </button>
              ))}
            </div>
          </div>

          {/* Configuration & Paragraph Pool Controls */}
          <div className="p-5 rounded-2xl bg-[var(--surface-color)] border border-[var(--surface-border)] shadow-xl flex flex-col gap-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="uppercase tracking-wider text-[var(--inactive-color)] font-semibold flex items-center gap-2">
                <Settings className="w-3.5 h-3.5 text-amber-400" /> Event Settings
              </span>
              <button
                onClick={() => setShowParagraphModal(true)}
                className="text-amber-400 hover:underline flex items-center gap-1"
              >
                <Eye className="w-3 h-3" /> Preview 5 Paragraphs ({state?.paragraphs?.length || 0})
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-[var(--inactive-color)] uppercase">Event Name</label>
                <input
                  type="text"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  className="w-full px-2.5 py-1.5 mt-1 rounded-lg bg-black/40 border border-white/10 text-[var(--typed)]"
                />
              </div>

              <div>
                <label className="text-[10px] text-[var(--inactive-color)] uppercase">Duration</label>
                <div className="w-full px-2.5 py-1.5 mt-1 rounded-lg bg-black/20 border border-white/5 text-[var(--inactive-color)] text-xs flex items-center justify-between">
                  <span>Fixed 60s</span>
                  <span className="text-[10px] text-amber-400">on 1st keystroke</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-[var(--inactive-color)] uppercase">Paragraph Words</label>
                <input
                  type="number"
                  value={paragraphWordCount}
                  onChange={(e) => setParagraphWordCount(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 mt-1 rounded-lg bg-black/40 border border-white/10 text-[var(--typed)]"
                />
              </div>

              <div>
                <label className="text-[10px] text-[var(--inactive-color)] uppercase">Corpus Tier</label>
                <select
                  value={tier}
                  onChange={(e) => setTier(e.target.value as DictionaryTier)}
                  className="w-full px-2.5 py-1.5 mt-1 rounded-lg bg-black/40 border border-white/10 text-[var(--typed)]"
                >
                  {DICTIONARY_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-[var(--inactive-color)] uppercase">Batch Size</label>
                <input
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 mt-1 rounded-lg bg-black/40 border border-white/10 text-[var(--typed)]"
                />
              </div>

              <div>
                <label className="text-[10px] text-[var(--inactive-color)] uppercase">Paragraph Rule</label>
                <select
                  value={paragraphRule}
                  onChange={(e) =>
                    setParagraphRule(e.target.value as "same_for_batch" | "random_per_contestant")
                  }
                  className="w-full px-2.5 py-1.5 mt-1 rounded-lg bg-black/40 border border-white/10 text-[var(--typed)]"
                >
                  <option value="same_for_batch">Same for Batch (Fair)</option>
                  <option value="random_per_contestant">Random per Person</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="text-[10px] text-[var(--inactive-color)] uppercase flex items-center justify-between">
                  <span>Reveal Mode</span>
                  <span className="text-[10px] text-amber-400">Server-Driven Coordinated Reveal</span>
                </label>
                <select
                  value={revealMode}
                  onChange={(e) => setRevealMode(e.target.value as "instant" | "batch")}
                  className="w-full px-2.5 py-1.5 mt-1 rounded-lg bg-black/40 border border-amber-500/30 text-amber-300 font-semibold"
                >
                  <option value="instant">Free Mode — Direct to leaderboard (Default, synced cohort reveal on 2+ finishers)</option>
                  <option value="batch">Batch Mode — Held until batch completion / admin trigger</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-[var(--inactive-color)] uppercase flex items-center justify-between">
                  <span>Sync Window (s)</span>
                  <span className="text-[10px] text-amber-400">5 – 15s</span>
                </label>
                <input
                  type="number"
                  min={5}
                  max={15}
                  value={syncWindowSeconds}
                  onChange={(e) => setSyncWindowSeconds(Math.max(5, Math.min(15, Number(e.target.value))))}
                  className="w-full px-2.5 py-1.5 mt-1 rounded-lg bg-black/40 border border-white/10 text-[var(--typed)]"
                />
              </div>

              <div>
                <label className="text-[10px] text-[var(--inactive-color)] uppercase flex items-center justify-between">
                  <span>Reveal Hold (s)</span>
                  <span className="text-[10px] text-amber-400">10 – 20s</span>
                </label>
                <input
                  type="number"
                  min={10}
                  max={20}
                  value={revealHoldSeconds}
                  onChange={(e) => setRevealHoldSeconds(Math.max(10, Math.min(20, Number(e.target.value))))}
                  className="w-full px-2.5 py-1.5 mt-1 rounded-lg bg-black/40 border border-white/10 text-[var(--typed)]"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSaveConfig}
                className="flex-1 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-[var(--typed)] font-semibold text-xs transition-colors cursor-pointer"
              >
                Save Config
              </button>
              <button
                onClick={handleGenerateParagraphs}
                className="flex-1 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Regenerate 5 Pool
              </button>
            </div>
          </div>
        </section>

        {/* Right Column (7 cols): Contestant Management & Batches */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          {/* Add Contestants Card */}
          <div className="p-5 rounded-2xl bg-[var(--surface-color)] border border-[var(--surface-border)] shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-[var(--inactive-color)] font-semibold flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-amber-400" /> Contestants ({state?.contestants?.length || 0})
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowBulkModal(true)}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-[var(--typed)] transition-colors cursor-pointer"
                >
                  Bulk Paste Roster
                </button>
                <a
                  href="/api/competition/export/csv"
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-[var(--typed)] flex items-center gap-1 transition-colors"
                >
                  <Download className="w-3 h-3 text-emerald-400" /> CSV
                </a>
                <button
                  onClick={() => {
                    setResetConfirmText("");
                    setShowResetModal(true);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs border border-rose-500/20 transition-colors cursor-pointer"
                >
                  Reset Event
                </button>
              </div>
            </div>

            <form onSubmit={handleAddSingleContestant} className="flex gap-2">
              <input
                type="text"
                value={singleName}
                onChange={(e) => setSingleName(e.target.value)}
                placeholder="Contestant Full Name"
                className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-[var(--typed)] focus:outline-none focus:border-amber-500/50"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs flex items-center gap-1 transition-transform active:scale-95 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </form>
          </div>

          {/* Batches Container */}
          <div className="flex flex-col gap-4">
            {batches.length === 0 ? (
              <div className="p-12 rounded-2xl bg-[var(--surface-color)]/50 border border-dashed border-white/10 text-center text-xs text-[var(--inactive-color)]">
                No contestants registered yet. Add contestants individually or bulk paste names to automatically group into batches of {batchSize}.
              </div>
            ) : (
              batches.map((b, bIdx) => {
                const isCurrentBatch = bIdx === currentBatch;
                return (
                  <div
                    key={bIdx}
                    className={`p-4 rounded-2xl border transition-all ${
                      isCurrentBatch
                        ? "bg-[var(--surface-color)] border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.06)]"
                        : "bg-[var(--surface-color)]/70 border-white/5 opacity-85"
                    }`}
                  >
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-amber-400">
                          Batch #{bIdx + 1}
                        </span>
                        {isCurrentBatch && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold uppercase">
                            Active Batch
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleRoundControl("select_batch", { batchIndex: bIdx })}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                          isCurrentBatch
                            ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                            : "bg-white/5 border-white/10 text-[var(--inactive-color)] hover:text-[var(--typed)]"
                        }`}
                      >
                        Set as Active Batch
                      </button>
                    </div>

                    {/* Contestants in this Batch */}
                    <div className="flex flex-col gap-2">
                      {b.contestants.map((c) => {
                        const isThisActive = state?.activeContestantId === c.id;
                        return (
                          <div
                            key={c.id}
                            className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-colors ${
                              isThisActive
                                ? "bg-amber-500/10 border-amber-500/40"
                                : "bg-black/30 border-white/5"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <button
                                onClick={() =>
                                  handleRoundControl("select_contestant", {
                                    contestantId: c.id,
                                  })
                                }
                                className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[10px] cursor-pointer transition-colors ${
                                  isThisActive
                                    ? "bg-amber-500 text-black"
                                    : "bg-white/5 text-[var(--inactive-color)] hover:bg-white/10"
                                }`}
                                title="Pick as current contestant"
                              >
                                {isThisActive ? "▶" : "•"}
                              </button>
                              <div className="min-w-0">
                                <div className="font-semibold text-[var(--typed)] truncate flex items-center gap-2">
                                  <span>{c.name}</span>
                                  {c.regId && (
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-amber-300/90">
                                      {c.regId}
                                    </span>
                                  )}
                                  {c.department && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[var(--inactive-color)]">
                                      {c.department}
                                    </span>
                                  )}
                                  {c.status === "completed" && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400">
                                      Done
                                    </span>
                                  )}
                                  {c.redoAllowed && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                      Redo Granted
                                    </span>
                                  )}
                                  {c.status === "absent" && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-500/20 text-slate-400">
                                      Absent
                                    </span>
                                  )}
                                  {c.status === "disqualified" && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400">
                                      DQ
                                    </span>
                                  )}
                                </div>
                                {c.hasResult && c.result && (
                                  <div className="text-[11px] text-[var(--inactive-color)] flex items-center gap-2 mt-0.5">
                                    <span className="text-amber-400 font-bold">
                                      {c.result.netWpm} WPM
                                    </span>
                                    <span>•</span>
                                    <span>{c.result.accuracy}% acc</span>
                                    <span>•</span>
                                    <span>{c.result.errors} err</span>
                                    <span>•</span>
                                    <span>{c.result.consistency}% cons</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Contestant Actions */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => handleOpenEdit(c)}
                                className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[11px] text-[var(--typed)] cursor-pointer"
                                title="Edit contestant details"
                              >
                                Edit
                              </button>
                              {c.hasResult && (
                                <button
                                  onClick={() => handleGrantRedo(c.id)}
                                  className="px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-[11px] text-amber-300 cursor-pointer font-medium"
                                  title="Allow contestant to retake test"
                                >
                                  Grant Redo
                                </button>
                              )}
                              <button
                                onClick={() =>
                                  handleRoundControl("select_contestant", {
                                    contestantId: c.id,
                                  })
                                }
                                className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[11px] text-[var(--typed)] cursor-pointer"
                              >
                                Select
                              </button>
                              {c.status !== "absent" && (
                                <button
                                  onClick={() => handleContestantStatus(c.id, "mark_absent")}
                                  className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[11px] text-[var(--inactive-color)] cursor-pointer"
                                  title="Mark absent"
                                >
                                  Absent
                                </button>
                              )}
                              {c.status !== "disqualified" && (
                                <button
                                  onClick={() => handleContestantStatus(c.id, "mark_disqualified")}
                                  className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-[11px] text-rose-300 cursor-pointer"
                                  title="Disqualify contestant"
                                >
                                  DQ
                                </button>
                              )}
                              {c.hasResult && (
                                <button
                                  onClick={() => handleContestantStatus(c.id, "delete_result")}
                                  className="p-1 rounded bg-white/5 hover:bg-rose-500/20 text-[var(--inactive-color)] hover:text-rose-400 cursor-pointer"
                                  title="Delete Result"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleContestantStatus(c.id, "remove")}
                                className="p-1 rounded bg-white/5 hover:bg-rose-500/20 text-[var(--inactive-color)] hover:text-rose-400 cursor-pointer"
                                title="Remove Contestant"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* ── EMBEDDED PROJECTOR LEADERBOARD WITH FULLSCREEN ── */}
      <section className="mt-8 p-6 rounded-3xl bg-[var(--surface-color)] border border-[var(--surface-border)] shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Tv className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-[var(--typed)]">
                Embedded Arena Projector Leaderboard
              </h2>
              <p className="text-xs text-[var(--inactive-color)]">
                Live projector mirror. Use Fullscreen on the stage display.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const el = document.getElementById("projector-frame");
                if (el) {
                  if (el.requestFullscreen) {
                    el.requestFullscreen();
                  }
                }
              }}
              className="py-2 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-semibold text-xs flex items-center gap-2 cursor-pointer shadow-lg"
            >
              <Tv className="w-3.5 h-3.5" /> Launch Fullscreen Projector
            </button>
            <Link
              href="/leaderboard"
              target="_blank"
              className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-[var(--typed)]"
            >
              Open Standalone Tab ↗
            </Link>
          </div>
        </div>

        <div className="w-full aspect-[16/9] max-h-[600px] rounded-2xl overflow-hidden border border-white/10 bg-black shadow-inner relative">
          <iframe
            id="projector-frame"
            src="/leaderboard"
            className="w-full h-full border-0"
            title="TypeX Live Stage Leaderboard Mirror"
          />
        </div>
      </section>

      {/* ── OFFICIAL RESULTS TABLE (1-Decimal WPM & Accuracy) ── */}
      <section className="mt-8 p-6 rounded-3xl bg-[var(--surface-color)] border border-[var(--surface-border)] shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div>
            <h2 className="text-base font-bold text-[var(--typed)]">
              Official Competition Results
            </h2>
            <p className="text-xs text-[var(--inactive-color)]">
              Ranked standings with 1-decimal precision and partial accuracy recovery.
            </p>
          </div>
          <button
            onClick={handleExportCsv}
            className="py-1.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-amber-400 font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Export Official CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono-custom">
            <thead>
              <tr className="border-b border-white/10 text-[var(--inactive-color)] uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-3">Rank</th>
                <th className="py-2.5 px-3">Name</th>
                <th className="py-2.5 px-3">Reg ID</th>
                <th className="py-2.5 px-3">Dept</th>
                <th className="py-2.5 px-3">Batch</th>
                <th className="py-2.5 px-3 text-right">Net WPM</th>
                <th className="py-2.5 px-3 text-right">Raw WPM</th>
                <th className="py-2.5 px-3 text-right">Accuracy</th>
                <th className="py-2.5 px-3 text-right">Errors</th>
                <th className="py-2.5 px-3 text-right">Corrected</th>
                <th className="py-2.5 px-3 text-right">Consistency</th>
                <th className="py-2.5 px-3 text-right">Duration</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(() => {
                // Build rows from state.results (first-class source of truth)
                // Fallback to contestants that have results if results is empty
                type TableRow = {
                  id: string;
                  contestantId: string;
                  name: string;
                  regId: string;
                  department: string;
                  batchIndex: number;
                  netWpm: number;
                  rawWpm: number;
                  accuracy: number;
                  errors: number;
                  correctedErrors: number;
                  consistency: number;
                  durationSeconds: number;
                };

                let rows: TableRow[] = [];
                if (state?.results && state.results.length > 0) {
                  rows = state.results.map((r) => {
                    const c = (state.contestants || []).find((ct) => ct.id === r.contestantId);
                    return {
                      id: r.id,
                      contestantId: r.contestantId,
                      name: r.name || c?.name || "",
                      regId: r.regId || c?.regId || "",
                      department: r.department || c?.department || "General",
                      batchIndex: r.batchIndex ?? c?.batchIndex ?? 0,
                      netWpm: r.netWpm,
                      rawWpm: r.rawWpm,
                      accuracy: r.accuracy,
                      errors: r.errors,
                      correctedErrors: r.correctedErrors ?? 0,
                      consistency: r.consistency,
                      durationSeconds: r.durationSeconds,
                    };
                  });
                } else if (state?.contestants) {
                  rows = state.contestants
                    .filter((c) => c.hasResult && c.result)
                    .map((c) => ({
                      id: c.id,
                      contestantId: c.id,
                      name: c.name || "",
                      regId: c.regId || "",
                      department: c.department || "General",
                      batchIndex: c.batchIndex,
                      netWpm: c.result!.netWpm,
                      rawWpm: c.result!.rawWpm,
                      accuracy: c.result!.accuracy,
                      errors: c.result!.errors,
                      correctedErrors: c.result!.correctedErrors ?? 0,
                      consistency: c.result!.consistency,
                      durationSeconds: c.result!.durationSeconds,
                    }));
                }

                const ranked = rows.sort((a, b) => {
                  if (a.netWpm !== b.netWpm) return b.netWpm - a.netWpm;
                  if (a.accuracy !== b.accuracy) return b.accuracy - a.accuracy;
                  return a.errors - b.errors;
                });

                if (ranked.length === 0) {
                  return (
                    <tr>
                      <td colSpan={13} className="py-8 text-center text-[var(--inactive-color)]">
                        No competition results recorded yet.
                      </td>
                    </tr>
                  );
                }

                return ranked.map((r, idx) => {
                  const isEditing = editingResultId === r.id;
                  const missingName = !r.name || r.name.trim().length === 0;

                  return (
                    <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-2.5 px-3 font-bold text-amber-400">#{idx + 1}</td>
                      <td className="py-2.5 px-3 font-semibold text-[var(--typed)]">
                        {isEditing ? (
                          <input
                            type="text"
                            value={inlineResultName}
                            onChange={(e) => setInlineResultName(e.target.value)}
                            placeholder="Enter Name"
                            className="px-2 py-0.5 rounded bg-black/60 border border-amber-500 text-xs text-white"
                            autoFocus
                          />
                        ) : missingName ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-rose-400 italic font-mono text-[11px]">
                              {r.regId ? `[${r.regId}] (Unnamed)` : "(Unnamed Record)"}
                            </span>
                            <button
                              onClick={() => {
                                setEditingResultId(r.id);
                                setInlineResultName(r.name);
                                setInlineResultRegId(r.regId);
                                setInlineResultDept(r.department);
                              }}
                              className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-[10px] text-amber-300 font-semibold cursor-pointer flex items-center gap-1"
                            >
                              <Edit2 className="w-2.5 h-2.5" /> Edit Name
                            </button>
                          </div>
                        ) : (
                          r.name
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--inactive-color)]">
                        {isEditing ? (
                          <input
                            type="text"
                            value={inlineResultRegId}
                            onChange={(e) => setInlineResultRegId(e.target.value)}
                            placeholder="Reg ID"
                            className="w-20 px-2 py-0.5 rounded bg-black/60 border border-white/20 text-xs text-white"
                          />
                        ) : (
                          r.regId || "-"
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--inactive-color)]">
                        {isEditing ? (
                          <input
                            type="text"
                            value={inlineResultDept}
                            onChange={(e) => setInlineResultDept(e.target.value)}
                            placeholder="Dept"
                            className="w-24 px-2 py-0.5 rounded bg-black/60 border border-white/20 text-xs text-white"
                          />
                        ) : (
                          r.department || "-"
                        )}
                      </td>
                      <td className="py-2.5 px-3">Batch #{r.batchIndex + 1}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-amber-400">
                        {r.netWpm.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[var(--inactive-color)]">
                        {r.rawWpm.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-emerald-400">
                        {`${r.accuracy.toFixed(1)}%`}
                      </td>
                      <td className="py-2.5 px-3 text-right text-rose-400">
                        {r.errors}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-300">
                        {r.correctedErrors}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[var(--inactive-color)]">
                        {`${r.consistency.toFixed(1)}%`}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[var(--inactive-color)]">
                        {`${r.durationSeconds.toFixed(1)}s`}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleSaveResultEdit(r.id)}
                              className="p-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 cursor-pointer"
                              title="Save Changes"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingResultId(null)}
                              className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/50 cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingResultId(r.id);
                              setInlineResultName(r.name);
                              setInlineResultRegId(r.regId);
                              setInlineResultDept(r.department);
                            }}
                            className="p-1 rounded hover:bg-white/10 text-[var(--inactive-color)] hover:text-amber-300 cursor-pointer"
                            title="Edit Record"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bulk Add Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-[var(--surface-color)] border border-[var(--surface-border)] shadow-2xl flex flex-col gap-4">
            <h2 className="text-sm font-bold text-[var(--typed)]">Bulk Paste Contestant Names</h2>
            <p className="text-xs text-[var(--inactive-color)]">
              Paste one name per line. They will automatically be distributed sequentially into batches of {batchSize}.
            </p>
            <textarea
              rows={8}
              value={bulkNames}
              onChange={(e) => setBulkNames(e.target.value)}
              placeholder="Alice Johnson&#10;Bob Smith&#10;Charlie Davis&#10;Diana Prince&#10;Ethan Hunt"
              className="w-full p-3 rounded-xl bg-black/50 border border-white/10 text-xs font-mono-custom text-[var(--typed)] focus:outline-none focus:border-amber-500/50"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowBulkModal(false)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-[var(--inactive-color)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleAddBulkContestants}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs cursor-pointer"
              >
                Import Contestants
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview 5 Paragraphs Modal */}
      {showParagraphModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 rounded-2xl bg-[var(--surface-color)] border border-[var(--surface-border)] shadow-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-[var(--typed)]">
                Active 5-Paragraph Pool (Difficulty ±5% Tolerances)
              </h2>
              <button
                onClick={() => setShowParagraphModal(false)}
                className="text-xs text-[var(--inactive-color)] hover:text-white"
              >
                ✕ Close
              </button>
            </div>
            <p className="text-xs text-[var(--inactive-color)]">
              All 5 paragraphs are strictly 40 words, ~5% punctuation tokens, ~5% capitalization, drawn from {state?.config.tier}.
            </p>

            <div className="flex flex-col gap-3">
              {state?.paragraphs?.map((p, idx) => (
                <div key={p.id} className="p-3.5 rounded-xl bg-black/40 border border-white/5 text-xs flex flex-col gap-1.5">
                  <div className="flex justify-between text-[10px] text-amber-400 font-bold">
                    <span>Paragraph #{idx + 1} ({p.id})</span>
                    <span>Words: {p.wordCount} | Avg Length: {p.avgWordLength.toFixed(2)} chars</span>
                  </div>
                  <p className="leading-relaxed text-[var(--typed)]">&ldquo;{p.text}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Contestant Modal */}
      {editingContestant && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md p-6 rounded-2xl bg-[var(--surface-color)] border border-[var(--surface-border)] shadow-2xl flex flex-col gap-4">
            <h2 className="text-sm font-bold text-[var(--typed)]">Edit Contestant Details</h2>
            <form onSubmit={handleSaveEdit} className="flex flex-col gap-3">
              <div>
                <label className="text-[10px] text-[var(--inactive-color)] uppercase">Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 mt-1 rounded-xl bg-black/50 border border-white/10 text-xs text-[var(--typed)] focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-[10px] text-[var(--inactive-color)] uppercase">Registration ID</label>
                <input
                  type="text"
                  required
                  value={editRegId}
                  onChange={(e) => setEditRegId(e.target.value)}
                  className="w-full px-3 py-2 mt-1 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-[var(--typed)] focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-[10px] text-[var(--inactive-color)] uppercase">Department</label>
                <input
                  type="text"
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                  className="w-full px-3 py-2 mt-1 rounded-xl bg-black/50 border border-white/10 text-xs text-[var(--typed)] focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingContestant(null)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-[var(--inactive-color)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs cursor-pointer shadow-md"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Typed Confirmation Modal for Reset Event */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md p-6 rounded-3xl bg-[var(--surface-color)] border border-rose-500/30 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--typed)]">Reset Competition Event</h2>
                <p className="text-xs text-[var(--inactive-color)]">Automatic pre-reset backup will be generated</p>
              </div>
            </div>

            <p className="text-xs text-[#94A0B8] leading-relaxed">
              This will clear all contestants, results, and round states. An automatic timestamped backup is saved to <code className="text-amber-300 font-mono text-[11px]">/backend/data/backups/</code> before clearing.
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-[var(--inactive-color)] font-semibold uppercase">
                Type <span className="text-rose-400 font-mono font-bold">CONFIRM RESET</span> to proceed:
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="CONFIRM RESET"
                className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-xs text-white font-mono focus:border-rose-400 focus:outline-none"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(false);
                  setResetConfirmText("");
                }}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-[var(--inactive-color)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetConfirmText !== "CONFIRM RESET"}
                onClick={() => {
                  handleRoundControl("reset_event");
                  setShowResetModal(false);
                  setResetConfirmText("");
                  showFeedback("Event reset successfully. Previous state backed up.");
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:pointer-events-none text-white font-semibold text-xs cursor-pointer shadow-lg shadow-rose-600/30 transition-all"
              >
                Confirm & Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Operator Status Footer */}
      <footer className="mt-12 pt-6 border-t border-white/10 text-xs font-mono text-[var(--inactive-color)] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-amber-400" />
          <span>Active Data Store:</span>
          <code className="text-amber-300 bg-black/40 px-2 py-0.5 rounded border border-white/10">
            {networkInfo?.activeDataDir ? `${networkInfo.activeDataDir}/competition_state.json` : "~/.local/share/TypeX/competition_state.json"}
          </code>
        </div>
        <div className="flex items-center gap-3">
          <span>TypeX v{networkInfo?.appVersion || "1.0.0"}</span>
          <span>•</span>
          <span className="text-emerald-400">Host Mode: {networkInfo?.isHostMode ? "Active (0.0.0.0)" : "Localhost"}</span>
        </div>
      </footer>
    </main>
  );
}
