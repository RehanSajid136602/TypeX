import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Volume2, VolumeX, User, ChevronDown, Plus, UserCheck, LogOut, BarChart3 } from "lucide-react";
import { ThemeName } from "@/types/typing";
import { useProfile } from "@/context/ProfileContext";

interface HeaderProps {
  theme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
  isFocusMode: boolean;
  soundEnabled: boolean;
  onSoundToggle: () => void;
  onOpenCreateProfile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onThemeChange,
  isFocusMode,
  soundEnabled,
  onSoundToggle,
  onOpenCreateProfile,
}) => {
  const { profiles, activeProfile, isGuest, switchProfile, setGuestMode } = useProfile();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <header
      className={`w-full max-w-5xl mx-auto px-6 pt-8 pb-4 flex items-center justify-between select-none transition-all duration-500 ease-out relative z-40 ${
        isFocusMode
          ? "opacity-0 pointer-events-none -translate-y-2"
          : "opacity-100 translate-y-0"
      }`}
    >
      {/* Brand: Whisper-Quiet Minimal Logo */}
      <div className="flex items-center gap-2.5">
        <Link href="/" className="text-lg font-mono-custom tracking-tight font-semibold text-[var(--typed-color)]">
          Type<span className="text-[var(--accent-color)]">X</span>
        </Link>
        <span className="text-[10px] font-mono-custom text-[var(--inactive-color)] opacity-70 tracking-wider uppercase px-1.5 py-0.5 rounded bg-white/[0.04]">
          c++17
        </span>
        <Link
          href="/compete"
          className="text-[10px] font-mono-custom text-amber-300 font-semibold uppercase px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 transition-all shadow-[0_0_12px_rgba(245,158,11,0.35)] animate-pulse ml-1"
        >
          Stage Event
        </Link>
      </div>

      {/* Right Side Controls */}
      <div className="flex items-center gap-3.5 text-xs font-mono-custom text-[var(--inactive-color)]">
        {/* Profile Chip & Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors cursor-pointer text-xs"
            title="Profile options"
            id="profile-chip-btn"
          >
            {isGuest ? (
              <>
                <User className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-zinc-400">Guest</span>
              </>
            ) : activeProfile ? (
              <>
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: activeProfile.color || "#F59E0B" }}
                />
                <span className="text-[var(--typed-color)] max-w-[100px] truncate font-medium">
                  {activeProfile.name}
                </span>
              </>
            ) : (
              <>
                <User className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                <span className="text-[var(--accent-color)]">Profile</span>
              </>
            )}
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[var(--surface-color,rgba(18,18,22,0.98))] backdrop-blur-md border border-white/[0.12] shadow-2xl p-2 z-50 text-xs flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-100">
              {/* Account Link */}
              <Link
                href="/account"
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-white/[0.06] text-[var(--typed-color)] font-medium transition-colors"
                id="header-account-link"
              >
                <BarChart3 className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                <span>Account & Analytics</span>
              </Link>

              <div className="h-px bg-white/[0.08] my-1" />

              <div className="text-[10px] uppercase tracking-wider text-[var(--inactive-color)] px-2.5 py-1 font-semibold opacity-70">
                Switch Profile
              </div>

              <div className="max-h-40 overflow-y-auto flex flex-col gap-0.5">
                {profiles.map((p) => {
                  const isActive = !isGuest && activeProfile?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        switchProfile(p.id);
                        setDropdownOpen(false);
                      }}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                        isActive
                          ? "bg-amber-500/15 text-amber-300 font-semibold"
                          : "hover:bg-white/[0.05] text-[var(--typed-color)]"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="truncate">{p.name}</span>
                      </div>
                      {isActive && <UserCheck className="w-3 h-3 text-amber-300" />}
                    </button>
                  );
                })}
              </div>

              {/* Add Profile */}
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  if (onOpenCreateProfile) onOpenCreateProfile();
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] text-[var(--accent-color)] transition-colors cursor-pointer mt-1"
                id="header-add-profile-btn"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Profile</span>
              </button>

              {/* Continue as Guest */}
              <button
                onClick={() => {
                  setGuestMode();
                  switchProfile(null);
                  setDropdownOpen(false);
                }}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  isGuest
                    ? "bg-white/[0.08] text-[var(--typed-color)] font-medium"
                    : "hover:bg-white/[0.05] text-[var(--inactive-color)]"
                }`}
                id="header-guest-btn"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Guest Mode (No save)</span>
              </button>
            </div>
          )}
        </div>

        {/* Theme Switcher: Minimalist Text Pills with Underdots */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onThemeChange("obsidian")}
            className={`relative px-1 py-0.5 transition-all duration-150 cursor-pointer ${
              theme === "obsidian"
                ? "text-[var(--accent-color)] font-medium opacity-100"
                : "text-[var(--inactive-color)] opacity-60 hover:opacity-100 hover:text-[var(--typed-color)]"
            }`}
          >
            obsidian
            {theme === "obsidian" && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent-color)] shadow-[0_0_6px_var(--accent-color)]" />
            )}
          </button>
          <span className="opacity-25 font-thin text-[var(--inactive-color)]">/</span>
          <button
            onClick={() => onThemeChange("tokyo")}
            className={`relative px-1 py-0.5 transition-all duration-150 cursor-pointer ${
              theme === "tokyo"
                ? "text-[var(--accent-color)] font-medium opacity-100"
                : "text-[var(--inactive-color)] opacity-60 hover:opacity-100 hover:text-[var(--typed-color)]"
            }`}
          >
            tokyo
            {theme === "tokyo" && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent-color)] shadow-[0_0_6px_var(--accent-color)]" />
            )}
          </button>
          <span className="opacity-25 font-thin text-[var(--inactive-color)]">/</span>
          <button
            onClick={() => onThemeChange("nordic")}
            className={`relative px-1 py-0.5 transition-all duration-150 cursor-pointer ${
              theme === "nordic"
                ? "text-[var(--accent-color)] font-medium opacity-100"
                : "text-[var(--inactive-color)] opacity-60 hover:opacity-100 hover:text-[var(--typed-color)]"
            }`}
          >
            nordic
            {theme === "nordic" && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent-color)] shadow-[0_0_6px_var(--accent-color)]" />
            )}
          </button>
        </div>

        {/* Sound Toggle */}
        <div className="h-3 w-px bg-white/25" />
        <button
          onClick={onSoundToggle}
          title={soundEnabled ? "Mute sounds" : "Enable sounds"}
          className={`transition-colors duration-150 cursor-pointer p-0.5 rounded ${
            soundEnabled
              ? "text-[var(--accent-color)] hover:opacity-85"
              : "text-[var(--inactive-color)] opacity-60 hover:opacity-100 hover:text-[var(--typed-color)]"
          }`}
          id="sound-toggle-btn"
        >
          {soundEnabled ? (
            <Volume2 className="w-3.5 h-3.5" />
          ) : (
            <VolumeX className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </header>
  );
};
