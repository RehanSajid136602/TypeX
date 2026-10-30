"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { User, Sparkles, LogOut, ArrowRight } from "lucide-react";
import { useProfile } from "@/context/ProfileContext";

export const FirstRunModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { createProfile, setGuestMode } = useProfile();
  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState("#F59E0B");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const COLORS = [
    { hex: "#F59E0B", label: "Amber Gold" },
    { hex: "#3B82F6", label: "Neon Blue" },
    { hex: "#10B981", label: "Emerald" },
    { hex: "#EC4899", label: "Rose Pink" },
    { hex: "#8B5CF6", label: "Purple" },
    { hex: "#06B6D4", label: "Cyan" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a typist name.");
      return;
    }
    if (trimmed.length > 40) {
      setError("Name must be 40 characters or fewer.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const prof = await createProfile(trimmed, selectedColor);
    setIsSubmitting(false);

    if (prof) {
      onClose();
    } else {
      setError("Could not create profile. A profile with this name may already exist.");
    }
  };

  const handleGuest = () => {
    setGuestMode();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-md rounded-2xl bg-[var(--surface-color,rgba(18,18,22,0.98))] border border-white/[0.12] p-8 shadow-2xl text-[var(--typed-color)] relative"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <User className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--inactive-color)] font-semibold">
              TypeX Local System
            </div>
            <h2 className="text-xl font-bold tracking-tight">Create Your Typist Profile</h2>
          </div>
        </div>

        <p className="text-xs text-[var(--inactive-color)] mb-6 leading-relaxed">
          TypeX stores your telemetry, personal bests, and mastery analytics locally in an isolated SQLite database on your machine. No accounts or external cloud servers.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-xs uppercase tracking-wider text-[var(--inactive-color)] font-medium mb-2">
              Typist Name <span className="text-amber-400">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. SpeedDemon or your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-[var(--typed-color)] placeholder:text-white/20 focus:outline-none focus:border-amber-400 focus:bg-white/[0.06] transition-all font-mono-custom"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-[var(--inactive-color)] font-medium mb-2">
              Profile Accent Color
            </label>
            <div className="flex items-center gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setSelectedColor(c.hex)}
                  style={{ backgroundColor: c.hex }}
                  className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                    selectedColor === c.hex
                      ? "ring-2 ring-white ring-offset-2 ring-offset-[#121216] scale-110"
                      : "opacity-70 hover:opacity-100"
                  }`}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-6 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-sm flex items-center justify-center gap-2 transition-transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-lg disabled:opacity-50"
              id="create-profile-submit-btn"
            >
              <span>{isSubmitting ? "Creating..." : "Start Typing as " + (name.trim() || "Typist")}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleGuest}
              className="w-full py-2.5 px-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] text-[var(--inactive-color)] hover:text-[var(--typed-color)] text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer border border-white/[0.05]"
              id="continue-as-guest-btn"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Continue as Guest (No history saved)</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
