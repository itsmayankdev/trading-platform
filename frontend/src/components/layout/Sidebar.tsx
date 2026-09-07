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

export default function Sidebar({ symbol, collapsed, onCollapsedChange, onSymbolSelect, selectedSymbols, onWatchlistToggle }: SidebarProps) {
  return (
    <aside className={`${collapsed ? "w-[52px]" : "w-[188px]"} hidden shrink-0 border-r border-white/7 bg-[#090d13] transition-[width] duration-200 lg:block`}>
      <div className="sticky top-12 flex h-[calc(100vh-48px)] flex-col">
        <div className="flex h-10 items-center border-b border-white/7 px-2">
          {!collapsed && <span className="px-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-white/25">Watchlist</span>}
          <button
            type="button"
            aria-label={collapsed ? "Expand watchlist sidebar" : "Collapse watchlist sidebar"}
            onClick={() => onCollapsedChange(!collapsed)}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-md border border-white/8 text-white/35 transition hover:bg-white/5 hover:text-white/75"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        <nav className="px-2 py-2">
          <div className={`flex items-center gap-2 rounded-md bg-white/[0.05] px-2.5 py-2 text-[11px] font-medium text-white/80 ${collapsed ? "justify-center px-0" : ""}`} title={collapsed ? "Market Memory" : undefined}>
            <LayoutDashboard size={14} className="text-white/50" />
            {!collapsed && "Market Memory"}
          </div>
        </nav>

        <div className="px-2">
          {!collapsed && <div className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/20">Instruments</div>}
          <div className="space-y-0.5">
            {WATCHLIST.map((item) => {
              const active = item.symbol === symbol;
              const selected = selectedSymbols.includes(item.symbol);
              return (
                <div key={item.symbol} className={`group flex items-center gap-1.5 rounded-md border px-1.5 py-2 transition ${active ? "border-white/9 bg-white/[0.055]" : "border-transparent hover:bg-white/[0.025]"} ${collapsed ? "justify-center" : ""}`}>
                  <button type="button" onClick={() => onSymbolSelect(item.symbol)} className={`min-w-0 flex-1 text-left ${collapsed ? "flex justify-center" : ""}`} title={collapsed ? `${item.name} (${item.symbol})` : undefined}>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-emerald-400" : "bg-white/15"}`} />
                      {!collapsed && <span className="truncate text-[11px] font-medium text-white/70">{item.symbol.replace("USDT", "")}</span>}
                    </div>
                    {!collapsed && <div className="mt-0.5 pl-3 text-[9px] text-white/22">{item.name}</div>}
                  </button>
                  {!collapsed && <button type="button" aria-label={`${selected ? "Remove" : "Add"} ${item.symbol} ${selected ? "from" : "to"} watchlist`} onClick={() => onWatchlistToggle(item.symbol)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/20 transition hover:bg-white/5 hover:text-white/70">{selected ? <Star size={12} fill="currentColor" /> : <X size={12} />}</button>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-auto border-t border-white/7 px-2 py-2.5">
          {!collapsed ? <div className="flex items-center gap-2 px-1 text-[9px] uppercase tracking-[0.1em] text-white/20"><Activity size={12} /> Pattern engine v1</div> : <div className="flex justify-center"><Activity size={13} className="text-white/20" /></div>}
        </div>
      </div>
    </aside>
  );
}
