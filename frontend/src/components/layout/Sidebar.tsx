"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, BarChart3, Bell, ChevronLeft, ChevronRight, FlaskConical, Globe2, LayoutDashboard, ScanSearch, ShieldCheck, Star, UserRound, X } from "lucide-react";
import Link from "next/link";
import MarketSelector from "@/components/markets/MarketSelector";
import { MARKET_CONTEXT_EVENT, normalizeMarketSymbol, readGlobalMarket, writeGlobalMarket } from "@/lib/marketContext";

type SidebarProps = {
  symbol: string;
  collapsed: boolean;
  onCollapsedChange: (value: boolean) => void;
  onSymbolSelect: (symbol: string) => void;
  selectedSymbols?: string[];
  onWatchlistToggle?: (symbol: string) => void;
};

type MenuItem = { label: string; href: string; icon: typeof LayoutDashboard };

const MENU: MenuItem[] = [
  { label: "Market Memory", href: "/", icon: LayoutDashboard },
  { label: "Pattern Quality", href: "/evidence", icon: BarChart3 },
  { label: "Market Scanner", href: "/scanner", icon: ScanSearch },
  { label: "Pattern Alerts", href: "/alerts", icon: Bell },
  { label: "Replay Lab", href: "/replay", icon: Activity },
  { label: "Evaluation Lab", href: "/evaluation", icon: FlaskConical },
  { label: "Cross-Market Validation", href: "/validation", icon: Globe2 },
];

export default function Sidebar({ symbol, collapsed, onCollapsedChange, onSymbolSelect, selectedSymbols = [], onWatchlistToggle }: SidebarProps) {
  const initialized = useRef(false);
  const [globalSymbol, setGlobalSymbol] = useState(() => readGlobalMarket(symbol).symbol);
  const [owner, setOwner] = useState(false);

  useEffect(() => {
    const initial = readGlobalMarket(symbol).symbol;
    if (!initialized.current) {
      initialized.current = true;
      setGlobalSymbol(initial);
      if (initial && initial !== symbol) onSymbolSelect(initial);
    }

    const sync = (event: Event) => {
      const next = event instanceof CustomEvent
        ? String((event.detail as { symbol?: string })?.symbol || "")
        : readGlobalMarket(symbol).symbol;
      if (!next) return;
      setGlobalSymbol(next);
      if (next !== symbol) onSymbolSelect(next);
    };

    window.addEventListener(MARKET_CONTEXT_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MARKET_CONTEXT_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [onSymbolSelect, symbol]);

  useEffect(() => {
    if (!initialized.current || !symbol || symbol === globalSymbol) return;
    writeGlobalMarket(symbol);
    setGlobalSymbol(symbol);
  }, [symbol, globalSymbol]);

  useEffect(() => {
    let alive = true;
    fetch("/api/backend/api/v1/admin/session", { cache: "no-store", credentials: "include" })
      .then((response) => response.json().catch(() => ({})))
      .then((data) => {
        if (alive) setOwner(data?.authenticated === true && data?.owner === true);
      })
      .catch(() => { if (alive) setOwner(false); });
    return () => { alive = false; };
  }, []);

  const selectMarket = (nextSymbol: string) => {
    const normalized = normalizeMarketSymbol(nextSymbol);
    if (!normalized) return;
    writeGlobalMarket(normalized);
    setGlobalSymbol(normalized);
    onSymbolSelect(normalized);
  };

  const removeWatchlistMarket = (event: React.MouseEvent, market: string) => {
    event.preventDefault();
    event.stopPropagation();
    onWatchlistToggle?.(market);
  };

  const itemClass = (href: string) => `flex items-center gap-2 rounded-md px-2.5 py-2 text-[10px] font-medium transition text-white/45 hover:bg-white/[0.03] hover:text-white/70 ${collapsed ? "justify-center px-0" : ""}`;

  return (
    <aside className={`${collapsed ? "w-[52px]" : "w-[188px]"} hidden shrink-0 border-r border-white/7 bg-[#090d13] transition-[width] duration-200 lg:block`}>
      <div className="sticky top-12 flex h-[calc(100vh-48px)] flex-col overflow-hidden">
        <div className="flex h-10 shrink-0 items-center border-b border-white/7 px-2">
          {!collapsed && <span className="px-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-white/25">Workspace</span>}
          <button type="button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => onCollapsedChange(!collapsed)} className="ml-auto flex h-7 w-7 items-center justify-center rounded-md border border-white/8 text-white/35 hover:bg-white/5 hover:text-white/75">
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {!collapsed && (
          <div className="shrink-0 border-b border-white/7 px-2 py-2">
            <div className="mb-1 px-1 text-[8px] font-semibold uppercase tracking-[.14em] text-white/20">Global market</div>
            <MarketSelector value={globalSymbol || symbol} onChange={selectMarket} className="w-full" />
          </div>
        )}

        <nav className="shrink-0 space-y-0.5 px-2 py-2" aria-label="Research workspace">
          {MENU.map((item) => {
            const active = typeof window !== "undefined" ? (item.href === "/" ? window.location.pathname === "/" : window.location.pathname.startsWith(item.href)) : false;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} prefetch={true} className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-[10px] font-medium transition ${active ? "bg-white/[0.06] text-white/85" : "text-white/45 hover:bg-white/[0.03] hover:text-white/70"} ${collapsed ? "justify-center px-0" : ""}`} title={collapsed ? item.label : undefined}>
                <Icon size={14} className={active ? "text-amber-200/80" : "text-white/35"} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/7 px-2 py-2">
            <div className="mb-1 px-1 text-[8px] font-semibold uppercase tracking-[.14em] text-white/20">Watchlist</div>
            {selectedSymbols.length === 0 ? (
              <div className="rounded-md border border-dashed border-white/7 px-2 py-2 text-[9px] leading-4 text-white/20">
                Search a market above and add it to your watchlist from Market Memory.
              </div>
            ) : (
              <div className="space-y-0.5">
                {selectedSymbols.map((market) => {
                  const active = market === symbol;
                  return (
                    <div key={market} className={`group flex items-center rounded-md ${active ? "bg-white/[0.05]" : "hover:bg-white/[0.03]"}`}>
                      <button type="button" onClick={() => selectMarket(market)} className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-[10px] font-medium text-white/50 hover:text-white/80">
                        {market.replace(/USDT$/, "/USDT")}
                      </button>
                      {onWatchlistToggle && (
                        <button type="button" aria-label={`Remove ${market} from watchlist`} onClick={(event) => removeWatchlistMarket(event, market)} className="mr-1 hidden h-6 w-6 items-center justify-center rounded text-white/20 hover:bg-white/5 hover:text-white/60 group-hover:flex">
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="shrink-0 space-y-0.5 border-t border-white/7 px-2 py-2">
          <Link href="/favorites" prefetch={true} className={itemClass("/favorites")} title={collapsed ? "Favorites" : undefined}>
            <Star size={14} className="text-white/35" />
            {!collapsed && <span>Favorites</span>}
          </Link>
          <Link href="/settings" prefetch={true} className={itemClass("/settings")} title={collapsed ? "Account settings" : undefined}>
            <UserRound size={14} className="text-white/35" />
            {!collapsed && <span>Account settings</span>}
          </Link>
        </div>

        {owner && (
          <div className="shrink-0 border-y border-amber-300/10 px-2 py-2">
            <Link href="/admin" prefetch={true} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[10px] font-semibold text-amber-200/55 hover:bg-amber-300/[.05] hover:text-amber-100" title={collapsed ? "Admin Control" : undefined}>
              <ShieldCheck size={14} />
              {!collapsed && <><span>Admin Control</span><span className="ml-auto text-[7px] uppercase tracking-[.08em] text-amber-200/35">Owner</span></>}
            </Link>
          </div>
        )}

        <div className="shrink-0 border-t border-white/7 px-2 py-2.5">
          {!collapsed ? <div className="flex items-center gap-2 px-1 text-[9px] uppercase tracking-[.1em] text-white/20"><Activity size={12} /> Pattern engine v1</div> : <div className="flex justify-center"><Activity size={13} className="text-white/20" /></div>}
        </div>
      </div>
    </aside>
  );
}
