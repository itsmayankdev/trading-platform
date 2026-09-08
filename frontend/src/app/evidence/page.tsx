"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3, CheckCircle2, Database, Info, Lightbulb, Target } from "lucide-react";
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
    const short = byHorizon.get(15);
    const median60 = long?.median_return ?? 0;
    const upShare = long?.win_rate ?? 0;
    const direction = median60 >= 0 ? "UP" : "DOWN";
    const agreement = median60 >= 0 ? upShare : 1 - upShare;
    return { byHorizon, long, short, median60, upShare, direction, agreement, top: data.matches[0]?.similarity_score ?? 0, sample: long?.sample_size ?? data.matches.length };
  }, [data]);

  return (
    <main className="min-h-screen bg-[#070a0f] text-white">
      <header className="sticky top-0 z-40 h-12 border-b border-white/8 bg-[#070a0f]"><div className="flex h-full items-center px-4 sm:px-5"><Link href="/" className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black"><BarChart3 size={15} /></div><span className="text-sm font-semibold tracking-[0.12em]">MARKET MEMORY</span></Link><div className="ml-4 border-l border-white/8 pl-4 text-[10px] uppercase tracking-[0.14em] text-white/35">Pattern Evidence</div></div></header>
      <div className="flex"><Sidebar symbol={symbol} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} onSymbolSelect={(next) => { window.location.href = `/evidence?symbol=${next}`; }} selectedSymbols={[symbol]} onWatchlistToggle={() => {}} /><div className="min-w-0 flex-1"><div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7 lg:px-10">
        <div className="mb-7"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/70">Research tool</div><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Pattern Evidence</h1><p className="mt-2 max-w-3xl text-base leading-7 text-white/50">This page answers one simple question: <span className="text-white/75">“When the market looked like this before, what happened next?”</span></p></div>

        {loading && <div className="space-y-4"><div className="panel h-40 animate-pulse" /><div className="panel h-72 animate-pulse" /></div>}
        {error && <div className="rounded-lg border border-red-400/15 bg-red-400/5 px-4 py-3 text-sm text-red-300">{error}</div>}

        {data && summary && <div className="space-y-5">
          <section className="panel border-amber-200/10 p-5 sm:p-6"><div className="flex items-start gap-4"><div className="mt-0.5 rounded-lg bg-amber-200/10 p-2.5 text-amber-200"><Info size={20} /></div><div><h2 className="text-xl font-semibold">What this feature does</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-white/50">Market Memory finds past periods that looked most like the current {data.symbol.replace("USDT", "/USDT")} pattern. It then shows what those past cases actually did after the match. This helps you compare today with real historical examples instead of relying only on a chart feeling.</p></div></div></section>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="panel p-5 sm:p-6"><div className="text-sm font-semibold text-white/55">1. How similar is today?</div><div className="mt-4 font-mono text-4xl font-semibold tracking-tight">{score(summary.top)}</div><p className="mt-2 text-sm leading-5 text-white/40">The best historical example looks this similar to the current pattern. Higher means the price shape was closer.</p></div>
            <div className="panel p-5 sm:p-6"><div className="text-sm font-semibold text-white/55">2. What did history usually do?</div><div className={`mt-4 flex items-center gap-2 text-3xl font-semibold ${summary.median60 >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{summary.median60 >= 0 ? <ArrowUpRight size={28} /> : <ArrowDownRight size={28} />} {summary.direction}</div><p className="mt-2 text-sm leading-5 text-white/40">Across {summary.sample} usable historical matches, the typical result after 60 candles was {pct(summary.median60)}.</p></div>
            <div className="panel p-5 sm:p-6"><div className="text-sm font-semibold text-white/55">3. How often did it agree?</div><div className="mt-4 font-mono text-4xl font-semibold tracking-tight">{(summary.agreement * 100).toFixed(0)}%</div><p className="mt-2 text-sm leading-5 text-white/40">This is the share of historical cases that finished in the same direction as the typical result at +60 candles.</p></div>
          </section>

          <section className="panel overflow-hidden"><div className="border-b border-white/8 px-5 py-5 sm:px-6"><h2 className="text-xl font-semibold">What happened after similar patterns?</h2><p className="mt-1 text-sm text-white/40">Each row looks at a different amount of time after the historical match. Read from left to right to see whether the move was short-lived or lasted longer.</p></div><div className="grid md:grid-cols-4">{[5, 15, 30, 60].map((horizon, index) => { const item = summary.byHorizon.get(horizon); const median = item?.median_return ?? 0; const positive = median >= 0; return <div key={horizon} className={`p-5 sm:p-6 ${index < 3 ? "border-b border-white/7 md:border-b-0 md:border-r" : ""}`}><div className="text-sm font-semibold text-white/45">After {horizon} candles</div><div className={`mt-3 text-2xl font-mono font-semibold ${positive ? "text-emerald-300" : "text-rose-300"}`}>{pct(median)}</div><div className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><span className="text-white/35">Cases that ended higher</span><span className="font-mono text-white/65">{((item?.win_rate ?? 0) * 100).toFixed(0)}%</span></div><div className="flex justify-between"><span className="text-white/35">Average worst dip</span><span className="font-mono text-rose-300/70">{pct(item?.mean_mae ?? 0)}</span></div></div></div>; })}</div></section>

          <section className="grid gap-4 lg:grid-cols-2"><div className="panel p-5 sm:p-6"><div className="flex items-center gap-3"><div className="rounded-lg bg-emerald-400/10 p-2 text-emerald-300"><Target size={19} /></div><h2 className="text-xl font-semibold">How this can help a decision</h2></div><div className="mt-5 space-y-4"><div className="flex gap-3"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-300" /><p className="text-sm leading-6 text-white/50"><strong className="text-white/75">If history agrees:</strong> you have evidence that similar situations often moved in one direction. You can use that as one input alongside your own setup and risk rules.</p></div><div className="flex gap-3"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-300" /><p className="text-sm leading-6 text-white/50"><strong className="text-white/75">If history disagrees:</strong> the pattern has not produced a clear common outcome. That is useful information too — you may choose to wait for more confirmation.</p></div><div className="flex gap-3"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-300" /><p className="text-sm leading-6 text-white/50"><strong className="text-white/75">Always check the path:</strong> the typical result does not show every possible move. Some historical cases may have gone sharply against the final result first.</p></div></div></div>
            <div className="panel p-5 sm:p-6"><div className="flex items-center gap-3"><div className="rounded-lg bg-amber-200/10 p-2 text-amber-200"><Lightbulb size={19} /></div><h2 className="text-xl font-semibold">Simple example</h2></div><p className="mt-5 text-base leading-7 text-white/55">Imagine several past patterns looked very similar. If most of them later moved higher, history is giving you a useful clue: <span className="text-white/80">“higher happened more often in similar situations.”</span> That does not mean the next move must be higher. A good decision still needs confirmation, risk control, and an exit plan.</p><div className="mt-5 rounded-lg border border-white/7 bg-white/[0.02] p-4"><div className="text-sm font-semibold text-white/60">The key idea</div><div className="mt-2 text-sm leading-6 text-white/45">Use this page to compare your current setup with what actually happened in the past. Think of it as an evidence check — not a crystal ball.</div></div></div></section>

          <section className="panel p-5 sm:p-6"><div className="flex items-center gap-3"><Database size={19} className="text-white/45" /><h2 className="text-xl font-semibold">Important: what these numbers mean</h2></div><div className="mt-4 grid gap-3 md:grid-cols-3"><div><div className="text-sm font-semibold text-white/65">Similarity</div><p className="mt-1 text-sm leading-5 text-white/40">How closely a past price pattern resembles the current one.</p></div><div><div className="text-sm font-semibold text-white/65">Typical result</div><p className="mt-1 text-sm leading-5 text-white/40">The middle historical outcome. Half the cases were above it and half below it.</p></div><div><div className="text-sm font-semibold text-white/65">Directional agreement</div><p className="mt-1 text-sm leading-5 text-white/40">How often historical cases finished in the same direction as the typical result.</p></div></div><p className="mt-5 border-t border-white/7 pt-4 text-sm leading-6 text-white/30">These are historical measurements, not guaranteed future results. They should support a decision, not make the decision for you.</p></section>
        </div>}
      </div></div></div>
    </main>
  );
}
