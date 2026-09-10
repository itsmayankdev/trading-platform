"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

export default function AccountMenu() {
  const { user, loading, clear } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function signOut() {
    setBusy(true);
    try {
      const response = await fetch("/api/backend/api/v1/auth/logout", { method: "POST", credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Logout failed");
    } catch {
      // Clear the client state even if the server request fails; protected routes will re-check the session.
    } finally {
      clear();
      setOpen(false);
      window.location.replace("/login");
    }
  }

  // Never render account identity or an account button while the authentication state is
  // unknown or unauthenticated. This prevents stale identity from surviving logout/navigation.
  if (loading || !user) return null;

  return <div ref={ref} className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-label="Account menu" title="Account menu" className="flex h-8 w-8 items-center justify-center rounded-md border border-white/8 bg-[#070a0f]/90 text-white/40 backdrop-blur hover:bg-white/[.04] hover:text-white/80"><UserRound size={15} /></button>
    {open && <div className="absolute right-0 top-10 z-[80] w-64 overflow-hidden rounded-xl border border-white/[.09] bg-[#0b0f16] shadow-2xl shadow-black/40">
      <div className="border-b border-white/[.07] px-4 py-3"><div className="truncate text-sm font-semibold text-white/90">{user.display_name || "Account"}</div><div className="mt-0.5 truncate text-[10px] text-white/35">{user.email}</div></div>
      <div className="p-1.5"><Link href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs text-white/65 hover:bg-white/[.05] hover:text-white"><Settings size={14} /> Account settings</Link><button type="button" onClick={signOut} disabled={busy} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs text-red-300/75 hover:bg-red-400/[.06] hover:text-red-200 disabled:opacity-50"><LogOut size={14} /> {busy ? "Signing out…" : "Sign out"}</button></div>
    </div>}
  </div>;
}
