"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  PersonalSettings,
  DEFAULT_PERSONAL_SETTINGS,
  ThemeName,
  FontSize,
  CaretStyle,
  StopOnError,
  SwitchProfile,
} from "@/types/typing";
import { authenticatedFetch } from "@/utils/apiSecurity";
import { setSoundVolume, setSwitchProfile } from "@/hooks/useSoundEngine";

export const THEME_BACKGROUNDS: Record<ThemeName, string> = {
  obsidian: "#0b0c10",
  tokyo: "#1a1b26",
  nordic: "#21262F",
};

export const THEME_DEFAULT_CARETS: Record<ThemeName, string> = {
  obsidian: "#f59e0b",
  tokyo: "#7aa2f7",
  nordic: "#88c0d0",
};

export const THEME_DEFAULT_CORRECT = "#22c55e";

export const FONT_SIZE_REM: Record<FontSize, string> = {
  S: "1.25rem",
  M: "1.5rem",
  L: "1.875rem",
  XL: "2.25rem",
};

export function getLuminance(hex: string): number {
  const clean = hex.replace("#", "").trim();
  if (clean.length !== 6) return 0.5;
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  const a = [r, g, b].map((v) => {
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

export function getContrastRatio(colorHex: string, bgHex: string): number {
  try {
    const l1 = getLuminance(colorHex);
    const l2 = getLuminance(bgHex);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  } catch {
    return 4.5;
  }
}

interface SettingsContextType {
  settings: PersonalSettings;
  updateSetting: <K extends keyof PersonalSettings>(key: K, val: PersonalSettings[K]) => void;
  resetSettings: () => void;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

const STORAGE_KEY = "typex_practice_settings";

function readLocalSettings(): PersonalSettings {
  if (typeof window === "undefined") return DEFAULT_PERSONAL_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_PERSONAL_SETTINGS, ...parsed };
    }
  } catch {}
  return DEFAULT_PERSONAL_SETTINGS;
}

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const isCompetitionRoute = Boolean(
    pathname && (
      pathname.startsWith("/compete") ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/leaderboard")
    )
  );

  const [settings, setSettings] = useState<PersonalSettings>(readLocalSettings);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const settingsRef = useRef<PersonalSettings>(settings);
  settingsRef.current = settings;

  // Apply CSS variables and DOM attributes
  const applySettingsToDOM = useCallback((s: PersonalSettings) => {
    if (typeof document === "undefined") return;

    // 1. Theme class on body
    const body = document.body;
    body.classList.remove("theme-obsidian", "theme-tokyo", "theme-nordic");
    body.classList.add(`theme-${s.theme}`);

    // 2. Correct-character color CSS variable
    const root = document.documentElement;
    if (s.correctColor && s.correctColor !== "default") {
      root.style.setProperty("--correct-color", s.correctColor);
      body.style.setProperty("--correct-color", s.correctColor);
    } else {
      root.style.removeProperty("--correct-color");
      body.style.removeProperty("--correct-color");
    }

    // 3. Caret color CSS variable
    if (s.caretColor && s.caretColor !== "default") {
      root.style.setProperty("--caret-color", s.caretColor);
      body.style.setProperty("--caret-color", s.caretColor);
    } else {
      root.style.removeProperty("--caret-color");
      body.style.removeProperty("--caret-color");
    }

    // 4. Font size CSS variable
    root.style.setProperty("--typing-font-size", FONT_SIZE_REM[s.fontSize] || "1.5rem");
    body.style.setProperty("--typing-font-size", FONT_SIZE_REM[s.fontSize] || "1.5rem");

    // 5. Sound engine sync
    setSoundVolume(s.volume);
    setSwitchProfile(s.soundProfile);
  }, []);

  // Synchronize on mount from backend SQLite (source of truth)
  useEffect(() => {
    let isMounted = true;
    async function loadAuthoritativeSettings() {
      try {
        const res = await authenticatedFetch("/api/accounts/settings");
        if (res.ok) {
          const data = await res.json();
          if (data && data.settings && typeof data.settings === "object" && Object.keys(data.settings).length > 0) {
            const authoritative: PersonalSettings = {
              ...DEFAULT_PERSONAL_SETTINGS,
              ...data.settings,
            };
            if (isMounted) {
              setSettings(authoritative);
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(authoritative));
              } catch {}
              applySettingsToDOM(authoritative);
            }
            return;
          }
        }
      } catch (err) {
        console.warn("Could not fetch settings from SQLite backend:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
      // If no backend settings stored yet, apply current local
      applySettingsToDOM(settingsRef.current);
    }

    loadAuthoritativeSettings();
    return () => {
      isMounted = false;
    };
  }, [applySettingsToDOM]);

  // Route-aware isolation: enforce defaults on competition routes, restore personal settings on practice routes
  useEffect(() => {
    if (isCompetitionRoute) {
      applySettingsToDOM(DEFAULT_PERSONAL_SETTINGS);
    } else {
      applySettingsToDOM(settings);
    }
  }, [isCompetitionRoute, settings, applySettingsToDOM]);

  // Update a single setting immediately with no Save button
  const updateSetting = useCallback(
    <K extends keyof PersonalSettings>(key: K, val: PersonalSettings[K]) => {
      setSettings((prev) => {
        const updated = { ...prev, [key]: val };
        // Save to localStorage mirror immediately
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch {}

        // Apply immediately to CSS variables
        applySettingsToDOM(updated);

        // Persist to SQLite backend asynchronously
        authenticatedFetch("/api/accounts/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: updated }),
        }).catch((err) => {
          console.warn("Failed to persist settings to SQLite:", err);
        });

        return updated;
      });
    },
    [applySettingsToDOM]
  );

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_PERSONAL_SETTINGS);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PERSONAL_SETTINGS));
    } catch {}
    applySettingsToDOM(DEFAULT_PERSONAL_SETTINGS);
    authenticatedFetch("/api/accounts/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: DEFAULT_PERSONAL_SETTINGS }),
    }).catch(() => {});
  }, [applySettingsToDOM]);

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, resetSettings, isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return ctx;
};
