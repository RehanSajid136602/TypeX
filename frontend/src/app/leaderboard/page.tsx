"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { CompetitionState, ProjectorView, ResultRecord, Contestant } from "@/types/typing";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Medal, Award, Crown, Zap } from "lucide-react";

export interface LeaderboardRowItem {
  id: string;
  contestantId: string;
  name: string;
  regId: string;
  department: string;
  batchIndex: number;
  netWpm: number;
  accuracy: number;
  errors: number;
}

const PAGE_SIZE = 7;
const PAGE_CYCLE_SECONDS = 8;

export default function LeaderboardProjectorPage() {
  const [state, setState] = useState<CompetitionState | null>(null);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState<number>(0);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(0);

  // Poll state every 500ms
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/competition/state");
      if (res.ok) {
        const data: CompetitionState = await res.json();
        const clientNow = Date.now();
        if (typeof data.serverTimeEpochMs === "number") {
          setServerTimeOffsetMs(data.serverTimeEpochMs - clientNow);
        }
        setState(data);
      }
    } catch (err) {
      console.warn("Projector failed to fetch state", err);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchState();
    }, 0);
    const interval = setInterval(fetchState, 500);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [fetchState]);

  // Keep live client timer updated every 200ms for smooth server-synchronized countdown derivation
  useEffect(() => {
    setCurrentTimeMs(Date.now());
    const ticker = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 200);
    return () => clearInterval(ticker);
  }, []);

  // Server-driven reveal state & countdown
  const activeReveal = state?.reveal || null;
  const currentServerTime = currentTimeMs + serverTimeOffsetMs;

  const revealRemainingSeconds = useMemo(() => {
    if (!activeReveal || !activeReveal.endsAt) return 0;
    const diff = (activeReveal.endsAt - currentServerTime) / 1000;
    return Math.max(0, Math.ceil(diff));
  }, [activeReveal, currentServerTime]);

  const isSplitReveal = activeReveal !== null && revealRemainingSeconds > 0;

  // Build rows from official RESULTS first, with fallback to contestants with results
  const rankedRows = useMemo(() => {
    const list: LeaderboardRowItem[] = [];
    const seenContestantIds = new Set<string>();

    // 1. Primary ground-truth: state.results
    if (state?.results && Array.isArray(state.results)) {
      for (const r of state.results) {
        seenContestantIds.add(r.contestantId || r.id);
        let displayName = r.name ? r.name.trim() : "";
        if (!displayName) {
          displayName = r.regId ? r.regId.trim() : "Unknown Contestant";
          console.warn(`[Leaderboard] Result record ${r.id} is missing a name; falling back to regId: ${displayName}`);
        }
        list.push({
          id: r.id,
          contestantId: r.contestantId || r.id,
          name: displayName,
          regId: r.regId || "-",
          department: r.department || "-",
          batchIndex: r.batchIndex ?? 0,
          netWpm: r.netWpm ?? 0,
          accuracy: r.accuracy ?? 100,
          errors: r.errors ?? 0,
        });
      }
    }

    // 2. Extra fallback: contestants with hasResult not yet in results array
    if (state?.contestants && Array.isArray(state.contestants)) {
      for (const c of state.contestants) {
        const cid = c.id;
        if (c.hasResult && c.result && !seenContestantIds.has(cid)) {
          let displayName = c.name ? c.name.trim() : "";
          if (!displayName) {
            displayName = c.regId ? c.regId.trim() : "Unknown Contestant";
            console.warn(`[Leaderboard] Contestant ${c.id} has result but no name; falling back to regId: ${displayName}`);
          }
          list.push({
            id: `res_fallback_${c.id}`,
            contestantId: c.id,
            name: displayName,
            regId: c.regId || "-",
            department: c.department || "-",
            batchIndex: c.batchIndex ?? 0,
            netWpm: c.result.netWpm ?? 0,
            accuracy: c.result.accuracy ?? 100,
            errors: c.result.errors ?? 0,
          });
          seenContestantIds.add(cid);
        }
      }
    }

    // Sort: Net WPM desc, accuracy desc, errors asc
    return list.sort((a, b) => {
      if (a.netWpm !== b.netWpm) return b.netWpm - a.netWpm;
      if (a.accuracy !== b.accuracy) return b.accuracy - a.accuracy;
      return a.errors - b.errors;
    });
  }, [state?.results, state?.contestants]);

  // Current batch contestants
  const currentBatchContestants = useMemo(() => {
    if (!state?.contestants) return [];
    return state.contestants.filter((c) => c.batchIndex === state.currentBatchIndex);
  }, [state?.contestants, state?.currentBatchIndex]);

  const activeContestant = state?.contestants?.find((c) => c.id === state.activeContestantId);
  const activeView: ProjectorView = state?.projectorView || "overall";

  // Contestants featured in the active server reveal
  const revealingContestants = useMemo(() => {
    if (!activeReveal || !activeReveal.contestantIds) return [];
    const idSet = new Set(activeReveal.contestantIds);
    return rankedRows.filter((r) => idSet.has(r.contestantId) || idSet.has(r.id));
  }, [activeReveal, rankedRows]);

  // Dynamic row sizing & balanced pagination based on available viewport height:
  // At 1080p: ~700px available table height / ~100px target row height = ~7 rows.
  // Window height determines target capacity clamped between 5 and 10 rows.
  const [viewportHeight, setViewportHeight] = useState<number>(1080);

  useEffect(() => {
    const updateSize = () => {
      setViewportHeight(window.innerHeight || 1080);
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Compute capacity from viewport: minimum ~100px at 1080p (scaled), clamped to 5..10
  const maxRowsPerPage = useMemo(() => {
    const availableH = viewportHeight * 0.65; // ~65% of screen is row space
    const targetRowH = Math.max(80, (viewportHeight / 1080) * 100);
    const calculated = Math.floor(availableH / targetRowH);
    return Math.max(5, Math.min(10, calculated || 7));
  }, [viewportHeight]);

  // Balanced pagination: if everyone fits (total <= maxRowsPerPage), 1 page (no paging, stretch rows).
  // Otherwise split evenly across pages (e.g. 11 contestants -> 6 + 5, never 10 + 1).
  const { totalPages, pageSlices } = useMemo(() => {
    const total = rankedRows.length;
    if (total <= maxRowsPerPage || total === 0) {
      return { totalPages: 1, pageSlices: [rankedRows] };
    }

    const pages = Math.ceil(total / maxRowsPerPage);
    const baseCount = Math.floor(total / pages);
    const extra = total % pages;

    const slices: LeaderboardRowItem[][] = [];
    let start = 0;
    for (let p = 0; p < pages; p++) {
      const size = baseCount + (p < extra ? 1 : 0);
      slices.push(rankedRows.slice(start, start + size));
      start += size;
    }

    return { totalPages: pages, pageSlices: slices };
  }, [rankedRows, maxRowsPerPage]);

  useEffect(() => {
    if (totalPages <= 1) {
      setCurrentPage(0);
      return;
    }
    const interval = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages);
    }, PAGE_CYCLE_SECONDS * 1000);
    return () => clearInterval(interval);
  }, [totalPages]);

  const pagedRows = useMemo(() => {
    if (pageSlices.length === 0) return [];
    const idx = Math.min(currentPage, pageSlices.length - 1);
    return pageSlices[idx] || [];
  }, [pageSlices, currentPage]);

  const showPaging = totalPages > 1;

  return (
    <main className="w-screen h-screen bg-[#07080b] text-[#E2E4E9] font-mono-custom p-6 md:p-10 flex flex-col justify-between overflow-hidden select-none">
      {/* Top Projector Header */}
      <header className="w-full flex items-center justify-between pb-5 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.2)]">
            <Trophy className="w-7 h-7 md:w-8 md:h-8" />
          </div>
          <div>
            <div className="text-[11px] md:text-xs uppercase tracking-widest text-[#94A0B8] flex items-center gap-2 font-bold">
              <span>STAGE TYPING ARENA</span>
              <span>•</span>
              <span className="text-amber-400 font-bold">16:9 PROJECTOR</span>
              {totalPages > 1 && (
                <>
                  <span>•</span>
                  <span className="text-cyan-400 font-bold bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30">
                    PAGE {currentPage + 1} / {totalPages}
                  </span>
                </>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold tracking-tight text-[#E2E4E9]">
              {state?.config?.eventName || "TypeX Championship"}
            </h1>
          </div>
        </div>

        {/* View Mode Indicator & Stage Live Status */}
        <div className="flex items-center gap-4 md:gap-6">
          {isSplitReveal && (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-bold animate-pulse shadow-[0_0_20px_rgba(245,158,11,0.25)]">
              <span>SYNCED REVEAL:</span>
              <span className="font-mono text-amber-200">{revealRemainingSeconds}s HOLD</span>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs">
            <span className="text-[#94A0B8] font-bold">VIEW:</span>
            <span className="text-cyan-300 font-bold uppercase tracking-wider">
              {activeView}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-xs md:text-sm font-bold text-emerald-400 tracking-wider uppercase">
              {state?.roundState === "typing" ? "ROUND LIVE" : "SYNCED ONLINE"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Screen Body: Switchable based on activeView */}
      <div className="flex-1 my-4 flex flex-col justify-center min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {/* VIEW 1: OVERALL LEADERBOARD (WITH SERVER-DRIVEN SPLIT REVEAL) */}
          {activeView === "overall" && (
            <motion.div
              key="overall"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full flex gap-6 md:gap-8 min-h-0"
            >
              {/* Overall Table - Slides to 36% when isSplitReveal is active */}
              <motion.div
                animate={{ width: isSplitReveal ? "38%" : "66%" }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className="flex flex-col min-h-0 bg-[#0d0f15] rounded-3xl border border-white/10 p-5 md:p-6 shadow-2xl overflow-hidden shrink-0"
              >
                <div className="flex items-center justify-between pb-3 border-b border-white/10 text-xs uppercase tracking-wider text-[#94A0B8] font-bold shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[#E2E4E9]">Official Standings</span>
                    {totalPages > 1 && (
                      <span className="text-amber-400 text-[11px] font-bold ml-1">
                        (Cycle: {PAGE_CYCLE_SECONDS}s)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold">{rankedRows.length} Verified</span>
                    {totalPages > 1 && (
                      <span className="px-2 py-0.5 rounded bg-white/10 text-[#E2E4E9] font-bold text-[10px]">
                        {currentPage + 1} / {totalPages}
                      </span>
                    )}
                  </div>
                </div>

                {/* Rows container filling available height without scrollbars */}
                <div className="flex-1 min-h-0 flex flex-col justify-between py-2 gap-2 overflow-hidden">
                  {rankedRows.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-[#94A0B8] font-medium">
                      Awaiting initial contestant submissions...
                    </div>
                  ) : (
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={`page-${currentPage}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3 }}
                        className="h-full flex flex-col justify-between gap-2 overflow-hidden"
                      >
                        {pagedRows.map((c) => {
                          const overallRank = rankedRows.findIndex((r) => r.id === c.id) + 1;
                          return (
                            <div
                              key={c.id}
                              data-testid="leaderboard-row"
                              className={`flex-1 min-h-[96px] px-5 md:px-7 py-3 rounded-2xl flex items-center justify-between border transition-all ${
                                overallRank === 1
                                  ? "bg-amber-500/10 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.12)]"
                                  : overallRank === 2
                                  ? "bg-slate-300/10 border-slate-300/40"
                                  : overallRank === 3
                                  ? "bg-amber-700/10 border-amber-700/40"
                                  : "bg-black/35 border-white/5"
                              }`}
                            >
                              {/* Left: Rank & Hero Name */}
                              <div className="flex items-center gap-4 min-w-0 mr-4 flex-1 overflow-hidden">
                                <span
                                  className={`w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-xl flex items-center justify-center font-black text-base md:text-lg ${
                                    overallRank === 1
                                      ? "bg-amber-500 text-black shadow-lg shadow-amber-500/30"
                                      : overallRank === 2
                                      ? "bg-slate-300 text-black"
                                      : overallRank === 3
                                      ? "bg-amber-700 text-white"
                                      : "bg-white/10 text-[#94A0B8]"
                                  }`}
                                >
                                  {overallRank}
                                </span>

                                <div className="min-w-0 flex-1 overflow-hidden">
                                  {/* Name is the hero text (at least as large as WPM) */}
                                  <div
                                    data-testid="contestant-name"
                                    className="font-black text-[#E2E4E9] truncate tracking-tight leading-none"
                                    style={{
                                      fontSize: "clamp(2rem, 3.6vw, 4.5rem)",
                                      fontWeight: 900,
                                    }}
                                    title={c.name}
                                  >
                                    {c.name}
                                  </div>
                                  <div className="text-xs md:text-sm text-[#94A0B8] truncate font-medium mt-1">
                                    {c.department && c.department !== "-" ? c.department : c.regId}
                                    {c.regId && c.department && c.department !== "-" ? ` • ${c.regId}` : ""}
                                  </div>
                                </div>
                              </div>

                              {/* Right: Giant WPM & Accuracy */}
                              <div className="flex flex-col items-end shrink-0 pl-4 border-l border-white/10">
                                <div
                                  data-testid="contestant-wpm"
                                  className="font-black text-amber-400 font-mono-custom leading-none text-right"
                                  style={{
                                    fontSize: "clamp(2rem, 3.6vw, 4.5rem)",
                                    fontWeight: 900,
                                  }}
                                >
                                  {c.netWpm.toFixed(1)}
                                </div>
                                <div className="text-xs md:text-sm text-emerald-400 font-semibold mt-1">
                                  {c.accuracy.toFixed(1)}% acc
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </motion.div>
                    </AnimatePresence>
                  )}
                </div>
              </motion.div>

              {/* Right Panel: Active Server Reveal OR Batch Panel */}
              {isSplitReveal ? (
                /* Server-Driven Synced Cohort Reveal Panel */
                <motion.div
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 30 }}
                  transition={{ duration: 0.4 }}
                  className="flex-1 flex flex-col justify-between bg-gradient-to-br from-amber-500/15 via-[#0d0f15] to-[#07080b] rounded-3xl border-2 border-amber-500/70 p-6 md:p-8 shadow-[0_0_50px_rgba(245,158,11,0.25)] min-h-0 overflow-hidden"
                >
                  <div className="flex items-center justify-between pb-4 border-b border-amber-500/30 shrink-0">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
                      <span className="text-xs md:text-sm uppercase tracking-widest text-amber-400 font-black">
                        SYNCED COHORT REVEAL
                      </span>
                    </div>
                    <span className="text-xs text-amber-300 font-mono bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30">
                      Merging in {revealRemainingSeconds}s
                    </span>
                  </div>

                  <div className="flex-1 flex flex-col justify-center gap-4 my-3 overflow-hidden">
                    {revealingContestants.map((c) => (
                      <motion.div
                        key={c.id}
                        initial={{ scale: 0.92, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="p-5 md:p-6 rounded-2xl bg-black/50 border border-amber-400/50 flex items-center justify-between shadow-xl"
                      >
                        <div className="min-w-0 mr-4">
                          <div className="text-xs uppercase tracking-wider text-amber-300/90 font-bold">
                            {c.regId} • {c.department}
                          </div>
                          <div
                            className="font-black text-[#E2E4E9] mt-1 truncate"
                            style={{ fontSize: "clamp(1.6rem, 3.2vw, 3.5rem)" }}
                            title={c.name}
                          >
                            {c.name}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div
                            className="font-black text-amber-400 font-mono-custom leading-none"
                            style={{ fontSize: "clamp(2.5rem, 5.5vw, 5rem)" }}
                          >
                            {c.netWpm.toFixed(1)}
                          </div>
                          <div className="text-[11px] uppercase tracking-widest text-[#94A0B8] mt-1 font-bold">
                            NET WPM
                          </div>
                          <div className="text-xs md:text-sm text-emerald-400 font-bold mt-1">
                            {c.accuracy.toFixed(1)}% accuracy
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="text-xs text-[#94A0B8] text-center pt-2 border-t border-white/5 font-medium shrink-0">
                    Server synchronized countdown across all display screens.
                  </div>
                </motion.div>
              ) : (
                /* Standard Current Batch Panel */
                <div className="flex-1 flex flex-col justify-between bg-[#0d0f15] rounded-3xl border border-white/10 p-5 md:p-6 shadow-2xl min-h-0 overflow-hidden">
                  <div className="flex flex-col min-h-0">
                    <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
                      <span className="text-xs uppercase tracking-wider text-amber-400 font-bold flex items-center gap-2">
                        <Zap className="w-4 h-4 fill-current" /> Batch #{((state?.currentBatchIndex ?? 0) + 1)}
                      </span>
                      <span className="text-[11px] text-[#94A0B8] uppercase font-bold">
                        {currentBatchContestants.filter((c) => c.hasResult).length}/{currentBatchContestants.length} Finished
                      </span>
                    </div>

                    <div className="flex flex-col gap-3 mt-3 overflow-hidden">
                      {currentBatchContestants.map((c) => {
                        const isTyping = state?.roundState === "typing" && state.activeContestantId === c.id;
                        return (
                          <div
                            key={c.id}
                            className={`p-4 rounded-2xl border transition-all ${
                              isTyping
                                ? "bg-amber-500/10 border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                                : c.hasResult
                                ? "bg-emerald-950/20 border-emerald-500/30"
                                : "bg-black/30 border-white/5"
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-lg md:text-xl font-extrabold text-[#E2E4E9] truncate mr-2">
                                {c.name || c.regId}
                              </span>
                              <span
                                className={`text-[10px] uppercase font-extrabold px-2.5 py-0.5 rounded shrink-0 ${
                                  isTyping
                                    ? "bg-amber-500 text-black animate-pulse"
                                    : c.hasResult
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-white/5 text-[#94A0B8]"
                                }`}
                              >
                                {isTyping ? "TYPING NOW" : c.status}
                              </span>
                            </div>

                            {/* Live typing stats if currently typing */}
                            {isTyping && (
                              <div className="mt-3 pt-3 border-t border-amber-500/20 flex justify-between items-center">
                                <div>
                                  <div className="text-[10px] text-[#94A0B8] uppercase font-bold">Live Speed</div>
                                  <div className="text-2xl font-black text-amber-400 font-mono-custom">
                                    {state?.liveStream?.currentWpm || 0} WPM
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[10px] text-[#94A0B8] uppercase font-bold">Accuracy</div>
                                  <div className="text-2xl font-black text-emerald-400 font-mono-custom">
                                    {state?.liveStream?.currentAccuracy || 100}%
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Completed Result */}
                            {c.hasResult && c.result && (
                              <div className="mt-2 flex items-center justify-between text-xs">
                                <span className="text-xl font-black text-amber-400 font-mono-custom">
                                  {c.result.netWpm.toFixed(1)} WPM
                                </span>
                                <span className="text-emerald-400 font-bold">
                                  {c.result.accuracy.toFixed(1)}% acc
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* VIEW 2: TOP 3 PODIUM CELEBRATION (Always shows top 3 regardless of paging) */}
          {activeView === "podium" && (
            <motion.div
              key="podium"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4 }}
              className="w-full h-full flex flex-col items-center justify-center gap-8"
            >
              <div className="text-center">
                <span className="text-xs uppercase tracking-widest text-amber-400 font-bold">
                  OFFICIAL GRAND PODIUM
                </span>
                <h2 className="text-4xl md:text-5xl font-black text-[#E2E4E9] mt-1">
                  Championship Leaders
                </h2>
              </div>

              {/* 3 Pillars: 2nd (Left), 1st (Center, Elevated), 3rd (Right) */}
              <div className="w-full max-w-5xl flex items-end justify-center gap-6">
                {/* 2nd Place (Silver) */}
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="flex-1 flex flex-col items-center"
                >
                  <div className="mb-4 text-center w-full px-2">
                    <Medal className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <div
                      className="font-extrabold text-[#E2E4E9] truncate"
                      style={{ fontSize: "clamp(1.2rem, 2vw, 1.8rem)" }}
                    >
                      {rankedRows[1]?.name || "TBD"}
                    </div>
                    {rankedRows[1]?.department && (
                      <div className="text-xs text-cyan-300/80 mt-0.5 truncate font-medium">
                        {rankedRows[1]?.department}
                      </div>
                    )}
                    <div className="text-3xl font-black text-slate-200 mt-1 font-mono-custom">
                      {rankedRows[1] ? `${rankedRows[1].netWpm.toFixed(1)} WPM` : "-"}
                    </div>
                    <div className="text-xs text-[#94A0B8] font-bold">
                      {rankedRows[1] ? `${rankedRows[1].accuracy.toFixed(1)}% acc` : ""}
                    </div>
                  </div>
                  <div className="w-full h-52 rounded-t-3xl bg-slate-400/20 border border-slate-400/40 flex items-center justify-center shadow-xl">
                    <span className="text-5xl font-black text-slate-300">2</span>
                  </div>
                </motion.div>

                {/* 1st Place (Gold, Highest) */}
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  transition={{ delay: 0.4, duration: 0.6 }}
                  className="flex-1 flex flex-col items-center"
                >
                  <div className="mb-4 text-center w-full px-2">
                    <Crown className="w-12 h-12 text-amber-400 mx-auto mb-2 animate-bounce" />
                    <div
                      className="font-black text-amber-300 truncate"
                      style={{ fontSize: "clamp(1.5rem, 2.5vw, 2.4rem)" }}
                    >
                      {rankedRows[0]?.name || "TBD"}
                    </div>
                    {rankedRows[0]?.department && (
                      <div className="text-xs text-amber-300/90 mt-0.5 truncate font-medium">
                        {rankedRows[0]?.department}
                      </div>
                    )}
                    <div className="text-5xl font-black text-amber-400 mt-1 font-mono-custom drop-shadow-[0_0_25px_rgba(245,158,11,0.5)]">
                      {rankedRows[0] ? `${rankedRows[0].netWpm.toFixed(1)} WPM` : "-"}
                    </div>
                    <div className="text-xs text-amber-200/90 font-bold">
                      {rankedRows[0] ? `${rankedRows[0].accuracy.toFixed(1)}% acc • ${rankedRows[0].errors} err` : ""}
                    </div>
                  </div>
                  <div className="w-full h-72 rounded-t-3xl bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.25)]">
                    <span className="text-7xl font-black text-amber-400">1</span>
                  </div>
                </motion.div>

                {/* 3rd Place (Bronze) */}
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.5 }}
                  className="flex-1 flex flex-col items-center"
                >
                  <div className="mb-4 text-center w-full px-2">
                    <Award className="w-10 h-10 text-amber-700 mx-auto mb-2" />
                    <div
                      className="font-extrabold text-[#E2E4E9] truncate"
                      style={{ fontSize: "clamp(1.2rem, 2vw, 1.8rem)" }}
                    >
                      {rankedRows[2]?.name || "TBD"}
                    </div>
                    {rankedRows[2]?.department && (
                      <div className="text-xs text-amber-600/90 mt-0.5 truncate font-medium">
                        {rankedRows[2]?.department}
                      </div>
                    )}
                    <div className="text-3xl font-black text-amber-600 mt-1 font-mono-custom">
                      {rankedRows[2] ? `${rankedRows[2].netWpm.toFixed(1)} WPM` : "-"}
                    </div>
                    <div className="text-xs text-[#94A0B8] font-bold">
                      {rankedRows[2] ? `${rankedRows[2].accuracy.toFixed(1)}% acc` : ""}
                    </div>
                  </div>
                  <div className="w-full h-40 rounded-t-3xl bg-amber-800/20 border border-amber-700/40 flex items-center justify-center shadow-xl">
                    <span className="text-5xl font-black text-amber-700">3</span>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* VIEW 3: CURRENT BATCH FOCUS */}
          {activeView === "batch" && (
            <motion.div
              key="batch"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full flex flex-col justify-center items-center gap-8 max-w-5xl mx-auto"
            >
              <div className="text-center">
                <span className="text-xs uppercase tracking-widest text-amber-400 font-bold">
                  CURRENT ROUND ON STAGE
                </span>
                <h2 className="text-5xl font-black text-[#E2E4E9] mt-2">
                  Batch #{((state?.currentBatchIndex ?? 0) + 1)} Showdown
                </h2>
              </div>

              <div className="grid grid-cols-3 gap-6 w-full">
                {currentBatchContestants.map((c, i) => {
                  const isTyping = state?.roundState === "typing" && state.activeContestantId === c.id;
                  const displayName = c.name?.trim() || c.regId;
                  return (
                    <div
                      key={c.id}
                      className={`p-6 rounded-3xl border flex flex-col justify-between gap-6 transition-all ${
                        isTyping
                          ? "bg-amber-500/15 border-amber-500 shadow-[0_0_35px_rgba(245,158,11,0.25)] scale-105"
                          : c.hasResult
                          ? "bg-[#0d0f15] border-emerald-500/40"
                          : "bg-[#0d0f15] border-white/5 opacity-70"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-amber-400">#0{i + 1}</span>
                        <span
                          className={`text-xs uppercase font-extrabold px-2.5 py-1 rounded-lg ${
                            isTyping
                              ? "bg-amber-500 text-black animate-pulse"
                              : c.hasResult
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-white/5 text-[#94A0B8]"
                          }`}
                        >
                          {isTyping ? "TYPING" : c.status}
                        </span>
                      </div>

                      <div className="text-center my-4 overflow-hidden">
                        <div
                          className="font-black text-[#E2E4E9] truncate"
                          style={{ fontSize: "clamp(1.5rem, 2.5vw, 2.2rem)" }}
                        >
                          {displayName}
                        </div>
                        {isTyping && (
                          <div className="mt-4">
                            <div className="text-5xl font-extrabold text-amber-400 font-mono-custom">
                              {state?.liveStream?.currentWpm || 0}
                            </div>
                            <div className="text-xs uppercase text-[#94A0B8] mt-1 font-bold">Live Speed (WPM)</div>
                          </div>
                        )}
                        {c.hasResult && c.result && (
                          <div className="mt-4">
                            <div className="text-5xl font-extrabold text-emerald-400 font-mono-custom">
                              {c.result.netWpm.toFixed(1)}
                            </div>
                            <div className="text-xs uppercase text-[#94A0B8] mt-1 font-bold">Final Net WPM</div>
                          </div>
                        )}
                      </div>

                      <div className="pt-4 border-t border-white/5 flex justify-between text-xs text-[#94A0B8] font-semibold">
                        <span>Accuracy: {c.hasResult ? `${c.result?.accuracy.toFixed(1)}%` : isTyping ? `${state?.liveStream?.currentAccuracy}%` : "-"}</span>
                        <span>Errors: {c.hasResult ? c.result?.errors : isTyping ? state?.liveStream?.errorCount : "-"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* VIEW 4: LIVE BIG TYPING TELEMETRY */}
          {activeView === "live" && (
            <motion.div
              key="live"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full flex flex-col justify-center items-center text-center max-w-5xl mx-auto gap-8"
            >
              <div>
                <span className="text-xs uppercase tracking-widest text-amber-400 font-bold">
                  ACTIVE CONTESTANT TELEMETRY
                </span>
                <h2
                  className="font-black text-[#E2E4E9] mt-2 truncate max-w-4xl"
                  style={{ fontSize: "clamp(2.5rem, 4.5vw, 4.2rem)" }}
                >
                  {activeContestant ? (activeContestant.name?.trim() || activeContestant.regId) : "Awaiting Contestant..."}
                </h2>
              </div>

              <div className="grid grid-cols-3 gap-8 w-full p-8 rounded-3xl bg-[#0d0f15] border border-amber-500/40 shadow-2xl">
                <div>
                  <div className="text-xs uppercase text-[#94A0B8] font-bold">Instant Speed</div>
                  <div className="text-7xl font-black text-amber-400 mt-2 font-mono-custom">
                    {state?.liveStream?.currentWpm || 0}
                  </div>
                  <div className="text-xs text-amber-200/80 mt-1 font-medium">Net Words / Min</div>
                </div>

                <div>
                  <div className="text-xs uppercase text-[#94A0B8] font-bold">Keystroke Precision</div>
                  <div className="text-7xl font-black text-emerald-400 mt-2 font-mono-custom">
                    {state?.liveStream?.currentAccuracy || 100}%
                  </div>
                  <div className="text-xs text-emerald-200/80 mt-1 font-medium">Accuracy</div>
                </div>

                <div>
                  <div className="text-xs uppercase text-[#94A0B8] font-bold">Character Progress</div>
                  <div className="text-7xl font-black text-cyan-400 mt-2 font-mono-custom">
                    {state?.liveStream?.cursorPosition || 0}
                  </div>
                  <div className="text-xs text-cyan-200/80 mt-1 font-medium">
                    of {state?.liveStream?.totalChars || 0} Characters
                  </div>
                </div>
              </div>

              {activeContestant?.assignedParagraphText && (
                <div className="w-full p-6 rounded-2xl bg-black/40 border border-white/5 text-lg leading-relaxed text-[#94A0B8] italic text-left">
                  &ldquo;{activeContestant.assignedParagraphText}&rdquo;
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Bar */}
      <footer className="w-full flex items-center justify-between text-xs text-[#94A0B8] font-semibold border-t border-white/5 pt-4 shrink-0">
        <div>
          <span>TypeX Native C++ Engine</span>
          <span className="mx-2">•</span>
          <span>Zero Client-Trust Recomputation</span>
        </div>
        <div>
          <span>Batch Size: {state?.config?.batchSize ?? 3}</span>
          <span className="mx-2">•</span>
          <span>Sync Window: {state?.config?.syncWindowSeconds ?? 10}s</span>
          <span className="mx-2">•</span>
          <span>Hold: {state?.config?.revealHoldSeconds ?? 15}s</span>
        </div>
      </footer>
    </main>
  );
}
