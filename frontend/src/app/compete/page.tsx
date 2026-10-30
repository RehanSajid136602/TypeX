"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { CompetitionState, Contestant, TelemetryResult, WordResult } from "@/types/typing";
import { ResultsCard } from "@/components/ResultsCard";
import { motion, AnimatePresence } from "framer-motion";
import {
  Keyboard,
  UserCheck,
  Play,
  ArrowRight,
  Sparkles,
  ShieldAlert,
  Clock,
  Target,
  AlertTriangle,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useSoundEngine } from "@/hooks/useSoundEngine";

type FlowStep = "register" | "instructions" | "typing" | "result";

const DEPARTMENT_OPTIONS = [
  "Computer Science",
  "Software Engineering",
  "Information Technology",
  "Electrical Engineering",
  "Mechanical Engineering",
  "Product & Design",
  "Business & Management",
  "Operations",
  "Marketing & Communications",
  "General",
];

const SESSION_STORAGE_KEY = "typex_compete_session";

interface StoredSession {
  contestant: Contestant;
  step: FlowStep;
  testUsed?: boolean;
}

export default function CompetePage() {
  const [step, setStep] = useState<FlowStep>("register");
  const [state, setState] = useState<CompetitionState | null>(null);

  // Sound Engine
  const { soundEnabled, toggleSound, playClick, playError, playWordComplete } = useSoundEngine();

  // Registration Form state
  const [fullName, setFullName] = useState("");
  const [regId, setRegId] = useState("");
  const [department, setDepartment] = useState(DEPARTMENT_OPTIONS[0]);
  const [regError, setRegError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  // Active contestant for the session
  const [currentContestant, setCurrentContestant] = useState<Contestant | null>(null);

  // Typing state
  const [typedInput, setTypedInput] = useState<string>("");
  const [hasStartedTyping, setHasStartedTyping] = useState<boolean>(false);
  const [testCompleted, setTestCompleted] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Live stats
  const [liveWpm, setLiveWpm] = useState<number>(0);
  const [liveAccuracy, setLiveAccuracy] = useState<number>(100);
  const [errorCount, setErrorCount] = useState<number>(0);

  // Result stats for ResultsCard
  const [finalResult, setFinalResult] = useState<TelemetryResult | null>(null);
  const [liveRank, setLiveRank] = useState<string>("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isRetryingSubmit, setIsRetryingSubmit] = useState<boolean>(false);

  // Keystroke logging for partial accuracy recovery
  const totalKeystrokesRef = useRef<number>(0);
  const correctedErrorsRef = useRef<number>(0);
  const keystrokesLogRef = useRef<{ key: string; time: number }[]>([]);

  // Refs
  const inputRef = useRef<HTMLInputElement | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const rawKeystrokesRef = useRef<number[]>([]);
  const currentSecondKeystrokesRef = useRef<number>(0);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const regIdInputRef = useRef<HTMLInputElement | null>(null);
  const deptInputRef = useRef<HTMLInputElement | null>(null);
  const startBtnRef = useRef<HTMLButtonElement | null>(null);

  // Poll competition state for rank computation and live sync
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/competition/state");
      if (res.ok) {
        const data: CompetitionState = await res.json();
        setState(data);
      }
    } catch (err) {
      console.warn("Compete screen failed to poll state", err);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 1500);
    return () => clearInterval(interval);
  }, [fetchState]);

  // Restore state from sessionStorage on mount to prevent mid-test restarts
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) {
        const session: StoredSession = JSON.parse(saved);
        if (session && session.contestant) {
          setCurrentContestant(session.contestant);
          if (session.testUsed || session.step === "typing") {
            // If they refreshed mid-test, don't allow a fresh 60s restart:
            // either restore them or mark as attempt used
            if (session.step === "typing" && !session.testUsed) {
              // Restore them in typing screen
              setStep("typing");
            } else if (session.step === "result" && session.contestant.hasResult) {
              setStep("result");
            }
          } else {
            setStep(session.step);
          }
        }
      }
    } catch {
      // sessionStorage unavailable
    }
  }, []);

  // Compute live rank
  const computeLiveRank = useCallback(
    (contestantId?: string, wpm?: number) => {
      if (!state || !state.contestants) return "";
      const completed = state.contestants.filter((c) => c.hasResult && c.result);
      if (completed.length === 0) return "#1 of 1";

      const targetWpm = wpm ?? (completed.find((c) => c.id === contestantId)?.result?.netWpm || 0);
      let rank = 1;
      for (const c of completed) {
        if (c.id !== contestantId && (c.result?.netWpm || 0) > targetWpm) {
          rank++;
        }
      }
      return `#${rank} of ${completed.length + (contestantId && !completed.some((c) => c.id === contestantId) ? 1 : 0)}`;
    },
    [state]
  );

  // ── Step 1: Registration Handler ──────────────────────────────────────────
  const handleRegister = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setRegError(null);

    const trimmedName = fullName.trim();
    const trimmedRegId = regId.trim();
    const trimmedDept = department.trim() || "General";

    if (!trimmedName) {
      setRegError("Please enter your full name.");
      nameInputRef.current?.focus();
      return;
    }
    if (!trimmedRegId) {
      setRegError("Please enter your Registration ID.");
      regIdInputRef.current?.focus();
      return;
    }

    setIsRegistering(true);
    try {
      const res = await fetch("/api/competition/contestants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          regId: trimmedRegId,
          department: trimmedDept,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setRegError(data.error || "Registration failed. Please verify your details.");
        setIsRegistering(false);
        return;
      }

      const contestant: Contestant = data.contestant;
      setCurrentContestant(contestant);
      setStep("instructions");

      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ contestant, step: "instructions" } as StoredSession)
      );
      fetchState();
    } catch {
      setRegError("Network error contacting stage server. Please try again.");
    } finally {
      setIsRegistering(false);
    }
  };

  // ── Step 2: Instructions -> Typing Arena ──────────────────────────────────
  const handleStartFromInstructions = () => {
    if (!currentContestant) return;
    setStep("typing");
    setTypedInput("");
    setHasStartedTyping(false);
    setTestCompleted(false);
    setTimeLeft(60);
    setElapsedSeconds(0);
    setLiveWpm(0);
    setLiveAccuracy(100);
    setErrorCount(0);
    rawKeystrokesRef.current = [];
    currentSecondKeystrokesRef.current = 0;

    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        contestant: currentContestant,
        step: "typing",
        testUsed: true, // Marked so refresh won't grant an unrecorded fresh attempt
      } as StoredSession)
    );

    // Focus input area
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // Key navigation for Instructions (Enter triggers start)
  useEffect(() => {
    if (step === "instructions") {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleStartFromInstructions();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [step, currentContestant]);

  // Paragraph text
  const paragraphText = currentContestant?.assignedParagraphText || "";

  // ── Step 3: Typing Timer & Keystrokes ──────────────────────────────────────
  // Fixed 60 seconds timer starting strictly on the FIRST keystroke
  useEffect(() => {
    if (step === "typing" && hasStartedTyping && !testCompleted) {
      startTimeRef.current = Date.now();

      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          const remaining = Math.max(0, 60 - next);
          setTimeLeft(remaining);

          rawKeystrokesRef.current.push(currentSecondKeystrokesRef.current);
          currentSecondKeystrokesRef.current = 0;

          if (remaining <= 0) {
            handleFinishRound();
          }
          return next;
        });
      }, 1000);

      // Heartbeat every 500ms for stage live screen
      heartbeatIntervalRef.current = setInterval(() => {
        if (!currentContestant) return;
        fetch("/api/competition/compete/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contestantId: currentContestant.id,
            currentWpm: liveWpm,
            currentAccuracy: liveAccuracy,
            cursorPosition: typedInput.length,
            totalChars: paragraphText.length,
            errorCount: errorCount,
            elapsedSeconds: elapsedSeconds,
          }),
        }).catch(() => {});
      }, 500);

      return () => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      };
    }
  }, [hasStartedTyping, testCompleted, step]);

  // Keydown listener for Backspaces and keystrokes log
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (testCompleted) return;

    if (e.key === "Backspace") {
      const currentLen = typedInput.length;
      if (currentLen > 0) {
        // If word deletion (Ctrl+Backspace or Alt+Backspace)
        if (e.ctrlKey || e.altKey) {
          // Count how many wrong characters are being deleted
          let removeCount = 0;
          let idx = currentLen - 1;
          while (idx >= 0 && typedInput[idx] === " ") {
            idx--;
            removeCount++;
          }
          while (idx >= 0 && typedInput[idx] !== " ") {
            if (idx < paragraphText.length && typedInput[idx] !== paragraphText[idx]) {
              correctedErrorsRef.current++;
            }
            idx--;
            removeCount++;
          }
        } else {
          const lastIdx = currentLen - 1;
          if (lastIdx < paragraphText.length && typedInput[lastIdx] !== paragraphText[lastIdx]) {
            correctedErrorsRef.current++;
          }
        }
      }
      keystrokesLogRef.current.push({ key: "Backspace", time: Date.now() });
      playClick();
    } else if (e.key.length === 1) {
      totalKeystrokesRef.current++;
      keystrokesLogRef.current.push({ key: e.key, time: Date.now() });
      const currentIdx = typedInput.length;
      if (currentIdx < paragraphText.length && e.key === paragraphText[currentIdx]) {
        if (e.key === " ") {
          playWordComplete();
        } else {
          playClick();
        }
      } else {
        playError();
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (testCompleted) return;

    const val = e.target.value;

    // Start 60s timer strictly on first typed character
    if (!hasStartedTyping && val.length > 0) {
      setHasStartedTyping(true);
    }

    setTypedInput(val);
    currentSecondKeystrokesRef.current += 1;

    // Calculate characters attempted
    let correct = 0;
    let errors = 0;
    for (let i = 0; i < val.length; ++i) {
      if (i < paragraphText.length) {
        if (val[i] === paragraphText[i]) {
          correct++;
        } else {
          errors++;
        }
      } else {
        errors++;
      }
    }

    setErrorCount(errors);

    const now = Date.now();
    const elapsedMinutes = startTimeRef.current
      ? (now - startTimeRef.current) / 60000
      : 0.001;

    // Net WPM = (correct characters / 5) / elapsed minutes
    const computedWpm =
      elapsedMinutes > 0 ? (correct / 5.0) / elapsedMinutes : 0;
    setLiveWpm(Math.round(computedWpm));

    // Accuracy calculation: max(0, 1 - (uncorrected + 0.5 * corrected) / total_keystrokes) * 100
    const uncorrected = errors;
    const corrected = correctedErrorsRef.current;
    const totalKs = Math.max(val.length, totalKeystrokesRef.current);
    let computedAcc = 100;
    if (totalKs > 0) {
      const penalty = uncorrected + 0.5 * corrected;
      computedAcc = Math.max(0, 1 - penalty / totalKs) * 100;
    }
    setLiveAccuracy(Math.round(computedAcc));

    // If contestant reaches end of paragraph, submit immediately
    if (val.length >= paragraphText.length && paragraphText.length > 0) {
      handleFinishRound(val);
    }
  };

  const submitWithRetry = useCallback(
    async (payload: Record<string, unknown>, attempt = 1) => {
      try {
        setSubmitError(null);
        setIsRetryingSubmit(attempt > 1);
        const res = await fetch("/api/competition/compete/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const stateData: CompetitionState = await res.json();
          setState(stateData);
          setIsRetryingSubmit(false);
          setSubmitError(null);
          // Clean up retry storage
          sessionStorage.removeItem("typex_pending_submit");
        } else {
          throw new Error(`Server returned HTTP ${res.status}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setSubmitError(`Result submission failed (${msg}). Retrying in background...`);
        setIsRetryingSubmit(true);
        // Save pending payload to sessionStorage so results are never lost
        sessionStorage.setItem("typex_pending_submit", JSON.stringify(payload));

        // Exponential backoff: 1s, 2s, 4s, 8s, max 10s
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = setTimeout(() => {
          submitWithRetry(payload, attempt + 1);
        }, delay);
      }
    },
    []
  );

  const handleFinishRound = async (finalInput: string = typedInput) => {
    if (testCompleted) return;
    setTestCompleted(true);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);

    if (!currentContestant) return;

    const duration = startTimeRef.current
      ? (Date.now() - startTimeRef.current) / 1000
      : Math.max(1, elapsedSeconds);

    // Ground truth character breakdown
    let correct = 0;
    let incorrect = 0;
    let extra = 0;

    for (let i = 0; i < finalInput.length; ++i) {
      if (i < paragraphText.length) {
        if (finalInput[i] === paragraphText[i]) {
          correct++;
        } else {
          incorrect++;
        }
      } else {
        extra++;
      }
    }

    const targetWords = paragraphText.split(" ");
    const typedWords = finalInput.split(" ");
    const wordResults: WordResult[] = [];

    for (let i = 0; i < targetWords.length; ++i) {
      wordResults.push({
        original: targetWords[i] || "",
        typed: typedWords[i] || "",
      });
    }

    const durationMins = duration / 60.0;
    const netWpm = durationMins > 0 ? (correct / 5.0) / durationMins : 0;
    const rawWpm = durationMins > 0 ? ((correct + incorrect + extra) / 5.0) / durationMins : 0;

    const uncorrected = incorrect + extra;
    const corrected = correctedErrorsRef.current;
    const totalKs = Math.max(correct + incorrect + extra + corrected, totalKeystrokesRef.current);
    let accuracy = 100.0;
    if (totalKs > 0) {
      const penalty = uncorrected + 0.5 * corrected;
      accuracy = Math.max(0, 1 - penalty / totalKs) * 100.0;
    }

    const localResult: TelemetryResult = {
      netWpm: Math.round(netWpm * 10) / 10,
      rawWpm: Math.round(rawWpm * 10) / 10,
      accuracy: Math.round(accuracy * 10) / 10,
      consistency: 100,
      durationSeconds: Math.round(duration * 10) / 10,
      correctChars: correct,
      incorrectChars: incorrect,
      extraChars: extra,
      missedChars: Math.max(0, paragraphText.length - finalInput.length),
      correctedErrors: corrected,
      totalKeystrokes: totalKs,
      perSecondWpm: rawKeystrokesRef.current.map((k) => (k / 5.0) * 60.0),
      wordResults: wordResults,
    };

    setFinalResult(localResult);
    setLiveRank(computeLiveRank(currentContestant.id, localResult.netWpm));
    setStep("result");

    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        contestant: { ...currentContestant, hasResult: true },
        step: "result",
        testUsed: true,
      } as StoredSession)
    );

    // Authoritative submission payload with retry queue
    const submitPayload = {
      contestantId: currentContestant.id,
      durationSeconds: Math.max(1, Math.round(duration * 10) / 10),
      correctChars: correct,
      incorrectChars: incorrect,
      extraChars: extra,
      missedChars: Math.max(0, paragraphText.length - finalInput.length),
      correctedErrors: corrected,
      totalKeystrokes: totalKs,
      keystrokesLog: keystrokesLogRef.current,
      rawKeystrokesPerSecond: rawKeystrokesRef.current,
      wordResults: wordResults,
    };

    submitWithRetry(submitPayload);
  };

  // Next Contestant button handler (resets to registration screen)
  const handleNextContestant = () => {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setCurrentContestant(null);
    setFullName("");
    setRegId("");
    setDepartment(DEPARTMENT_OPTIONS[0]);
    setRegError(null);
    setTypedInput("");
    setHasStartedTyping(false);
    setTestCompleted(false);
    setTimeLeft(60);
    setElapsedSeconds(0);
    setFinalResult(null);
    setLiveRank("");
    setStep("register");
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main
      className="min-h-screen bg-[var(--bg)] text-[var(--typed)] font-mono-custom flex flex-col justify-between p-6 sm:p-10 select-none overflow-x-hidden relative"
      onClick={() => {
        if (step === "typing") inputRef.current?.focus();
      }}
    >
      {/* Top Navigation Bar */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between pb-6 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
            <Keyboard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--inactive-color)] font-semibold">
              TypeX Stage Championship
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--typed)]">
              Contestant Check-in & Arena
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleSound();
            }}
            title={soundEnabled ? "Mute typing sounds" : "Enable typing sounds"}
            className={`p-2 rounded-lg border transition-colors flex items-center justify-center cursor-pointer ${
              soundEnabled
                ? "bg-amber-400/15 border-amber-400/30 text-amber-300 hover:bg-amber-400/25"
                : "bg-white/[0.04] border-white/[0.08] text-[var(--inactive-color)] hover:text-[var(--typed)]"
            }`}
            id="compete-sound-toggle-btn"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <Link
            href="/leaderboard"
            className="px-3.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[var(--inactive-color)] hover:text-[var(--typed)] border border-white/[0.06] transition-colors"
          >
            Live Leaderboard
          </Link>
          <Link
            href="/"
            className="px-3.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[var(--inactive-color)] hover:text-[var(--typed)] border border-white/[0.06] transition-colors"
          >
            Practice Mode
          </Link>
        </div>
      </header>

      {/* ── STEP 1: REGISTRATION FORM ───────────────────────────────────────── */}
      {step === "register" && (
        <section className="w-full max-w-xl mx-auto my-auto py-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="rounded-3xl bg-white/[0.02] border border-white/[0.08] p-8 sm:p-10 shadow-2xl backdrop-blur-md"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
                1
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[var(--typed)]">
                  Contestant Check-in
                </h2>
                <p className="text-xs text-[var(--inactive-color)]">
                  Enter your official event credentials to begin.
                </p>
              </div>
            </div>

            {regError && (
              <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs">
                <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
                <div className="leading-relaxed">{regError}</div>
              </div>
            )}

            <form onSubmit={handleRegister} className="flex flex-col gap-5">
              {/* Full Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-wider text-[var(--inactive-color)] font-medium">
                  Full Name <span className="text-rose-400">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  placeholder="e.g. Alex Mercer"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      regIdInputRef.current?.focus();
                    }
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.1] text-base text-[var(--typed)] placeholder:text-white/20 focus:outline-none focus:border-amber-400 focus:bg-white/[0.05] transition-all"
                  autoFocus
                />
              </div>

              {/* Registration ID */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs uppercase tracking-wider text-[var(--inactive-color)] font-medium">
                    Registration ID <span className="text-rose-400">*</span>
                  </label>
                  <span className="text-[10px] text-[var(--inactive-color)] opacity-60">
                    Single-attempt enforced
                  </span>
                </div>
                <input
                  ref={regIdInputRef}
                  type="text"
                  required
                  placeholder="e.g. REG-042 or Student ID"
                  value={regId}
                  onChange={(e) => setRegId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      deptInputRef.current?.focus();
                    }
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.1] text-base font-mono text-[var(--typed)] placeholder:text-white/20 focus:outline-none focus:border-amber-400 focus:bg-white/[0.05] transition-all"
                />
              </div>

              {/* Department */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-wider text-[var(--inactive-color)] font-medium">
                  Department / Stream <span className="text-rose-400">*</span>
                </label>
                <input
                  ref={deptInputRef}
                  list="dept-options"
                  required
                  placeholder="Select or type department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleRegister();
                    }
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.1] text-base text-[var(--typed)] placeholder:text-white/20 focus:outline-none focus:border-amber-400 focus:bg-white/[0.05] transition-all"
                />
                <datalist id="dept-options">
                  {DEPARTMENT_OPTIONS.map((dept) => (
                    <option key={dept} value={dept} />
                  ))}
                </datalist>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isRegistering}
                className="mt-3 w-full py-3.5 px-6 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-50"
              >
                <span>{isRegistering ? "Verifying..." : "Continue to Rules"}</span>
                <ArrowRight className="w-4 h-4" />
                <span className="text-[10px] opacity-75 font-normal ml-1">Enter</span>
              </button>
            </form>
          </motion.div>
        </section>
      )}

      {/* ── STEP 2: INSTRUCTIONS SCREEN ─────────────────────────────────────── */}
      {step === "instructions" && currentContestant && (
        <section className="w-full max-w-2xl mx-auto my-auto py-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="rounded-3xl bg-white/[0.02] border border-white/[0.08] p-8 sm:p-10 shadow-2xl backdrop-blur-md flex flex-col gap-6"
          >
            {/* Header info */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
                  2
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[var(--typed)]">
                    Competition Rules & Instructions
                  </h2>
                  <p className="text-xs text-[var(--inactive-color)]">
                    Read carefully before commencing your official attempt.
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider text-[var(--inactive-color)]">
                  Registered Contestant
                </span>
                <div className="text-sm font-bold text-amber-400">
                  {currentContestant.name}
                </div>
                <div className="text-[11px] text-[var(--inactive-color)]">
                  {currentContestant.regId} • {currentContestant.department}
                </div>
              </div>
            </div>

            {/* Rules list - 5 explicit rules */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[var(--typed)]">1. Fixed 60s Duration</span>
                  <p className="text-[var(--inactive-color)] mt-1 leading-relaxed">
                    The 60s countdown begins strictly upon typing your <strong>first keystroke</strong>. Take your time to get ready.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-3">
                <Target className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[var(--typed)]">2. Partial Error Recovery</span>
                  <p className="text-[var(--inactive-color)] mt-1 leading-relaxed">
                    Mistakes deleted and fixed recover 50% penalty. Characters never reached do not reduce accuracy.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[var(--typed)]">3. Single Official Attempt</span>
                  <p className="text-[var(--inactive-color)] mt-1 leading-relaxed">
                    No restarting mid-test. Browser reload locks the attempt to maintain official competition integrity.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[var(--typed)]">4. Instant Verification</span>
                  <p className="text-[var(--inactive-color)] mt-1 leading-relaxed">
                    Completing the paragraph early or reaching 0s triggers immediate server verification and live rank display.
                  </p>
                </div>
              </div>

              <div className="sm:col-span-2 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-3">
                <Keyboard className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[var(--typed)]">5. Keyboard HUD & Controls</span>
                  <p className="text-[var(--inactive-color)] mt-1 leading-relaxed">
                    Type naturally. Standard Backspace and Ctrl+Backspace for whole words are fully supported.
                  </p>
                </div>
              </div>
            </div>

            {/* Big Start Button */}
            <div className="pt-2 flex flex-col items-center gap-3">
              <button
                ref={startBtnRef}
                onClick={handleStartFromInstructions}
                autoFocus
                className="w-full py-4 px-8 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-lg flex items-center justify-center gap-3 transition-transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-xl"
              >
                <Play className="w-5 h-5 fill-black" />
                <span>START TYPING ROUND</span>
                <span className="text-xs bg-black/15 px-2.5 py-1 rounded-md font-mono font-semibold ml-2">
                  Press Enter
                </span>
              </button>
              <span className="text-[11px] text-[var(--inactive-color)] opacity-60">
                You will see the paragraph first. The countdown begins only upon typing character 1.
              </span>
            </div>
          </motion.div>
        </section>
      )}

      {/* ── STEP 3: TYPING SCREEN ───────────────────────────────────────────── */}
      {step === "typing" && currentContestant && (
        <section className="w-full max-w-5xl mx-auto my-auto py-6 flex flex-col justify-between relative">
          {/* Hidden strictly controlled input: paste disabled, autocorrect/spellcheck off */}
          <input
            ref={inputRef}
            type="text"
            value={typedInput}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={(e) => e.preventDefault()}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={testCompleted}
            autoFocus
            className="opacity-0 absolute pointer-events-none"
          />

          {/* Top HUD with Batch Badge */}
          <div className="w-full flex items-center justify-between border-b border-white/[0.08] pb-4 mb-8">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase tracking-widest text-[var(--inactive-color)] font-medium">
                  Contestant
                </span>
                {/* Batch Badge: "Batch 2 · Seat 1 of 3" */}
                {(() => {
                  const batchIndex = currentContestant.batchIndex ?? 0;
                  const batchSize = state?.config?.batchSize || 3;
                  // Compute seat within batch
                  const sameBatch = (state?.contestants || []).filter((c) => c.batchIndex === batchIndex);
                  const seatIdx = sameBatch.findIndex((c) => c.id === currentContestant.id);
                  const seat = seatIdx >= 0 ? seatIdx + 1 : 1;
                  return (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-amber-400/15 text-amber-300 border border-amber-400/30">
                      Batch {batchIndex + 1} · Seat {seat} of {batchSize}
                    </span>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl sm:text-2xl font-bold text-[var(--typed)]">
                  {currentContestant.name}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-[var(--inactive-color)]">
                  {currentContestant.regId}
                </span>
              </div>
            </div>

            {/* Timer, Live WPM, Live Accuracy */}
            <div className="flex items-center gap-6 sm:gap-10">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-[var(--inactive-color)]">
                  Timer
                </div>
                <div
                  className={`text-3xl sm:text-4xl font-extralight tabular-nums ${
                    timeLeft <= 10 && hasStartedTyping
                      ? "text-rose-400 animate-pulse font-bold"
                      : "text-amber-400"
                  }`}
                >
                  {timeLeft}s
                </div>
              </div>

              <div className="h-8 w-px bg-white/10" />

              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-[var(--inactive-color)]">
                  Live WPM
                </div>
                <div className="text-3xl sm:text-4xl font-extralight tabular-nums text-[var(--accent-color)]">
                  {liveWpm}
                </div>
              </div>

              <div className="h-8 w-px bg-white/10" />

              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-[var(--inactive-color)]">
                  Accuracy
                </div>
                <div className="text-3xl sm:text-4xl font-extralight tabular-nums text-[var(--typed)]">
                  {liveAccuracy}%
                </div>
              </div>
            </div>
          </div>

          {/* "Start typing to begin" Hint Banner (Before first keystroke) */}
          {!hasStartedTyping && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full text-center py-2 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-center gap-2"
            >
              <Keyboard className="w-4 h-4 animate-bounce" />
              <span>
                Start typing to begin — 60-second timer starts on your first keystroke
              </span>
            </motion.div>
          )}

          {/* Big Paragraph Arena */}
          <div className="w-full min-h-[220px] p-8 rounded-3xl bg-white/[0.015] border border-white/[0.06] shadow-2xl relative text-2xl sm:text-3xl md:text-4xl leading-relaxed tracking-wide select-none font-mono-custom text-left">
            {paragraphText.split("").map((char, index) => {
              const isTyped = index < typedInput.length;
              const isCurrent = index === typedInput.length;
              const isCorrect = isTyped && typedInput[index] === char;
              const isError = isTyped && typedInput[index] !== char;

              return (
                <span key={index} className="relative">
                  {/* Caret */}
                  {isCurrent && (
                    <span className="absolute -left-[2px] top-0 bottom-0 w-[3px] bg-amber-400 rounded-full shadow-[0_0_12px_rgba(245,158,11,0.9)] animate-pulse" />
                  )}
                  <span
                    className={
                      isCorrect
                        ? "text-[var(--typed)] font-medium"
                        : isError
                        ? "text-rose-400 bg-rose-500/20 rounded px-0.5"
                        : "text-[var(--untyped)] opacity-40"
                    }
                  >
                    {char}
                  </span>
                </span>
              );
            })}
          </div>

          <div className="mt-4 text-center text-xs text-[var(--inactive-color)] opacity-60">
            Click anywhere or press any key to focus. Backspace allowed for current word.
          </div>
        </section>
      )}

      {/* ── STEP 4: RESULT SCREEN (Simplified Section 2) ────────────────────── */}
      {step === "result" && finalResult && currentContestant && (
        <section className="w-full max-w-5xl mx-auto my-auto py-4">
          {submitError && (
            <div className="mb-4 p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>{submitError}</span>
              </div>
              {isRetryingSubmit && <span className="opacity-75">Auto-retrying with backoff...</span>}
            </div>
          )}
          <ResultsCard
            results={finalResult}
            mode="competition"
            timeOption={60}
            wordsOption={50}
            tier="english_1k"
            errorSeconds={[]}
            onRestart={handleNextContestant}
            onNext={handleNextContestant}
            contestantName={currentContestant.name}
            department={currentContestant.department}
            liveRank={liveRank}
            customRestartLabel="Next Contestant"
          />
        </section>
      )}

      {/* Footer */}
      <footer className="w-full max-w-5xl mx-auto flex items-center justify-between text-xs text-[var(--inactive-color)] border-t border-white/[0.06] pt-4 mt-auto">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Stage Ready • Port 8080 C++ Engine</span>
        </div>
        <div>
          <span>Competition Rule: Fixed 60s from first keystroke</span>
        </div>
      </footer>
    </main>
  );
}
