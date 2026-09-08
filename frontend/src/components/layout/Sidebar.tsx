"use client";

import { Activity, Bell, BarChart3, ChevronLeft, ChevronRight, FlaskConical, LayoutDashboard, ScanSearch, Star, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type WatchlistItem = { symbol: string; name: string };
const WATCHLIST: WatchlistItem[] = [
  { symbol: "BTCUSDT", name: "Bitcoin" },
  { symbol: "ETHUSDT", name: "Ethereum" },
  { symbol: "SOLUSDT", name: "Solana" },
];

type SidebarProps = { symbol: string; collapsed: boolean; onCollapsedChange: (value: boolean) => void; onSymbolSelect: (symbol: string) => void; selectedSymbols: string[]; onWatchlistToggle: (symbol: string) => void; };
type MenuItem = { label: string; href: string; icon: typeof LayoutDashboard; live?: boolean };
const MENU: MenuItem[] = [
  { label: "Market Memory", href: "/", icon: LayoutDashboard, live: true },
  { label: "Pattern Evidence", href: "/evidence", icon: BarChart3, live: true },
  { label: "Market Scanner", href: "/scanner", icon: ScanSearch, live: true },
  { label: "Pattern Alerts", href: "/alerts", icon: Bell },
  { label: "Replay Lab", href: "/replay", icon: Activity },
  { label: "Evaluation Lab", href: "/evaluation", icon: FlaskConical },
];

export default function Sidebar({ symbol, collapsed, onCollapsedChange, onSymbolSelect, selectedSymbols, onWatchlistToggle }: SidebarProps) {
  const pathname = usePathname();
  return (
    <aside className={`${collapsed ? "w-[52px]" : "w-[188px]"} hidden shrink-0 border-r border-white/7 bg-[#090d13] transition-[width] duration-200 lg:block`}>
      <div className="sticky top-12 flex h-[calc(100vh-48px)] flex-col">
        <div className="flex h-10 items-center border-b border-white/7 px-2">{!collapsed && <span className="px-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-white/25">Workspace</span>}<button type="button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => onCollapsedChange(!collapsed)} className="ml-auto flex h-7 w-7 items-center justify-center rounded-md border border-white/8 text-white/35 transition hover:bg-white/5 hover:text-white/75" title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}</button></div>
        <nav className="space-y-0.5 px-2 py-2" aria-label="Research workspace">
          {MENU.map((item) => { const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href); const Icon = item.icon; return item.live ? <Link key={item.href} href={item.href} className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-[10px] font-medium transition ${active ? "bg-white/[0.06] text-white/85" : "text-white/45 hover:bg-white/[0.03] hover:text-white/70"} ${collapsed ? "justify-center px-0" : ""}`} title={collapsed ? item.label : undefined}><Icon size={14} className={active ? "text-amber-200/80" : "text-white/35"} />{!collapsed && <span>{item.label}</span>}</Link> : <div key={item.href} className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-[10px] font-medium text-white/20 ${collapsed ? "justify-center px-0" : ""}`} title={collapsed ? `${item.label} · Coming soon` : undefined}><Icon size={14} className="text-white/15" />{!collapsed && <><span>{item.label}</span><span className="ml-auto text-[7px] uppercase tracking-[0.08em] text-white/15">Soon</span></>}</div>; })}
        </nav>
        <div className="px-2">{!collapsed && <div className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/20">Instruments</div>}<div className="space-y-0.5">{WATCHLIST.map((item) => { const active = item.symbol === symbol; const selected = selectedSymbols.includes(item.symbol); return <div key={item.symbol} className={`group flex items-center gap-1.5 rounded-md border px-1.5 py-2 transition ${active ? "border-white/9 bg-white/[0.055]" : "border-transparent hover:bg-white/[0.025]"} ${collapsed ? "justify-center" : ""}`}><button type="button" onClick={() => onSymbolSelect(item.symbol)} className={`min-w-0 flex-1 text-left ${collapsed ? "flex justify-center" : ""}`} title={collapsed ? `${item.name} (${item.symbol})` : undefined}><div className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-emerald-400" : "bg-white/15"}`} />{!collapsed && <span className="truncate text-[11px] font-medium text-white/70">{item.symbol.replace("USDT", "")}</span>}</div>{!collapsed && <div className="mt-0.5 pl-3 text-[9px] text-white/22">{item.name}</div>}</button>{!collapsed && <button type="button" aria-label={`${selected ? "Remove" : "Add"} ${item.symbol} ${selected ? "from" : "to"} watchlist`} onClick={() => onWatchlistToggle(item.symbol)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/20 transition hover:bg-white/5 hover:text-white/70">{selected ? <Star size={12} fill="currentColor" /> : <X size={12} />}</button>}</div>; })}</div></div>
        <div className="mt-auto border-t border-white/7 px-2 py-2.5">{!collapsed ? <div className="flex items-center gap-2 px-1 text-[9px] uppercase tracking-[0.1em] text-white/20"><Activity size={12} /> Pattern engine v1</div> : <div className="flex justify-center"><Activity size={13} className="text-white/20" /></div>}</div>
      </div>
    </aside>
  );
}
