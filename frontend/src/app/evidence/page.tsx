"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3, Database, Gauge, ShieldCheck } from "lucide-react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import type { SearchResponse } from "@/components/pattern-search/types";

const DEFAULT_SYMBOL = "ETHUSDT";
const DEFAULT_TIMEFRAME = "5m";
const DEFAULT_PATTERN_LENGTH = 45;
const DEFAULT_TOP_K = 50;

function pct(value: number) { return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`; }
function score(value: number) { return `${value.toFixed(2)}%`; }

export default function EvidencePage() {
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const params = new URLSearchParams({ symbol: DEFAULT_SYMBOL, timeframe: DEFAULT_TIMEFRAME, pattern_length: String(DEFAULT_PATTERN_LENGTH), top_k: String(DEFAULT_TOP_K) });
        const response = await fetch(`/api/backend/api/v1/pattern-search?${params.toString()}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`Pattern Engine returned ${response.status}`);
        setData((await response.json()) as SearchResponse);
      } catch (caught: unknown) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load evidence.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  const evidence = useMemo(() => {
    if (!data) return null;
    const byHorizon = new Map(data.statistics.map((item) => [item.horizon_candles, item]));
    const plus15 = byHorizon.get(15);
    const plus60 = byHorizon.get(60);
    const median60 = plus60?.median_return ?? 0;
    const agreement = plus60 ? (median60 >= 0 ? plus60.win_rate : 1 - plus60.win_rate) : 0;
    const topSimilarity = data.matches[0]?.similarity_score ?? 0;
    const sample = plus60?.sample_size ?? data.matches.length;
    const dispersion = plus60 ? Math.abs(plus60.mean_return - plus60.median_return) : 0;
    const evidenceStrength = Math.max(0, Math.min(100, topSimilarity * 0.45 + agreement * 100 * 0.35 + Math.min(sample, 50) / 50 * 20));
    return { byHorizon, plus15, plus60, median60, agreement, topSimilarity, sample, dispersion, evidenceStrength };
  }, [data]);

  return (
    <main className="min-h-screen bg-[#070a0f] text-white">
      <header className="sticky top-0 z-40 h-12 border-b border-white/8 bg-[#070a0f]"><div className="flex h-full items-center px-4 sm:px-5"><Link href="/" className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black"><BarChart3 size={15} /></div><span className="text-xs font-semibold tracking-[0.12em]">MARKET MEMORY</span></Link><div className="ml-4 border-l border-white/8 pl-4 text-[9px] uppercase tracking-[0.14em] text-white/30">Pattern Evidence</div></div></header>
      <div className="flex"><Sidebar symbol={DEFAULT_SYMBOL} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} onSymbolSelect={() => {}} selectedSymbols={[DEFAULT_SYMBOL]} onWatchlistToggle={() => {}} /><div className="min-w-0 flex-1"><div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-5"><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200/60">Research view</div><h1 className="mt-1 text-2xl font-semibold tracking-tight">Pattern Evidence</h1><p className="mt-1 max-w-2xl text-xs leading-5 text-white/35">A deeper evidence profile for the current market pattern. Similarity is a historical match score, not a probability or forecast.</p></div>
        {loading && <div className="grid gap-3 md:grid-cols-3"><div className="panel h-28 animate-pulse" /><div className="panel h-28 animate-pulse" /><div className="panel h-28 animate-pulse" /></div>}
        {error && <div className="rounded-md border border-red-400/15 bg-red-400/5 px-3 py-2 text-xs text-red-300">{error}</div>}
        {data && evidence && <div className="space-y-3">
          <section className="grid gap-3 md:grid-cols-3">
            <div className="panel p-4"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30"><Gauge size={13} /> Top match</div><div className="mt-3 font-mono text-2xl font-semibold">{score(evidence.topSimilarity)}</div><div className="mt-1 text-[10px] text-white/25">Best historical similarity</div></div>
            <div className="panel p-4"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30"><Database size={13} /> Evidence sample</div><div className="mt-3 font-mono text-2xl font-semibold">{evidence.sample}</div><div className="mt-1 text-[10px] text-white/25">Historical outcomes available at +60</div></div>
            <div className="panel p-4"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30"><ShieldCheck size={13} /> Evidence strength</div><div className="mt-3 font-mono text-2xl font-semibold">{evidence.evidenceStrength.toFixed(0)}<span className="text-sm text-white/25">/100</span></div><div className="mt-1 text-[10px] text-white/25">Research quality composite, not trade probability</div></div>
          </section>

          <section className="panel overflow-hidden"><div className="border-b border-white/7 px-4 py-3"><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Historical outcome profile</div><div className="mt-0.5 text-[10px] text-white/20">{data.symbol} · {data.timeframe} · {data.pattern_length} candles · {data.matches.length} ranked matches</div></div><div className="grid md:grid-cols-4">
            {[5, 15, 30, 60].map((horizon) => { const item = evidence.byHorizon.get(horizon); const positive = (item?.median_return ?? 0) >= 0; return <div key={horizon} className="border-b border-white/6 p-4 md:border-b-0 md:border-r last:md:border-r-0"><div className="text-[9px] uppercase tracking-[0.12em] text-white/25">+{horizon} candles</div><div className={`mt-2 flex items-center gap-1.5 font-mono text-lg font-semibold ${positive ? "text-emerald-300" : "text-rose-300"}`}>{positive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}{pct(item?.median_return ?? 0)}</div><div className="mt-2 space-y-1 text-[9px] text-white/30"><div className="flex justify-between"><span>Win rate</span><span className="font-mono text-white/50">{((item?.win_rate ?? 0) * 100).toFixed(1)}%</span></div><div className="flex justify-between"><span>Mean</span><span className="font-mono text-white/50">{pct(item?.mean_return ?? 0)}</span></div><div className="flex justify-between"><span>MAE</span><span className="font-mono text-white/50">{pct(item?.mean_mae ?? 0)}</span></div></div></div>; })}
          </div></section>

          <section className="grid gap-3 lg:grid-cols-2"><div className="panel p-4"><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Consistency check</div><div className="mt-3 text-sm font-medium">{(evidence.agreement * 100).toFixed(1)}% directional agreement</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/7"><div className="h-full rounded-full bg-white/50" style={{ width: `${evidence.agreement * 100}%` }} /></div><p className="mt-3 text-[10px] leading-5 text-white/30">Agreement measures how consistently the historical sample finished in the direction of its median outcome. It is descriptive evidence, not a prediction.</p></div><div className="panel p-4"><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Distribution warning</div><div className="mt-3 text-sm font-medium">Mean vs median gap: {pct(evidence.dispersion)}</div><p className="mt-2 text-[10px] leading-5 text-white/30">A large gap can indicate skewed historical outcomes or a small number of extreme moves. Inspect the full path distribution before treating the median as representative.</p></div></section>

          <section className="panel p-4"><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Research interpretation</div><div className="mt-2 grid gap-2 sm:grid-cols-3"><div className="rounded-md border border-white/6 bg-white/[0.015] p-3"><div className="text-[9px] uppercase tracking-[0.1em] text-white/25">Match quality</div><div className="mt-1 text-xs text-white/60">{score(evidence.topSimilarity)} top historical similarity</div></div><div className="rounded-md border border-white/6 bg-white/[0.015] p-3"><div className="text-[9px] uppercase tracking-[0.1em] text-white/25">Near-term read</div><div className="mt-1 text-xs text-white/60">Median @ +15: {pct(evidence.plus15?.median_return ?? 0)}</div></div><div className="rounded-md border border-white/6 bg-white/[0.015] p-3"><div className="text-[9px] uppercase tracking-[0.1em] text-white/25">Longer path</div><div className="mt-1 text-xs text-white/60">Median @ +60: {pct(evidence.median60)}</div></div></div></section>
        </div>}
      </div></div></div>
    </main>
  );
}
