"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, BarChart3, Bell, ChevronLeft, ChevronRight, FlaskConical, Globe2, LayoutDashboard, ScanSearch, ShieldCheck, Star, UserRound } from "lucide-react";
import Link from "next/link";
import MarketSelector from "@/components/markets/MarketSelector";
import { MARKET_CONTEXT_EVENT, readGlobalMarket, writeGlobalMarket } from "@/lib/marketContext";

type SidebarProps = { symbol: string; collapsed: boolean; onCollapsedChange: (value: boolean) => void; onSymbolSelect: (symbol: string) => void; selectedSymbols?: string[]; onWatchlistToggle?: (symbol: string) => void };
type MenuItem = { label: string; href: string; icon: typeof LayoutDashboard; permission: string };
const MENU: MenuItem[] = [
  { label: "Market Memory", href: "/", icon: LayoutDashboard, permission: "market_memory.use" }, { label: "Pattern Quality", href: "/evidence", icon: BarChart3, permission: "pattern_quality.view" }, { label: "Market Scanner", href: "/scanner", icon: ScanSearch, permission: "scanner.view" }, { label: "Pattern Alerts", href: "/alerts", icon: Bell, permission: "alerts.use" }, { label: "Replay Lab", href: "/replay", icon: Activity, permission: "replay.use" }, { label: "Evaluation Lab", href: "/evaluation", icon: FlaskConical, permission: "evaluation.use" }, { label: "Cross-Market Validation", href: "/validation", icon: Globe2, permission: "validation.use" },
];

type LegacyBridge = { host: HTMLDivElement; input: HTMLInputElement; menu: HTMLDivElement; onChange: () => void; onGlobal: (event: Event) => void; timer?: number };
let permissionCache: { owner: boolean; permissions: string[] } | null = null;
let permissionPromise: Promise<{ owner: boolean; permissions: string[] }> | null = null;

async function loadPermissions() {
  if (permissionCache) return permissionCache;
  if (!permissionPromise) {
    permissionPromise = Promise.all([
      fetch("/api/backend/api/v1/admin/session", { cache: "no-store", credentials: "include" }),
      fetch("/api/backend/api/v1/auth/me", { cache: "no-store", credentials: "include" }),
    ]).then(async ([adminResponse, userResponse]) => {
      const admin = await adminResponse.json().catch(() => ({}));
      const user = await userResponse.json().catch(() => ({}));
      permissionCache = { owner: admin?.authenticated === true && admin?.owner === true, permissions: Array.isArray(user?.permissions) ? user.permissions : [] };
      return permissionCache;
    }).catch(() => {
      permissionCache = { owner: false, permissions: [] };
      return permissionCache;
    });
  }
  return permissionPromise;
}

export default function Sidebar({ symbol, collapsed, onCollapsedChange, onSymbolSelect }: SidebarProps) {
  const initialized = useRef(false);
  const [owner, setOwner] = useState(() => permissionCache?.owner ?? false);
  const [permissions, setPermissions] = useState<string[]>(() => permissionCache?.permissions ?? []);
  const [globalSymbol, setGlobalSymbol] = useState(() => readGlobalMarket(symbol).symbol);

  useEffect(() => {
    const initial = readGlobalMarket(symbol).symbol;
    if (!initialized.current) { initialized.current = true; setGlobalSymbol(initial); if (initial && initial !== symbol) onSymbolSelect(initial); }
    const sync = (event: Event) => { const next = event instanceof CustomEvent ? String((event.detail as { symbol?: string })?.symbol || "") : readGlobalMarket(symbol).symbol; if (next && next !== symbol) onSymbolSelect(next); if (next) setGlobalSymbol(next); };
    window.addEventListener(MARKET_CONTEXT_EVENT, sync); window.addEventListener("storage", sync);
    return () => { window.removeEventListener(MARKET_CONTEXT_EVENT, sync); window.removeEventListener("storage", sync); };
  }, [onSymbolSelect, symbol]);

  useEffect(() => { if (!initialized.current || !symbol || symbol === globalSymbol) return; writeGlobalMarket(symbol); setGlobalSymbol(symbol); }, [symbol, globalSymbol]);

  // One-shot compatibility adapter for legacy module selects. The previous
  // implementation kept a MutationObserver on the entire document and mounted
  // React roots dynamically; that caused unnecessary work during route changes.
  // The adapter now performs a short one-time scan after the page DOM is ready.
  useEffect(() => {
    const bridges = new Map<HTMLSelectElement, LegacyBridge>();
    const enhance = () => {
      document.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
        if (bridges.has(select)) return;
        const values = Array.from(select.options).map((option) => option.value.toUpperCase());
        if (!values.some((value) => ["BTCUSDT", "ETHUSDT", "SOLUSDT"].includes(value))) return;
        const parent = select.parentElement;
        if (!parent) return;
        const host = document.createElement("div"); host.className = "mt-1 min-w-[190px] relative";
        const shell = document.createElement("div"); shell.className = "flex h-8 items-center rounded border border-white/10 bg-[#0d1219] px-2 focus-within:border-amber-200/30";
        const icon = document.createElement("span"); icon.className = "mr-1.5 text-white/25"; icon.textContent = "⌕";
        const input = document.createElement("input"); input.value = select.value || readGlobalMarket().symbol; input.placeholder = "Search Binance Spot market"; input.setAttribute("aria-label", "Search Binance Spot market"); input.className = "w-full bg-transparent text-[11px] uppercase text-white/80 outline-none placeholder:text-white/20";
        const menu = document.createElement("div"); menu.className = "absolute left-0 top-9 z-50 hidden max-h-72 w-[300px] overflow-auto rounded-md border border-white/10 bg-[#0b1017] p-1 shadow-2xl";
        shell.appendChild(icon); shell.appendChild(input); host.appendChild(shell); host.appendChild(menu); parent.insertBefore(host, select); select.style.display = "none";
        const choose = (nextSymbol: string) => { const normalized = nextSymbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); if (!normalized) return; if (!Array.from(select.options).some((option) => option.value.toUpperCase() === normalized)) { const option = document.createElement("option"); option.value = normalized; option.textContent = normalized; select.appendChild(option); } const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set; setter?.call(select, normalized); input.value = normalized; menu.classList.add("hidden"); select.dispatchEvent(new Event("input", { bubbles: true })); select.dispatchEvent(new Event("change", { bubbles: true })); writeGlobalMarket(normalized); };
        const renderResults = (items: Array<{ symbol: string; base_asset?: string | null; quote_asset?: string | null; status?: string | null; quote_volume_24h?: number | null }>) => { menu.replaceChildren(); items.forEach((item) => { const button = document.createElement("button"); button.type = "button"; button.className = "flex w-full items-center justify-between rounded px-2.5 py-2 text-left hover:bg-white/[.05]"; const left = document.createElement("span"); const name = document.createElement("span"); name.className = "block text-[11px] font-medium text-white/75"; name.textContent = `${item.base_asset || item.symbol} · ${item.symbol}`; const volume = item.quote_volume_24h == null ? "—" : item.quote_volume_24h >= 1_000_000_000 ? `$${(item.quote_volume_24h / 1_000_000_000).toFixed(1)}B` : item.quote_volume_24h >= 1_000_000 ? `$${(item.quote_volume_24h / 1_000_000).toFixed(1)}M` : `$${item.quote_volume_24h.toFixed(0)}`; const meta = document.createElement("span"); meta.className = "block text-[9px] text-white/25"; meta.textContent = `${item.quote_asset || ""} · 24h volume ${volume}`; left.appendChild(name); left.appendChild(meta); const status = document.createElement("span"); status.className = "text-[8px] uppercase tracking-wider text-emerald-300/55"; status.textContent = item.status || "TRADING"; button.appendChild(left); button.appendChild(status); button.addEventListener("mousedown", (event) => event.preventDefault()); button.addEventListener("click", () => choose(item.symbol)); menu.appendChild(button); }); menu.classList.toggle("hidden", items.length === 0); };
        const search = async () => { const query = input.value.trim().toUpperCase(); if (!query) { renderResults([]); return; } try { const response = await fetch(`/api/backend/api/v1/instruments?search=${encodeURIComponent(query)}&limit=12&status=TRADING&sort=volume`, { cache: "no-store" }); if (!response.ok) { renderResults([]); return; } const payload = await response.json(); renderResults(Array.isArray(payload?.instruments) ? payload.instruments : []); } catch { renderResults([]); } };
        const onInput = () => { const bridge = bridges.get(select); if (bridge?.timer) window.clearTimeout(bridge.timer); const timer = window.setTimeout(() => void search(), 120); if (bridge) bridge.timer = timer; menu.classList.remove("hidden"); };
        const onFocus = () => { if (input.value.trim()) void search(); };
        const onChange = () => { input.value = select.value || readGlobalMarket().symbol; };
        const onGlobal = (event: Event) => { const detail = event instanceof CustomEvent ? event.detail as { symbol?: string } : undefined; if (detail?.symbol) input.value = String(detail.symbol).toUpperCase(); };
        input.addEventListener("input", onInput); input.addEventListener("focus", onFocus); select.addEventListener("change", onChange); window.addEventListener(MARKET_CONTEXT_EVENT, onGlobal);
        bridges.set(select, { host, input, menu, onChange, onGlobal });
      });
    };
    const first = window.requestAnimationFrame(enhance);
    const second = window.setTimeout(enhance, 120);
    return () => { window.cancelAnimationFrame(first); window.clearTimeout(second); bridges.forEach((entry, select) => { select.removeEventListener("change", entry.onChange); window.removeEventListener(MARKET_CONTEXT_EVENT, entry.onGlobal); if (entry.timer) window.clearTimeout(entry.timer); entry.host.remove(); select.style.display = ""; }); bridges.clear(); };
  }, []);

  useEffect(() => { let alive = true; void loadPermissions().then((result) => { if (!alive) return; setOwner(result.owner); setPermissions(result.permissions); }); return () => { alive = false; }; }, []);

  const allowed = (permission: string) => permissions.includes(permission) || permissions.includes(permission.replace(".use", ".view"));
  const selectMarket = (nextSymbol: string) => { const normalized = nextSymbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); if (!normalized) return; writeGlobalMarket(normalized); setGlobalSymbol(normalized); onSymbolSelect(normalized); };
  const itemClass = (href: string) => `flex items-center gap-2 rounded-md px-2.5 py-2 text-[10px] font-medium transition ${typeof window !== "undefined" && window.location.pathname.startsWith(href) ? "bg-white/[0.06] text-white/85" : "text-white/45 hover:bg-white/[0.03] hover:text-white/70"} ${collapsed ? "justify-center px-0" : ""}`;

  return <aside className={`${collapsed ? "w-[52px]" : "w-[188px]"} hidden shrink-0 border-r border-white/7 bg-[#090d13] transition-[width] duration-200 lg:block`}><div className="sticky top-12 flex h-[calc(100vh-48px)] flex-col"><div className="flex h-10 items-center border-b border-white/7 px-2">{!collapsed && <span className="px-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-white/25">Workspace</span>}<button type="button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => onCollapsedChange(!collapsed)} className="ml-auto flex h-7 w-7 items-center justify-center rounded-md border border-white/8 text-white/35 hover:bg-white/5 hover:text-white/75">{collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}</button></div>
    {!collapsed && <div className="border-b border-white/7 px-2 py-2"><div className="mb-1 px-1 text-[8px] font-semibold uppercase tracking-[.14em] text-white/20">Global market</div><MarketSelector value={globalSymbol || symbol} onChange={selectMarket} className="w-full" /></div>}
    <nav className="space-y-0.5 px-2 py-2" aria-label="Research workspace">{MENU.filter((item) => allowed(item.permission)).map((item) => { const active = typeof window !== "undefined" ? (item.href === "/" ? window.location.pathname === "/" : window.location.pathname.startsWith(item.href)) : false; const Icon = item.icon; return <Link key={item.href} href={item.href} prefetch={true} className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-[10px] font-medium transition ${active ? "bg-white/[0.06] text-white/85" : "text-white/45 hover:bg-white/[0.03] hover:text-white/70"} ${collapsed ? "justify-center px-0" : ""}`} title={collapsed ? item.label : undefined}><Icon size={14} className={active ? "text-amber-200/80" : "text-white/35"} />{!collapsed && <span>{item.label}</span>}</Link>; })}</nav>
    <div className="space-y-0.5 px-2">{allowed("favorites.view") && <Link href="/favorites" prefetch={true} className={itemClass("/favorites")} title={collapsed ? "Favorites" : undefined}><Star size={14} className="text-white/35" />{!collapsed && <span>Favorites</span>}</Link>}<Link href="/settings" prefetch={true} className={itemClass("/settings")} title={collapsed ? "Account settings" : undefined}><UserRound size={14} className="text-white/35" />{!collapsed && <span>Account settings</span>}</Link></div>
    {owner && <div className="mt-2 border-y border-amber-300/10 px-2 py-2"><Link href="/admin" prefetch={true} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[10px] font-semibold text-amber-200/55 hover:bg-amber-300/[.05] hover:text-amber-100" title={collapsed ? "Admin Control" : undefined}><ShieldCheck size={14} />{!collapsed && <><span>Admin Control</span><span className="ml-auto text-[7px] uppercase tracking-[.08em] text-amber-200/35">Owner</span></>}</Link></div>}
    <div className="mt-auto border-t border-white/7 px-2 py-2.5">{!collapsed ? <div className="flex items-center gap-2 px-1 text-[9px] uppercase tracking-[.1em] text-white/20"><Activity size={12} /> Pattern engine v1</div> : <div className="flex justify-center"><Activity size={13} className="text-white/20" /></div>}</div></div></aside>;
}
