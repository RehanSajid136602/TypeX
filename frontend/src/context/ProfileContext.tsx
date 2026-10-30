"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authenticatedFetch } from "@/utils/apiSecurity";

export interface UserProfile {
  id: number;
  name: string;
  color: string;
  createdAt: number;
  lastUsedAt: number;
  archived: boolean;
}

interface ProfileContextType {
  profiles: UserProfile[];
  activeProfile: UserProfile | null;
  isGuest: boolean;
  isLoading: boolean;
  firstRunNeeded: boolean;
  switchProfile: (profileId: number | null) => Promise<boolean>;
  createProfile: (name: string, color?: string) => Promise<UserProfile | null>;
  updateProfile: (id: number, name: string, color?: string) => Promise<boolean>;
  deleteProfile: (id: number) => Promise<boolean>;
  refreshProfiles: () => Promise<void>;
  setGuestMode: () => void;
}

const ProfileContext = createContext<ProfileContextType | null>(null);

const PROFILE_COLORS = [
  "#F59E0B", // Amber / Gold
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#EC4899", // Pink
  "#8B5CF6", // Purple
  "#06B6D4", // Cyan
  "#F97316", // Orange
  "#EF4444", // Crimson
];

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(null);
  const [isGuest, setIsGuest] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [firstRunNeeded, setFirstRunNeeded] = useState<boolean>(false);

  const refreshProfiles = useCallback(async () => {
    try {
      const res = await authenticatedFetch("/api/accounts/profiles");
      if (res.ok) {
        const data = await res.json();
        const list: UserProfile[] = data.profiles || [];
        setProfiles(list);

        if (list.length === 0) {
          // Check if guest flag set in localStorage
          const guestPref = typeof window !== "undefined" ? localStorage.getItem("typex_guest_mode") : null;
          if (guestPref === "true") {
            setIsGuest(true);
            setActiveProfile(null);
            setFirstRunNeeded(false);
          } else {
            setFirstRunNeeded(true);
            setActiveProfile(null);
          }
        } else {
          setFirstRunNeeded(false);
          const activeId = data.activeProfileId;
          const found = list.find((p) => p.id === activeId) || list[0];
          setActiveProfile(found);
          setIsGuest(false);
        }
      }
    } catch (err) {
      console.warn("Could not load user profiles:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfiles();
  }, [refreshProfiles]);

  const switchProfile = async (profileId: number | null): Promise<boolean> => {
    if (profileId === null) {
      setIsGuest(true);
      setActiveProfile(null);
      if (typeof window !== "undefined") {
        localStorage.setItem("typex_guest_mode", "true");
      }
      try {
        await authenticatedFetch("/api/accounts/profiles/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guest: true }),
        });
      } catch {}
      return true;
    }

    try {
      const res = await authenticatedFetch("/api/accounts/profiles/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      if (res.ok) {
        const updatedProf: UserProfile = await res.json();
        setActiveProfile(updatedProf);
        setIsGuest(false);
        if (typeof window !== "undefined") {
          localStorage.removeItem("typex_guest_mode");
        }
        await refreshProfiles();
        return true;
      }
    } catch (err) {
      console.error("switchProfile failed:", err);
    }
    return false;
  };

  const createProfile = async (rawName: string, color?: string): Promise<UserProfile | null> => {
    const trimmed = rawName.trim();
    if (!trimmed || trimmed.length > 40) return null;

    const chosenColor = color || PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)];

    try {
      const res = await authenticatedFetch("/api/accounts/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, color: chosenColor }),
      });
      if (res.ok) {
        const newProf: UserProfile = await res.json();
        setActiveProfile(newProf);
        setIsGuest(false);
        setFirstRunNeeded(false);
        if (typeof window !== "undefined") {
          localStorage.removeItem("typex_guest_mode");
        }
        await refreshProfiles();
        return newProf;
      }
    } catch (err) {
      console.error("createProfile failed:", err);
    }
    return null;
  };

  const updateProfile = async (id: number, name: string, color?: string): Promise<boolean> => {
    try {
      const res = await authenticatedFetch(`/api/accounts/profiles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: color || activeProfile?.color || "#F59E0B" }),
      });
      if (res.ok) {
        await refreshProfiles();
        return true;
      }
    } catch (err) {
      console.error("updateProfile failed:", err);
    }
    return false;
  };

  const deleteProfile = async (id: number): Promise<boolean> => {
    try {
      const res = await authenticatedFetch(`/api/accounts/profiles/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await refreshProfiles();
        return true;
      }
    } catch (err) {
      console.error("deleteProfile failed:", err);
    }
    return false;
  };

  const setGuestMode = () => {
    setIsGuest(true);
    setActiveProfile(null);
    setFirstRunNeeded(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("typex_guest_mode", "true");
    }
  };

  return (
    <ProfileContext.Provider
      value={{
        profiles,
        activeProfile,
        isGuest,
        isLoading,
        firstRunNeeded,
        switchProfile,
        createProfile,
        updateProfile,
        deleteProfile,
        refreshProfiles,
        setGuestMode,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
};

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return ctx;
}
