"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Activity, BarChart3, Database, ShieldCheck, Sparkles } from "lucide-react";
import MarketChart from "@/components/MarketChart";
import Sidebar from "@/components/layout/Sidebar";
import HistoricalPatternChart from "@/components/pattern-search/HistoricalPatternChart";
import HistoricalMatches from "@/components/pattern-search/HistoricalMatches";
import OutcomeStatistics from "@/components/pattern-search/OutcomeStatistics";
import SearchControls from "@/components/pattern-search/SearchControls";
import type { SearchResponse } from "@/components/pattern-search/types";

const WATCHLIST = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

function SummaryCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) {
  return <div className="panel min-w-0 px-4 py-3.5"><div className="flex items-center justify-between"><span className="text-[9px] font-medium uppercase tracking-[0.16em] text-white/28">{label}</span><span className="text-white/25">{icon}</span></div><div className="mt-2.5 truncate text-lg font-semibold tracking-tight">{value}</div><div className="mt-0.5 truncate text-[10px] text-white/28">{detail}</div></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(value));
}

export default function Home() {
  const [symbol, setSymbol] = useState("ETHUSDT");
  const [timeframe, setTimeframe] = useState("5m");
  const [patternLength, setPatternLength] = useState("45");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>(WATCHLIST);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("market-memory-watchlist");
      if (saved) {
        const parsed = JSON.parse(saved) as unknown;
        if (Array.isArray(parsed)) setWatchlist(parsed.filter((item): item is string => WATCHLIST.includes(item)));
      }
    } catch { /* Keep defaults. */ }
  }, []);

  function selectSymbol(value: string) { setSymbol(value); setData(null); setError(""); }

  function toggleWatchlist(value: string) {
    setWatchlist((current) => {
      const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
      try { window.localStorage.setItem("market-memory-watchlist", JSON.stringify(next)); } catch { /* Optional persistence. */ }
      return next;
    });
  }

  async function searchPatterns() {
    setLoading(true); setError(""); setData(null);
    try {
      const params = new URLSearchParams({ symbol, timeframe, pattern_length: patternLength, top_k: "10" });
      const response = await fetch(`/api/backend/api/v1/pattern-search?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        let message = `API returned ${response.status}`;
        try { const body = await response.json(); if (body?.detail) message = body.detail; } catch { /* Generic error. */ }
        setError(message); return;
      }
      setData((await response.json()) as SearchResponse);
    } catch { setError("Could not reach the Pattern Engine. Check that FastAPI is running."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void searchPatterns(), 0);
    return () => window.clearTimeout(timer);
    // Initial search only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentPattern = data?.current_pattern;

  return (
    <main className="min-h-screen bg-[#070a0f] text-white">
      <header className="sticky top-0 z-30 h-16 border-b border-white/7 bg-[#070a0f]/95 backdrop-blur-xl"><div className="flex h-full items-center justify-between px-4 sm:px-6"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white text-black"><Activity size={18} /></div><div><div className="text-sm font-semibold tracking-[0.08em]">MARKET MEMORY</div><div className="hidden text-[10px] uppercase tracking-[0.14em] text-white/30 sm:block">Historical pattern intelligence</div></div></div><div className="flex items-center gap-3"><div className="hidden items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-white/25 md:flex"><ShieldCheck size={14} /> Server-side analysis</div><div className="flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/5 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Engine online</div></div></div></header>

      <div className="flex"><Sidebar symbol={symbol} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} onSymbolSelect={selectSymbol} selectedSymbols={watchlist} onWatchlistToggle={toggleWatchlist} />
        <div className="min-w-0 flex-1"><div className="mx-auto max-w-[1700px] px-4 py-5 sm:px-6 lg:px-7 lg:py-7">
          <section className="mb-5 flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between"><div><div className="eyebrow flex items-center gap-2"><Sparkles size={12} /> Market Memory Engine</div><h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Historical pattern workstation</h1><p className="mt-2 max-w-2xl text-xs leading-5 text-white/35">Search the current market structure, inspect the closest historical windows, and compare what followed.</p></div><div className="hidden rounded-lg border border-white/7 bg-white/[0.02] px-3 py-2 text-[10px] uppercase tracking-[0.13em] text-white/30 xl:block">Research terminal · V1</div></section>

          <SearchControls symbol={symbol} timeframe={timeframe} patternLength={patternLength} loading={loading} onSymbolChange={selectSymbol} onTimeframeChange={(value) => { setTimeframe(value); setData(null); setError(""); }} onPatternLengthChange={(value) => { setPatternLength(value); setData(null); setError(""); }} onSearch={() => void searchPatterns()} />
          {error && <div className="mt-4 rounded-lg border border-red-400/15 bg-red-400/5 px-4 py-3 text-xs text-red-300">{error}</div>}
          {loading && !data && <section className="mt-4 grid gap-3 md:grid-cols-4">{[1,2,3,4].map((item) => <div key={item} className="panel h-24 animate-pulse bg-white/[0.02]" />)}</section>}

          {data && <div className="mt-4 space-y-4"><section className="grid grid-cols-2 gap-3 xl:grid-cols-4"><SummaryCard label="Market" value={data.symbol.replace("USDT", "/USDT")} detail={`${data.timeframe} timeframe`} icon={<BarChart3 size={15} />} /><SummaryCard label="Pattern" value={`${data.pattern_length} candles`} detail={data.algorithm_version} icon={<Activity size={15} />} /><SummaryCard label="Matches" value={String(data.matches.length)} detail="independent historical windows" icon={<Database size={15} />} /><SummaryCard label="Feature set" value={data.feature_version} detail="server-side computation" icon={<ShieldCheck size={15} />} /></section>

            <section className="grid gap-4 2xl:grid-cols-2"><section className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-white/8 px-4 py-3.5"><div><div className="eyebrow">Current market</div><h2 className="mt-1 text-sm font-semibold">{data.symbol.replace("USDT", "/USDT")} <span className="text-white/25">·</span> {data.timeframe}</h2>{currentPattern && <p className="mt-1 text-[10px] text-white/28">Pattern {formatDate(currentPattern.start_time)} → {formatDate(currentPattern.end_time)} UTC</p>}</div><div className="rounded-md border border-emerald-400/12 bg-emerald-400/[0.035] px-2.5 py-1.5 text-[9px] uppercase tracking-[0.12em] text-emerald-400/70"><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />Live</div></div><MarketChart symbol={data.symbol} timeframe={data.timeframe} limit={Math.max(100, data.pattern_length + 35)} /></section>
              <HistoricalPatternChart key={`${data.symbol}-${data.timeframe}-${data.pattern_length}`} symbol={data.symbol} timeframe={data.timeframe} patternLength={data.pattern_length} matches={data.matches} />
            </section>

            <HistoricalMatches matches={data.matches} /><OutcomeStatistics statistics={data.statistics} />
            <footer className="flex flex-col gap-2 border-t border-white/6 py-4 text-[9px] uppercase tracking-[0.12em] text-white/20 sm:flex-row sm:items-center sm:justify-between"><span>Algorithm {data.algorithm_version} · Features {data.feature_version}</span><span>Historical outcomes do not guarantee future performance.</span></footer>
          </div>}
        </div></div>
    </main>
  );
}
