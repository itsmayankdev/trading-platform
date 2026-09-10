"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type AuthUser = { authenticated: true; id?: number; display_name?: string; email?: string; first_name?: string; last_name?: string; status?: string };
export const AUTH_CHANGED_EVENT = "market-memory-auth-changed";

type AuthContextValue = { user: AuthUser | null; loading: boolean; refresh: () => Promise<AuthUser | null>; clear: () => void };
const AuthContext = createContext<AuthContextValue | null>(null);

async function readSession(): Promise<AuthUser | null> {
  try {
    const response = await fetch("/api/backend/api/v1/auth/session", { credentials: "include", cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.authenticated ? data as AuthUser : null;
  } catch { return null; }
}

export function announceAuthChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await readSession();
    setUser(next);
    setLoading(false);
    return next;
  }, []);

  const clear = useCallback(() => { setUser(null); }, []);

  useEffect(() => {
    let alive = true;
    const sync = async () => {
      const next = await readSession();
      if (alive) { setUser(next); setLoading(false); }
    };
    void sync();
    const onAuthChanged = () => { void refresh(); };
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    return () => { alive = false; window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged); };
  }, [refresh]);

  const value = useMemo(() => ({ user, loading, refresh, clear }), [user, loading, refresh, clear]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
