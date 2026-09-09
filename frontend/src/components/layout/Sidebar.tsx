"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, BarChart3, Bell, ChevronLeft, ChevronRight, FlaskConical, Globe2, LayoutDashboard, ScanSearch, Search, ShieldCheck, Star, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import MarketSelector from "@/components/markets/MarketSelector";
import { MARKET_CONTEXT_EVENT, readGlobalMarket, writeGlobalMarket } from "@/lib/marketContext";

type WatchlistItem = { symbol: string; name: string };
type InstrumentRow = { symbol: string; base_asset?: string | null };
type SidebarProps = { symbol: string; collapsed: boolean; onCollapsedChange: (value: boolean) => void; onSymbolSelect: (symbol: string) => void; selectedSymbols: string[]; onWatchlistToggle: (symbol: string) => void };
type MenuItem = { label: string; href: string; icon: typeof LayoutDashboard; permission: string };
const MENU: MenuItem[] = [
  { label: "Market Memory", href: "/", icon: LayoutDashboard, permission: "market_memory.use" }, { label: "Pattern Quality", href: "/evidence", icon: BarChart3, permission: "pattern_quality.view" }, { label: "Market Scanner", href: "/scanner", icon: ScanSearch, permission: "scanner.view" }, { label: "Pattern Alerts", href: "/alerts", icon: Bell, permission: "alerts.use" }, { label: "Replay Lab", href: "/replay", icon: Activity, permission: "replay.use" }, { label: "Evaluation Lab", href: "/evaluation", icon: FlaskConical, permission: "evaluation.use" }, { label: "Cross-Market Validation", href: "/validation", icon: Globe2, permission: "validation.use" },
];

type LegacyBridge = { host: HTMLDivElement; input: HTMLInputElement; menu: HTMLDivElement; onChange: () => void; timer?: number };

export default function Sidebar({ symbol, collapsed, onCollapsedChange, onSymbolSelect, selectedSymbols, onWatchlistToggle }: SidebarProps) {
  const pathname = usePathname();
  const initialized = useRef(false);
  const [owner, setOwner] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [globalSymbol, setGlobalSymbol] = useState(() => readGlobalMarket(symbol).symbol);

  useEffect(() => {
    const initial = readGlobalMarket(symbol).symbol;
    if (!initialized.current) { initialized.current = true; setGlobalSymbol(initial); if (initial && initial !== symbol) onSymbolSelect(initial); }
    const sync = (event: Event) => { const next = event instanceof CustomEvent ? String((event.detail as { symbol?: string })?.symbol || "") : readGlobalMarket(symbol).symbol; if (next && next !== symbol) onSymbolSelect(next); if (next) setGlobalSymbol(next); };
    window.addEventListener(MARKET_CONTEXT_EVENT, sync); window.addEventListener("storage", sync);
    return () => { window.removeEventListener(MARKET_CONTEXT_EVENT, sync); window.removeEventListener("storage", sync); };
  }, [onSymbolSelect, symbol]);

  useEffect(() => { if (!initialized.current || !symbol || symbol === globalSymbol) return; writeGlobalMarket(symbol); setGlobalSymbol(symbol); }, [symbol, globalSymbol]);

  // Migration bridge for pages that still use a legacy BTC/ETH/SOL select.
  // It uses native DOM only, so it never mounts/unmounts a second React root while React renders.
  useEffect(() => {
    const bridges = new Map<HTMLSelectElement, LegacyBridge>();
    const enhance = () => {
      document.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
        if (bridges.has(select)) return;
        const values = Array.from(select.options).map((option) => option.value.toUpperCase());
        if (!(values.includes("BTCUSDT") && values.includes("ETHUSDT") && values.includes("SOLUSDT"))) return;
        const parent = select.parentElement;
        if (!parent) return;
        const host = document.createElement("div");
        host.className = "mt-1 min-w-[190px] relative";
        const shell = document.createElement("div");
        shell.className = "flex h-8 items-center rounded border border-white/10 bg-[#0d1219] px-2 focus-within:border-amber-200/30";
        const icon = document.createElement("span");
        icon.className = "mr-1.5 text-white/25";
        icon.innerHTML = "";
        const input = document.createElement("input");
        input.value = select.value || readGlobalMarket().symbol;
        input.placeholder = "Search Binance Spot market";
        input.setAttribute("aria-label", "Search Binance Spot market");
        input.className = "w-full bg-transparent text-[11px] uppercase text-white/80 outline-none placeholder:text-white/20";
        const menu = document.createElement("div");
        menu.className = "absolute left-0 top-9 z-50 hidden max-h-64 w-[280px] overflow-auto rounded-md border border-white/10 bg-[#0b1017] p-1 shadow-2xl";
        shell.appendChild(icon); shell.appendChild(input); host.appendChild(shell); host.appendChild(menu);
        parent.insertBefore(host, select); select.style.display = "none";

        const renderResults = (items: Array<{ symbol: string; base_asset?: string | null; quote_asset?: string | null; status?: string | null }>) => {
          menu.replaceChildren();
          items.forEach((item) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "flex w-full items-center justify-between rounded px-2.5 py-2 text-left hover:bg-white/[.05]";
            const left = document.createElement("span");
            const name = document.createElement("span"); name.className = "block text-[11px] font-medium text-white/75"; name.textContent = item.symbol;
            const meta = document.createElement("span"); meta.className = "block text-[9px] text-white/25"; meta.textContent = `${item.base_asset || item.symbol} · ${item.quote_asset || ""}`;
            left.appendChild(name); left.appendChild(meta);
            const status = document.createElement("span"); status.className = "text-[8px] uppercase tracking-wider text-emerald-300/55"; status.textContent = item.status || "TRADING";
            button.appendChild(left); button.appendChild(status);
            button.addEventListener("mousedown", (event) => event.preventDefault());
            button.addEventListener("click", () => choose(item.symbol));
            menu.appendChild(button);
          });
          menu.classList.toggle("hidden", items.length === 0);
        };
        const search = async () => {
          const query = input.value.trim().toUpperCase();
          if (!query) { renderResults([]); return; }
          try {
            const response = await fetch(`/api/backend/api/v1/instruments?search=${encodeURIComponent(query)}&limit=12&status=TRADING`, { cache: "no-store" });
            if (!response.ok) { renderResults([]); return; }
            const payload = await response.json();
            renderResults(Array.isArray(payload?.instruments) ? payload.instruments : []);
          } catch { renderResults([]); }
        };
        const choose = (nextSymbol: string) => {
          const normalized = nextSymbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (!normalized) return;
          const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
          setter?.call(select, normalized);
          input.value = normalized;
          menu.classList.add("hidden");
          select.dispatchEvent(new Event("input", { bubbles: true }));
          select.dispatchEvent(new Event("change", { bubbles: true }));
          writeGlobalMarket(normalized);
        };
        const onInput = () => { if (bridges.get(select)?.timer) window.clearTimeout(bridges.get(select)?.timer); const timer = window.setTimeout(() => void search(), 120); const bridge = bridges.get(select); if (bridge) bridge.timer = timer; menu.classList.remove("hidden"); };
        const onFocus = () => { if (input.value.trim()) void search(); };
        const onChange = () => { input.value = select.value || readGlobalMarket().symbol; };
        input.addEventListener("input", onInput); input.addEventListener("focus", onFocus); select.addEventListener("change", onChange);
        bridges.set(select, { host, input, menu, onChange });
      });
      bridges.forEach((entry, select) => { if (!document.body.contains(select)) { select.removeEventListener("change", entry.onChange); if (entry.timer) window.clearTimeout(entry.timer); entry.host.remove(); bridges.delete(select); } });
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(enhance, 50);
    return () => { window.clearTimeout(timer); observer.disconnect(); bridges.forEach((entry, select) => { select.removeEventListener("change", entry.onChange); if (entry.timer) window.clearTimeout(entry.timer); entry.host.remove(); }); bridges.clear(); };
  }, [pathname]);

  useEffect(() => { let alive = true; Promise.all([fetch("/api/backend/api/v1/admin/session", { cache: "no-store", credentials: "include" }), fetch("/api/backend/api/v1/auth/me", { cache: "no-store", credentials: "include" })]).then(async ([adminResponse, userResponse]) => { const admin = await adminResponse.json().catch(() => ({})); const user = await userResponse.json().catch(() => ({})); if (!alive) return; setOwner(admin?.authenticated === true && admin?.owner === true); setPermissions(Array.isArray(user?.permissions) ? user.permissions : []); }).catch(() => { if (alive) { setOwner(false); setPermissions([]); } }); return () => { alive = false; }; }, [pathname]);
  useEffect(() => { let alive = true; const refresh = () => { let stored: string[] = []; try { const raw = JSON.parse(localStorage.getItem("market-memory-watchlist") || "[]"); if (Array.isArray(raw)) stored = raw.filter((item): item is string => typeof item === "string"); } catch { stored = []; } const merged = Array.from(new Set([...stored, ...selectedSymbols, ...(globalSymbol ? [globalSymbol] : [])])).filter(Boolean).slice(0, 20); if (!merged.length) { setWatchlistItems([]); return; } const params = new URLSearchParams({ symbols: merged.join(","), limit: String(merged.length) }); fetch(`/api/backend/api/v1/instruments?${params.toString()}`, { credentials: "include", cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((payload) => { if (!alive) return; const rows: InstrumentRow[] = Array.isArray(payload?.instruments) ? payload.instruments : []; setWatchlistItems(rows.map((row) => ({ symbol: row.symbol, name: row.base_asset || row.symbol }))); }).catch(() => { if (alive) setWatchlistItems([]); }); }; refresh(); window.addEventListener("storage", refresh); window.addEventListener(MARKET_CONTEXT_EVENT, refresh); return () => { alive = false; window.removeEventListener("storage", refresh); window.removeEventListener(MARKET_CONTEXT_EVENT, refresh); }; }, [selectedSymbols, globalSymbol]);

  const allowed = (permission: string) => permissions.includes(permission) || permissions.includes(permission.replace(".use", ".view"));
  const selectMarket = (nextSymbol: string) => { writeGlobalMarket(nextSymbol); setGlobalSymbol(nextSymbol); try { const raw = JSON.parse(localStorage.getItem("market-memory-watchlist") || "[]"); const list = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : []; localStorage.setItem("market-memory-watchlist", JSON.stringify(Array.from(new Set([...list, nextSymbol])).slice(-20))); } catch {} window.dispatchEvent(new Event("storage")); onSymbolSelect(nextSymbol); };
  const itemClass = (href: string) => `flex items-center gap-2 rounded-md px-2.5 py-2 text-[10px] font-medium transition ${pathname.startsWith(href) ? "bg-white/[0.06] text-white/85" : "text-white/45 hover:bg-white/[0.03] hover:text-white/70"} ${collapsed ? "justify-center px-0" : ""}`;

  return <aside className={`${collapsed ? "w-[52px]" : "w-[188px]"} hidden shrink-0 border-r border-white/7 bg-[#090d13] transition-[width] duration-200 lg:block`}><div className="sticky top-12 flex h-[calc(100vh-48px)] flex-col"><div className="flex h-10 items-center border-b border-white/7 px-2">{!collapsed && <span className="px-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-white/25">Workspace</span>}<button type="button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => onCollapsedChange(!collapsed)} className="ml-auto flex h-7 w-7 items-center justify-center rounded-md border border-white/8 text-white/35 hover:bg-white/5 hover:text-white/75">{collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}</button></div>
    {!collapsed && <div className="border-b border-white/7 px-2 py-2"><div className="mb-1 px-1 text-[8px] font-semibold uppercase tracking-[.14em] text-white/20">Global market</div><MarketSelector value={globalSymbol || symbol} onChange={selectMarket} className="w-full" /></div>}
    <nav className="space-y-0.5 px-2 py-2" aria-label="Research workspace">{MENU.filter((item) => allowed(item.permission)).map((item) => { const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href); const Icon = item.icon; return <Link key={item.href} href={item.href} className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-[10px] font-medium transition ${active ? "bg-white/[0.06] text-white/85" : "text-white/45 hover:bg-white/[0.03] hover:text-white/70"} ${collapsed ? "justify-center px-0" : ""}`} title={collapsed ? item.label : undefined}><Icon size={14} className={active ? "text-amber-200/80" : "text-white/35"} />{!collapsed && <span>{item.label}</span>}</Link>; })}</nav>
    <div className="space-y-0.5 px-2">{allowed("favorites.view") && <Link href="/favorites" className={itemClass("/favorites")} title={collapsed ? "Favorites" : undefined}><Star size={14} className={pathname.startsWith("/favorites") ? "text-amber-200/80" : "text-white/35"} fill={pathname.startsWith("/favorites") ? "currentColor" : "none"} />{!collapsed && <span>Favorites</span>}</Link>}<Link href="/settings" className={itemClass("/settings")} title={collapsed ? "Account settings" : undefined}><UserRound size={14} className={pathname.startsWith("/settings") ? "text-amber-200/80" : "text-white/35"} />{!collapsed && <span>Account settings</span>}</Link></div>
    {owner && <div className="mt-2 border-y border-amber-300/10 px-2 py-2"><Link href="/admin" className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-[10px] font-semibold transition ${pathname.startsWith("/admin") ? "bg-amber-300/10 text-amber-100" : "text-amber-200/55 hover:bg-amber-300/[.05] hover:text-amber-100"} ${collapsed ? "justify-center px-0" : ""}`} title={collapsed ? "Admin Control" : undefined}><ShieldCheck size={14} />{!collapsed && <><span>Admin Control</span><span className="ml-auto text-[7px] uppercase tracking-[.08em] text-amber-200/35">Owner</span></>}</Link></div>}
    <div className="mt-3 px-2">{!collapsed && <div className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-[.14em] text-white/20">Instruments</div>}<div className="space-y-0.5">{watchlistItems.map((item) => { const active = item.symbol === symbol; const selected = selectedSymbols.includes(item.symbol); return <div key={item.symbol} className={`group flex items-center gap-1.5 rounded-md border px-1.5 py-2 transition ${active ? "border-white/9 bg-white/[.055]" : "border-transparent hover:bg-white/[.025]"} ${collapsed ? "justify-center" : ""}`}><button type="button" onClick={() => selectMarket(item.symbol)} className={`min-w-0 flex-1 text-left ${collapsed ? "flex justify-center" : ""}`} title={collapsed ? `${item.name} (${item.symbol})` : undefined}><div className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-emerald-400" : "bg-white/15"}`} />{!collapsed && <span className="truncate text-[11px] font-medium text-white/70">{item.symbol}</span>}</div>{!collapsed && <div className="mt-0.5 pl-3 text-[9px] text-white/22">{item.name}</div>}</button>{!collapsed && <button type="button" aria-label={`${selected ? "Remove" : "Add"} ${item.symbol} watchlist`} onClick={() => onWatchlistToggle(item.symbol)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/20 hover:bg-white/5 hover:text-white/70">{selected ? <Star size={12} fill="currentColor" /> : <span className="text-[10px]">+</span>}</button>}</div>; })}</div>{!collapsed && watchlistItems.length === 0 && <div className="px-2 py-2 text-[9px] leading-4 text-white/20">Search any Binance Spot market above to start.</div>}</div>
    <div className="mt-auto border-t border-white/7 px-2 py-2.5">{!collapsed ? <div className="flex items-center gap-2 px-1 text-[9px] uppercase tracking-[.1em] text-white/20"><Activity size={12} /> Pattern engine v1</div> : <div className="flex justify-center"><Activity size={13} className="text-white/20" /></div>}</div></div></aside>;
}
