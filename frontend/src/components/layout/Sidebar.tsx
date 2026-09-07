"use client";

import { Activity, ChevronLeft, ChevronRight, LayoutDashboard, Star, X } from "lucide-react";

type WatchlistItem = {
  symbol: string;
  name: string;
};

const WATCHLIST: WatchlistItem[] = [
  { symbol: "BTCUSDT", name: "Bitcoin" },
  { symbol: "ETHUSDT", name: "Ethereum" },
  { symbol: "SOLUSDT", name: "Solana" },
];

type SidebarProps = {
  symbol: string;
  collapsed: boolean;
  onCollapsedChange: (value: boolean) => void;
  onSymbolSelect: (symbol: string) => void;
  selectedSymbols: string[];
  onWatchlistToggle: (symbol: string) => void;
};

export default function Sidebar({
  symbol,
  collapsed,
  onCollapsedChange,
  onSymbolSelect,
  selectedSymbols,
  onWatchlistToggle,
}: SidebarProps) {
  return (
    <aside className={`${collapsed ? "w-[68px]" : "w-[224px]"} hidden shrink-0 border-r border-white/7 bg-[#090d13] transition-[width] duration-200 lg:block`}>
      <div className="sticky top-0 flex h-[calc(100vh-64px)] flex-col">
        <div className="flex items-center justify-between border-b border-white/7 px-3 py-3">
          {!collapsed && <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">Workspace</span>}
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => onCollapsedChange(!collapsed)}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-white/7 text-white/35 transition hover:bg-white/5 hover:text-white/70"
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        <nav className="px-2 py-3">
          <div className={`flex items-center gap-3 rounded-lg bg-white/[0.05] px-3 py-2.5 text-xs font-medium text-white ${collapsed ? "justify-center px-0" : ""}`}>
            <LayoutDashboard size={16} className="text-white/60" />
            {!collapsed && "Market Memory"}
          </div>
        </nav>

        <div className="px-2 pt-3">
          <div className={`mb-2 flex items-center gap-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/25 ${collapsed ? "justify-center px-0" : ""}`}>
            <Star size={13} />
            {!collapsed && "Watchlist"}
          </div>

          <div className="space-y-1">
            {WATCHLIST.map((item) => {
              const active = item.symbol === symbol;
              const selected = selectedSymbols.includes(item.symbol);

              return (
                <div key={item.symbol} className={`group flex items-center gap-2 rounded-lg border px-2 py-2 transition ${active ? "border-white/10 bg-white/[0.055]" : "border-transparent hover:bg-white/[0.025]"} ${collapsed ? "justify-center" : ""}`}>
                  <button
                    type="button"
                    onClick={() => onSymbolSelect(item.symbol)}
                    className={`min-w-0 flex-1 text-left ${collapsed ? "flex justify-center" : ""}`}
                    title={collapsed ? `${item.name} (${item.symbol})` : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-white/15"}`} />
                      {!collapsed && <span className="text-xs font-medium text-white/75">{item.symbol.replace("USDT", "")}</span>}
                    </div>
                    {!collapsed && <div className="mt-0.5 pl-3.5 text-[10px] text-white/25">{item.name}</div>}
                  </button>

                  {!collapsed && (
                    <button
                      type="button"
                      aria-label={`${selected ? "Remove" : "Add"} ${item.symbol} ${selected ? "from" : "to"} watchlist`}
                      onClick={() => onWatchlistToggle(item.symbol)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/25 transition hover:bg-white/5 hover:text-white/70"
                    >
                      {selected ? <Star size={13} fill="currentColor" /> : <X size={13} />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-auto border-t border-white/7 p-3">
          {!collapsed && (
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-white/25">
              <Activity size={13} /> Pattern engine v1
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
