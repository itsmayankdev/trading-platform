"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3, CheckCircle2, Info, Target } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import type { SearchResponse } from "@/components/pattern-search/types";

const DEFAULT_TIMEFRAME = "5m";
const DEFAULT_PATTERN_LENGTH = 45;
const DEFAULT_TOP_K = 50;

function pct(value: number) { return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`; }
function score(value: number) { return `${value.toFixed(2)}%`; }

export default function EvidencePage() {
  const searchParams = useSearchParams();
  const symbol = (searchParams.get("symbol") || "ETHUSDT").toUpperCase();
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    async function load() {
      try {
        const params = new URLSearchParams({ symbol, timeframe: DEFAULT_TIMEFRAME, pattern_length: String(DEFAULT_PATTERN_LENGTH), top_k: String(DEFAULT_TOP_K) });
        const response = await fetch(`/api/backend/api/v1/pattern-search?${params.toString()}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`Could not load historical evidence (${response.status}).`);
        setData((await response.json()) as SearchResponse);
      } catch (caught: unknown) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load historical evidence.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [symbol]);

  const summary = useMemo(() => {
    if (!data) return null;
    const byHorizon = new Map(data.statistics.map((item) => [item.horizon_candles, item]));
    const long = byHorizon.get(60);
    const median60 = long?.median_return ?? 0;
    const direction = median60 >= 0 ? "UP" : "DOWN";
    const agreement = median60 >= 0 ? (long?.win_rate ?? 0) : 1 - (long?.win_rate ?? 0);
    return { byHorizon, long, median60, direction, agreement, top: data.matches[0]?.similarity_score ?? 0, sample: long?.sample_size ?? data.matches.length };
  }, [data]);

  return (
    <main className="min-h-screen bg-[#070a0f] text-white">
      <header className="sticky top-0 z-40 h-12 border-b border-white/8 bg-[#070a0f]"><div className="flex h-full items-center px-4 sm:px-5"><Link href="/" className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black"><BarChart3 size={14} /></div><span className="text-sm font-semibold tracking-[0.12em]">MARKET MEMORY</span></Link><div className="ml-4 border-l border-white/8 pl-4 text-[10px] uppercase tracking-[0.14em] text-white/35">Pattern Evidence</div></div></header>
      <div className="flex"><Sidebar symbol={symbol} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} onSymbolSelect={(next) => { window.location.href = `/evidence?symbol=${next}`; }} selectedSymbols={[symbol]} onWatchlistToggle={() => {}} /><div className="min-w-0 flex-1"><div className="mx-auto max-w-[1450px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-5"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/65">Research tool</div><h1 className="mt-1.5 text-2xl font-semibold tracking-tight">Pattern Evidence</h1><p className="mt-1.5 text-sm text-white/40">Compare today’s pattern with similar moments from the past.</p></div>

        {loading && <div className="space-y-3"><div className="panel h-28 animate-pulse" /><div className="panel h-56 animate-pulse" /></div>}
        {error && <div className="rounded-lg border border-red-400/15 bg-red-400/5 px-4 py-3 text-sm text-red-300">{error}</div>}

        {data && summary && <div className="space-y-4">
          <section className="panel border-amber-200/10 px-5 py-4"><div className="flex items-center gap-3"><div className="rounded-md bg-amber-200/10 p-2 text-amber-200"><Info size={17} /></div><div><h2 className="text-base font-semibold">What does this tell me?</h2><p className="mt-0.5 text-xs text-white/40">It finds similar patterns in history and shows what happened after them. Use it as a quick evidence check before making a decision.</p></div></div></section>

          <section className="grid gap-3 lg:grid-cols-3">
            <div className="panel p-4"><div className="text-xs font-semibold text-white/50">Pattern match</div><div className="mt-2 font-mono text-3xl font-semibold">{score(summary.top)}</div><p className="mt-1 text-xs text-white/35">How closely the best past pattern matches today.</p></div>
            <div className="panel p-4"><div className="text-xs font-semibold text-white/50">Typical next move</div><div className={`mt-2 flex items-center gap-1.5 text-2xl font-semibold ${summary.median60 >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{summary.median60 >= 0 ? <ArrowUpRight size={23} /> : <ArrowDownRight size={23} />} {summary.direction}</div><p className="mt-1 text-xs text-white/35">The middle result across {summary.sample} past matches after 60 candles.</p></div>
            <div className="panel p-4"><div className="text-xs font-semibold text-white/50">How consistent?</div><div className="mt-2 font-mono text-3xl font-semibold">{(summary.agreement * 100).toFixed(0)}%</div><p className="mt-1 text-xs text-white/35">How often past matches finished in the same direction.</p></div>
          </section>

          <section className="panel overflow-hidden"><div className="border-b border-white/8 px-5 py-4"><h2 className="text-base font-semibold">What happened after similar patterns?</h2><p className="mt-0.5 text-xs text-white/35">See whether the historical move appeared quickly or lasted.</p></div><div className="grid md:grid-cols-4">{[5, 15, 30, 60].map((horizon, index) => { const item = summary.byHorizon.get(horizon); const median = item?.median_return ?? 0; const positive = median >= 0; return <div key={horizon} className={`p-4 ${index < 3 ? "border-b border-white/7 md:border-b-0 md:border-r" : ""}`}><div className="text-xs font-semibold text-white/45">After {horizon} candles</div><div className={`mt-2 text-xl font-mono font-semibold ${positive ? "text-emerald-300" : "text-rose-300"}`}>{pct(median)}</div><div className="mt-3 flex justify-between text-xs"><span className="text-white/30">Finished higher</span><span className="font-mono text-white/55">{((item?.win_rate ?? 0) * 100).toFixed(0)}%</span></div><div className="mt-1 flex justify-between text-xs"><span className="text-white/30">Average worst dip</span><span className="font-mono text-rose-300/65">{pct(item?.mean_mae ?? 0)}</span></div></div>; })}</div></section>

          <section className="panel p-4"><div className="flex items-center gap-2"><Target size={17} className="text-amber-200/75" /><h2 className="text-base font-semibold">How to use it</h2></div><div className="mt-3 grid gap-3 md:grid-cols-3"><div className="flex gap-2.5"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-300" /><p className="text-xs leading-5 text-white/45"><strong className="text-white/70">Strong match + clear history:</strong> useful supporting evidence.</p></div><div className="flex gap-2.5"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-300" /><p className="text-xs leading-5 text-white/45"><strong className="text-white/70">Mixed history:</strong> the pattern gives little clear direction.</p></div><div className="flex gap-2.5"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-300" /><p className="text-xs leading-5 text-white/45"><strong className="text-white/70">Always:</strong> combine this evidence with your setup and risk plan.</p></div></div></section>
        </div>}
      </div></div></div>
    </main>
  );
}
