"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Bell, Check, ExternalLink, Pin, Search, Star, Trash2, WandSparkles } from "lucide-react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import { FAVORITES_CHANGED_EVENT, readFavoriteMarketPatterns, readFavoritePatterns, removeFavoritePattern, toggleFavoriteMarketPattern, type FavoritePattern } from "@/lib/favorites";
import { MARKET_PATTERNS, type MarketPatternDefinition } from "@/lib/marketPatterns";

type FavoriteTab = "pinned" | "indicators" | "patterns";
const TABS: { id: FavoriteTab; label: string; icon: typeof Pin }[] = [
  { id: "pinned", label: "Pinned Charts", icon: Pin },
  { id: "indicators", label: "Favorite Indicators", icon: BarChart3 },
  { id: "patterns", label: "Favorite Market Patterns", icon: WandSparkles },
];

function formatDate(value: string) { return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(value)); }
function labelForFavorite(favorite: FavoritePattern) { return favorite.type === "current" ? "Current market window" : `Historical match #${(favorite.matchIndex ?? 0) + 1}`; }

function PatternCard({ pattern, favorite, onToggle }: { pattern: MarketPatternDefinition; favorite: boolean; onToggle: () => void }) {
  return <article className="rounded-lg border border-white/8 bg-[#0a0e15] p-4 transition hover:border-white/12">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{pattern.name}</h3><span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${pattern.direction === "bullish" ? "bg-emerald-300/[0.08] text-emerald-200/75" : pattern.direction === "bearish" ? "bg-rose-300/[0.08] text-rose-200/75" : "bg-white/[0.05] text-white/35"}`}>{pattern.direction}</span><span className="rounded-full border border-white/7 px-2 py-0.5 text-[9px] text-white/25">{pattern.category}</span></div>
        <p className="mt-2 text-xs leading-5 text-white/45">{pattern.description}</p>
      </div>
      <button type="button" onClick={onToggle} aria-label={`${favorite ? "Remove" : "Add"} ${pattern.name} favorite`} title={favorite ? "Remove favorite" : "Add favorite"} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition ${favorite ? "border-amber-200/25 bg-amber-200/[0.08] text-amber-200" : "border-white/8 text-white/20 hover:text-white/50"}`}><Star size={14} fill={favorite ? "currentColor" : "none"} /></button>
    </div>
    <div className="mt-4 rounded-md border border-white/6 bg-white/[0.015] p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25">What to look for</div><div className="mt-1 text-[11px] leading-5 text-white/45">{pattern.whatToLookFor}</div></div>
    <div className="mt-3 flex items-center justify-between"><span className={`text-[10px] ${pattern.detectionStatus === "ready" ? "text-emerald-200/55" : "text-white/25"}`}>{pattern.detectionStatus === "ready" ? "Detection available" : "Detection coming next"}</span><span className="font-mono text-[9px] text-white/15">{pattern.id}</span></div>
  </article>;
}

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoritePattern[]>([]);
  const [favoritePatternIds, setFavoritePatternIds] = useState<string[]>([]);
  const [tab, setTab] = useState<FavoriteTab>("pinned");
  const [collapsed, setCollapsed] = useState(false);
  const [patternQuery, setPatternQuery] = useState("");
  const [patternFilter, setPatternFilter] = useState<"all" | "favorite" | "chart" | "candlestick">("all");

  useEffect(() => { const refresh = () => { setFavorites(readFavoritePatterns()); setFavoritePatternIds(readFavoriteMarketPatterns()); }; refresh(); window.addEventListener(FAVORITES_CHANGED_EVENT, refresh); return () => window.removeEventListener(FAVORITES_CHANGED_EVENT, refresh); }, []);

  const filteredPatterns = useMemo(() => {
    const query = patternQuery.trim().toLocaleLowerCase();
    return MARKET_PATTERNS.filter((pattern) => {
      if (patternFilter === "favorite" && !favoritePatternIds.includes(pattern.id)) return false;
      if (patternFilter === "chart" && pattern.category !== "chart") return false;
      if (patternFilter === "candlestick" && pattern.category !== "candlestick") return false;
      return !query || `${pattern.name} ${pattern.description} ${pattern.whatToLookFor}`.toLocaleLowerCase().includes(query);
    });
  }, [patternQuery, patternFilter, favoritePatternIds]);

  return <main className="min-h-screen bg-[#070a0f] text-white"><header className="sticky top-0 z-40 h-12 border-b border-white/8 bg-[#070a0f]"><div className="flex h-full items-center px-4 sm:px-5"><Link href="/" className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black"><Star size={14} fill="currentColor" /></div><span className="text-sm font-semibold tracking-[0.12em]">MARKET MEMORY</span></Link><div className="ml-4 border-l border-white/8 pl-4 text-[10px] uppercase tracking-[0.14em] text-white/30">Favorites</div></div></header>
    <div className="flex"><Sidebar symbol="ETHUSDT" collapsed={collapsed} onCollapsedChange={setCollapsed} onSymbolSelect={() => {}} selectedSymbols={[]} onWatchlistToggle={() => {}} /><div className="min-w-0 flex-1"><div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-7 lg:px-10">
      <div className="mb-5"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/65">Workspace library</div><h1 className="mt-1 text-2xl font-semibold tracking-tight">Favorites</h1><p className="mt-1 text-sm text-white/40">Save chart windows and reusable pattern definitions separately.</p></div>
      <nav className="mb-5 flex overflow-x-auto rounded-lg border border-white/8 bg-[#0a0e15] p-1" aria-label="Favorites categories">{TABS.map((item) => { const Icon = item.icon; const active = tab === item.id; const count = item.id === "pinned" ? favorites.length : item.id === "patterns" ? favoritePatternIds.length : 0; return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`flex min-w-max items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold transition ${active ? "bg-white/[0.08] text-white" : "text-white/35 hover:bg-white/[0.035] hover:text-white/65"}`}><Icon size={13} />{item.label}{(item.id !== "indicators" || count > 0) && <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-white/35">{count}</span>}</button>; })}</nav>

      {tab === "pinned" && <section><div className="mb-3 flex items-end justify-between"><div><h2 className="text-sm font-semibold">Pinned charts</h2><p className="mt-1 text-[11px] text-white/30">Named chart windows from Market Memory.</p></div><Link href="/" className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-[10px] font-semibold text-white/55 hover:bg-white/[0.04] hover:text-white"><Pin size={11} /> Pin from dashboard</Link></div>{favorites.length === 0 ? <div className="rounded-lg border border-dashed border-white/10 bg-[#0a0e15] px-6 py-16 text-center"><Pin size={22} className="mx-auto text-white/15" /><h3 className="mt-3 text-sm font-semibold">No pinned charts yet</h3><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-white/30">Open Market Memory, find a chart pattern you want to keep, then use Pin and give it a unique name.</p></div> : <div className="grid gap-3 md:grid-cols-2">{favorites.map((favorite) => <article key={favorite.id} className="rounded-lg border border-white/8 bg-[#0a0e15] p-4 transition hover:border-white/12"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><Star size={13} className="shrink-0 text-amber-200/65" fill="currentColor" /><h3 className="truncate text-sm font-semibold">{favorite.name}</h3></div><div className="mt-1 text-[10px] text-white/30">{favorite.symbol.replace("USDT", "/USDT")} · {favorite.timeframe} · {favorite.patternLength} candles</div></div><button type="button" onClick={() => removeFavoritePattern(favorite.id)} aria-label={`Remove ${favorite.name}`} title="Remove favorite" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/8 text-white/25 hover:border-rose-300/20 hover:text-rose-300"><Trash2 size={12} /></button></div><div className="mt-4 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-md border border-white/6 bg-white/[0.015] px-3 py-2"><div className="text-white/25">Saved view</div><div className="mt-0.5 text-white/55">{labelForFavorite(favorite)}</div></div><div className="rounded-md border border-white/6 bg-white/[0.015] px-3 py-2"><div className="text-white/25">Pattern window</div><div className="mt-0.5 font-mono text-white/55">{formatDate(favorite.startTime)}</div></div></div>{favorite.similarityScore != null && <div className="mt-2 text-[10px] text-white/25">Similarity at save: <span className="font-mono text-white/55">{favorite.similarityScore.toFixed(2)}%</span></div>}<div className="mt-4 flex gap-2 border-t border-white/6 pt-3"><Link href={`/?favorite=${encodeURIComponent(favorite.id)}`} className="flex items-center gap-1.5 rounded-md border border-white/9 px-3 py-2 text-[10px] font-semibold text-white/55 hover:bg-white/[0.04] hover:text-white"><ExternalLink size={11} /> Open chart</Link><Link href={`/alerts?favorite=${encodeURIComponent(favorite.id)}`} className="flex items-center gap-1.5 rounded-md border border-amber-200/15 bg-amber-200/[0.035] px-3 py-2 text-[10px] font-semibold text-amber-100/70 hover:bg-amber-200/[0.07]"><Bell size={11} /> Use in alert</Link></div></article>)}</div>}</section>}

      {tab === "indicators" && <section className="rounded-lg border border-dashed border-white/10 bg-[#0a0e15] px-6 py-16 text-center"><BarChart3 size={22} className="mx-auto text-white/15" /><h2 className="mt-3 text-sm font-semibold">Favorite indicators</h2><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-white/30">Saved indicator configurations will live here, separate from chart windows and market-pattern definitions.</p></section>}

      {tab === "patterns" && <section><div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-sm font-semibold">Favorite market patterns</h2><p className="mt-1 max-w-2xl text-[11px] leading-5 text-white/30">A reusable catalog of chart and candlestick structures. Star a pattern to make it available as a favorite in future scanners and alerts.</p></div><div className="flex items-center gap-2 text-[10px] text-white/30"><Check size={13} className="text-emerald-200/55" /> {favoritePatternIds.length} saved</div></div>
        <div className="mb-4 grid gap-2 rounded-lg border border-white/8 bg-[#0a0e15] p-3 md:grid-cols-[1fr_auto_auto_auto]"><label className="relative block"><Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/20" /><input value={patternQuery} onChange={(e) => setPatternQuery(e.target.value)} placeholder="Search patterns…" className="h-9 w-full rounded-md border border-white/8 bg-[#080c12] pl-9 pr-3 text-xs text-white outline-none placeholder:text-white/20 focus:border-amber-200/25" /></label><button type="button" onClick={() => setPatternFilter("all")} className={`h-9 rounded-md border px-3 text-[10px] font-semibold ${patternFilter === "all" ? "border-white/15 bg-white/[0.06] text-white" : "border-white/8 text-white/35"}`}>All</button><button type="button" onClick={() => setPatternFilter("chart")} className={`h-9 rounded-md border px-3 text-[10px] font-semibold ${patternFilter === "chart" ? "border-white/15 bg-white/[0.06] text-white" : "border-white/8 text-white/35"}`}>Chart</button><button type="button" onClick={() => setPatternFilter("candlestick")} className={`h-9 rounded-md border px-3 text-[10px] font-semibold ${patternFilter === "candlestick" ? "border-white/15 bg-white/[0.06] text-white" : "border-white/8 text-white/35"}`}>Candlestick</button><button type="button" onClick={() => setPatternFilter("favorite")} className={`h-9 rounded-md border px-3 text-[10px] font-semibold md:col-start-2 ${patternFilter === "favorite" ? "border-amber-200/20 bg-amber-200/[0.05] text-amber-100" : "border-white/8 text-white/35"}`}>Favorites only</button></div>
        <div className="grid gap-3 md:grid-cols-2">{filteredPatterns.map((pattern) => <PatternCard key={pattern.id} pattern={pattern} favorite={favoritePatternIds.includes(pattern.id)} onToggle={() => toggleFavoriteMarketPattern(pattern)} />)}</div>
        {filteredPatterns.length === 0 && <div className="rounded-lg border border-dashed border-white/10 bg-[#0a0e15] px-6 py-14 text-center text-xs text-white/30">No patterns match this filter.</div>}
      </section>}
    </div></div></div></main>;
}
