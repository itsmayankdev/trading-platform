"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";

type SessionUser = { authenticated: true; display_name?: string; email?: string };

async function readSession(): Promise<SessionUser | null> {
  try {
    const response = await fetch("/api/backend/api/v1/auth/session", { credentials: "include", cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.authenticated ? data as SessionUser : null;
  } catch {
    return null;
  }
}

export default function AccountMenu() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const sync = async () => {
      const next = await readSession();
      if (!alive) return;
      setUser(next);
      setLoading(false);
      if (!next) setOpen(false);
    };
    void sync();
    const interval = window.setInterval(() => { void sync(); }, 5000);
    return () => { alive = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function signOut() {
    setBusy(true);
    setUser(null);
    setOpen(false);
    try {
      await fetch("/api/backend/api/v1/auth/logout", { method: "POST", credentials: "include", cache: "no-store" });
    } finally {
      window.location.replace("/login");
    }
  }

  // Account identity is never rendered while the session is unknown or unauthenticated.
  if (loading || !user) return null;

  return <div ref={ref} className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-label="Account menu" title="Account menu" className="flex h-8 w-8 items-center justify-center rounded-md border border-white/8 bg-[#070a0f]/90 text-white/40 backdrop-blur hover:bg-white/[.04] hover:text-white/80"><UserRound size={15} /></button>
    {open && <div className="absolute right-0 top-10 z-[80] w-64 overflow-hidden rounded-xl border border-white/[.09] bg-[#0b0f16] shadow-2xl shadow-black/40">
      <div className="border-b border-white/[.07] px-4 py-3"><div className="truncate text-sm font-semibold text-white/90">{user.display_name || "Account"}</div><div className="mt-0.5 truncate text-[10px] text-white/35">{user.email}</div></div>
      <div className="p-1.5"><Link href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs text-white/65 hover:bg-white/[.05] hover:text-white"><Settings size={14} /> Account settings</Link><button type="button" onClick={signOut} disabled={busy} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs text-red-300/75 hover:bg-red-400/[.06] hover:text-red-200 disabled:opacity-50"><LogOut size={14} /> {busy ? "Signing out…" : "Sign out"}</button></div>
    </div>}
  </div>;
}
