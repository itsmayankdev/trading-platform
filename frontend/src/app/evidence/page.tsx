"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BarChart3, CalendarRange, CheckCircle2, ChevronDown, Info, Layers3, ShieldCheck } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import type { SearchResponse } from "@/components/pattern-search/types";

const WATCHLIST = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

function pct(value: number | null | undefined, digits = 2) {
  return value == null || !Number.isFinite(value) ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}
function score(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(2)}%`;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(value)) + " UTC";
}
function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export default function EvidencePage() {
  const [symbol, setSymbol] = useState("ETHUSDT");
  const [timeframe, setTimeframe] = useState("5m");
  const [patternLength, setPatternLength] = useState("45");
  const [topK, setTopK] = useState("50");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ symbol, timeframe, pattern_length: patternLength, top_k: topK });
      const response = await fetch(`/api/backend/api/v1/pattern-search?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load pattern quality (${response.status}).`);
      setData((await response.json()) as SearchResponse);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load pattern quality."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe]);

  const diagnostics = useMemo(() => {
    if (!data?.matches.length) return null;
    const matches = data.matches;
    const scores = matches.map((m) => m.similarity_score);
    const top10 = scores.slice(0, Math.min(10, scores.length));
    const tail = scores.slice(Math.min(10, scores.length));
    const topMedian = median(top10);
    const tailMedian = median(tail);
    const decay = topMedian != null && tailMedian != null ? topMedian - tailMedian : null;

    const starts = matches.map((m) => new Date(m.start_time).getTime()).sort((a, b) => a - b);
    const gaps = starts.slice(1).map((v, i) => (v - starts[i]) / 86400000).filter((v) => v > 0);
    const distinctMonths = new Set(matches.map((m) => m.start_time.slice(0, 7))).size;
    const distinctDays = new Set(matches.map((m) => m.start_time.slice(0, 10))).size;

    const get60 = (m: SearchResponse["matches"][number]) => m.outcomes.find((o) => o.horizon_candles === 60)?.forward_return ?? null;
    const returns = matches.map(get60).filter((v): v is number => v != null && Number.isFinite(v));
    const q25 = percentile(returns, 0.25);
    const q50 = percentile(returns, 0.5);
    const q75 = percentile(returns, 0.75);
    const iqr = q25 != null && q75 != null ? q75 - q25 : null;
    const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : null;
    const meanAbsDeviation = mean == null ? null : returns.reduce((a, b) => a + Math.abs(b - mean), 0) / returns.length;
    const positive = returns.filter((v) => v > 0).length;
    const negative = returns.filter((v) => v < 0).length;
    const directionalAgreement = returns.length ? Math.max(positive, negative) / returns.length : null;

    const topMatch = matches[0]?.similarity_score ?? null;
    const medianMatch = median(scores);
    const spread = topMatch != null && medianMatch != null ? topMatch - medianMatch : null;
    const coverage = matches.length ? distinctMonths / matches.length : 0;

    const warnings: string[] = [];
    if (decay != null && decay > 5) warnings.push("Similarity falls sharply after the first 10 matches.");
    if (directionalAgreement != null && directionalAgreement < 0.6) warnings.push("Historical outcomes do not have a clear directional majority at +60 candles.");
    if (iqr != null && Math.abs(iqr) > 0.08) warnings.push("The middle 50% of +60 outcomes is wide; outcomes are dispersed.");
    if (coverage < 0.2 && matches.length >= 10) warnings.push("Many matches are concentrated in a small number of calendar months.");

    return { topMedian, tailMedian, decay, topMatch, medianMatch, spread, gaps, distinctMonths, distinctDays, coverage, q25, q50, q75, iqr, mean, meanAbsDeviation, positive, negative, directionalAgreement, warnings };
  }, [data]);

  const rankBuckets = useMemo(() => {
    if (!data?.matches.length) return [];
    const size = Math.ceil(data.matches.length / 5);
    return Array.from({ length: 5 }, (_, i) => {
      const values = data.matches.slice(i * size, Math.min((i + 1) * size, data.matches.length)).map((m) => m.similarity_score);
      return { label: `${i * size + 1}–${i * size + values.length}`, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null, median: median(values) };
    }).filter((b) => b.min != null);
  }, [data]);

  return <main className="min-h-screen bg-[#070a0f] text-white">
    <header className="sticky top-0 z-40 h-12 border-b border-white/8 bg-[#070a0f]"><div className="flex h-full items-center px-4 sm:px-5"><div className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black"><BarChart3 size={14} /></div><span className="text-sm font-semibold tracking-[0.12em]">MARKET MEMORY</span><span className="ml-2 text-[9px] uppercase tracking-[0.14em] text-amber-200/55">Pattern Quality</span></div></div></header>
    <div className="flex"><Sidebar symbol={symbol} collapsed={collapsed} onCollapsedChange={setCollapsed} onSymbolSelect={setSymbol} selectedSymbols={WATCHLIST} onWatchlistToggle={() => undefined} /><div className="min-w-0 flex-1">
      <div className="border-b border-white/7 bg-[#080c12] px-4 py-3 sm:px-5"><div className="flex flex-wrap items-end gap-2.5">
        <label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">Symbol<select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75"><option>BTCUSDT</option><option>ETHUSDT</option><option>SOLUSDT</option></select></label>
        <label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">Timeframe<select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75"><option>5m</option><option>15m</option><option>1h</option></select></label>
        <label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">Pattern<select value={patternLength} onChange={(e) => setPatternLength(e.target.value)} className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75"><option>30</option><option>45</option><option>60</option><option>100</option></select></label>
        <label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">Matches<select value={topK} onChange={(e) => setTopK(e.target.value)} className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75"><option>20</option><option>50</option></select></label>
        <button type="button" onClick={() => void load()} disabled={loading} className="flex h-8 items-center gap-1.5 rounded bg-amber-300 px-3 text-[9px] font-bold uppercase tracking-[0.1em] text-black disabled:opacity-40"><Activity size={11} />{loading ? "Loading…" : "Refresh quality"}</button>
      </div><div className="mt-2 flex items-center gap-2 text-[9px] text-white/30"><span className="rounded border border-white/8 bg-white/[0.02] px-2 py-1">Diagnostics · not a prediction score</span><span className="hidden sm:inline">Measures match concentration, temporal coverage, and outcome consistency.</span></div></div>

      <div className="mx-auto max-w-[1600px] space-y-3 px-3 py-4 sm:px-5 lg:px-6">
        {error && <div className="rounded-md border border-red-400/15 bg-red-400/5 px-3 py-2 text-xs text-red-300">{error}</div>}
        {loading && !data && <div className="space-y-3"><div className="panel h-28 animate-pulse" /><div className="panel h-56 animate-pulse" /></div>}
        {data && diagnostics && <>
          <section className="grid gap-3 md:grid-cols-4">
            <div className="panel p-4"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-white/35"><Layers3 size={13} />Match concentration</div><div className="mt-2 text-2xl font-semibold font-mono">{score(diagnostics.topMedian)}</div><div className="mt-1 text-[10px] text-white/30">Top 10 median similarity</div><div className="mt-3 text-[10px] text-white/40">Top-to-middle spread <span className="font-mono text-white/65">{score(diagnostics.spread)}</span></div></div>
            <div className="panel p-4"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-white/35"><CalendarRange size={13} />Temporal coverage</div><div className="mt-2 text-2xl font-semibold font-mono">{diagnostics.distinctMonths}</div><div className="mt-1 text-[10px] text-white/30">calendar months represented</div><div className="mt-3 text-[10px] text-white/40">Unique days <span className="font-mono text-white/65">{diagnostics.distinctDays}</span></div></div>
            <div className="panel p-4"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-white/35"><CheckCircle2 size={13} />Directional agreement</div><div className="mt-2 text-2xl font-semibold font-mono">{diagnostics.directionalAgreement == null ? "—" : `${Math.round(diagnostics.directionalAgreement * 100)}%`}</div><div className="mt-1 text-[10px] text-white/30">dominant direction at +60</div><div className="mt-3 text-[10px] text-white/40">Higher <span className="font-mono text-emerald-200/70">{diagnostics.positive}</span> · Lower <span className="font-mono text-rose-200/70">{diagnostics.negative}</span></div></div>
            <div className="panel p-4"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-white/35"><ShieldCheck size={13} />Outcome consistency</div><div className="mt-2 text-2xl font-semibold font-mono">{pct(diagnostics.iqr)}</div><div className="mt-1 text-[10px] text-white/30">+60 interquartile range</div><div className="mt-3 text-[10px] text-white/40">Median outcome <span className="font-mono text-white/65">{pct(diagnostics.q50)}</span></div></div>
          </section>

          <section className="panel overflow-hidden"><div className="border-b border-white/8 px-4 py-3"><div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/45">Similarity decay</div><div className="mt-1 text-[10px] text-white/25">Ranks are grouped to show whether useful matches remain available beyond the very top result.</div></div><div className="grid gap-2 p-4 md:grid-cols-5">{rankBuckets.map((bucket) => <div key={bucket.label} className="rounded-md border border-white/6 bg-white/[0.012] p-3"><div className="text-[9px] uppercase tracking-[0.1em] text-white/30">Ranks {bucket.label}</div><div className="mt-3 h-1.5 rounded-full bg-white/6"><div className="h-full rounded-full bg-white/35" style={{ width: `${Math.max(3, Math.min(100, bucket.median ?? 0))}%` }} /></div><div className="mt-2 font-mono text-[11px] text-white/55">{score(bucket.median)}</div><div className="mt-1 text-[9px] text-white/25">{score(bucket.min)}–{score(bucket.max)}</div></div>)}</div></section>

          <section className="grid gap-3 lg:grid-cols-2">
            <div className="panel p-4"><div className="flex items-center gap-2"><CalendarRange size={15} className="text-white/40" /><h2 className="text-sm font-semibold">Are matches spread through history?</h2></div><p className="mt-1 text-[10px] text-white/28">Temporal coverage is descriptive, not a statistical independence guarantee.</p><div className="mt-4 flex items-end gap-1.5">{Array.from({ length: Math.min(12, diagnostics.distinctMonths) }, (_, i) => <div key={i} className="h-8 flex-1 rounded-sm bg-white/15" title="represented month" />)}</div><div className="mt-3 grid grid-cols-3 gap-3 text-[10px]"><div><div className="text-white/25">Matches</div><div className="mt-1 font-mono text-white/60">{data.matches.length}</div></div><div><div className="text-white/25">Months</div><div className="mt-1 font-mono text-white/60">{diagnostics.distinctMonths}</div></div><div><div className="text-white/25">Median gap</div><div className="mt-1 font-mono text-white/60">{diagnostics.gaps.length ? `${median(diagnostics.gaps)?.toFixed(1)}d` : "—"}</div></div></div></div>
            <div className="panel p-4"><div className="flex items-center gap-2"><ShieldCheck size={15} className="text-white/40" /><h2 className="text-sm font-semibold">How consistent are outcomes?</h2></div><p className="mt-1 text-[10px] text-white/28">The middle 50% shows the typical outcome range without letting one outlier dominate the read.</p><div className="mt-5"><div className="relative h-2 rounded-full bg-white/6"><div className="absolute h-full rounded-full bg-white/25" style={{ left: `${Math.max(0, Math.min(100, ((diagnostics.q25 ?? 0) + 0.2) / 0.4 * 100))}%`, width: `${Math.max(2, Math.min(100, ((diagnostics.q75 ?? 0) - (diagnostics.q25 ?? 0)) / 0.4 * 100))}%` }} /><div className="absolute -top-1 h-4 w-0.5 bg-amber-200" style={{ left: `${Math.max(0, Math.min(100, ((diagnostics.q50 ?? 0) + 0.2) / 0.4 * 100))}%` }} /></div><div className="mt-3 flex justify-between font-mono text-[9px] text-white/25"><span>−20%</span><span>median {pct(diagnostics.q50)}</span><span>+20%</span></div></div><div className="mt-4 grid grid-cols-3 gap-3 text-[10px]"><div><div className="text-white/25">25th</div><div className="mt-1 font-mono text-white/60">{pct(diagnostics.q25)}</div></div><div><div className="text-white/25">Median</div><div className="mt-1 font-mono text-white/60">{pct(diagnostics.q50)}</div></div><div><div className="text-white/25">75th</div><div className="mt-1 font-mono text-white/60">{pct(diagnostics.q75)}</div></div></div></div>
          </section>

          <section className="panel p-4"><div className="flex items-center gap-2"><AlertTriangle size={15} className="text-amber-200/60" /><h2 className="text-sm font-semibold">Diagnostics to investigate</h2></div>{diagnostics.warnings.length ? <div className="mt-3 space-y-2">{diagnostics.warnings.map((warning) => <div key={warning} className="flex gap-2 text-xs text-amber-100/65"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{warning}</div>)}</div> : <div className="mt-3 text-xs text-emerald-200/60">No material diagnostic warning found in this sample.</div>}<div className="mt-4 flex items-start gap-2 border-t border-white/6 pt-3 text-[10px] leading-4 text-white/28"><Info size={13} className="mt-0.5 shrink-0" />Pattern Quality describes the retrieved evidence. It does not turn similarity into a probability and does not guarantee a future outcome.</div></section>

          <section className="panel overflow-hidden"><div className="border-b border-white/8 px-4 py-3"><div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/45">Current retrieval</div><div className="mt-1 text-[10px] text-white/25">{data.symbol} · {data.timeframe} · {data.pattern_length} candles · {data.matches.length} historical matches</div></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-[10px]"><thead className="bg-white/[0.02] text-[8px] uppercase tracking-[0.12em] text-white/25"><tr><th className="px-4 py-2.5">Rank</th><th className="px-4 py-2.5">Similarity</th><th className="px-4 py-2.5">Historical time</th><th className="px-4 py-2.5">+60 outcome</th><th className="px-4 py-2.5">MFE</th><th className="px-4 py-2.5">MAE</th></tr></thead><tbody>{data.matches.slice(0, 20).map((match, index) => { const outcome = match.outcomes.find((o) => o.horizon_candles === 60); return <tr key={`${match.start_time}-${index}`} className="border-t border-white/6"><td className="px-4 py-2.5 font-mono text-white/35">#{index + 1}</td><td className="px-4 py-2.5 font-mono text-amber-200/70">{score(match.similarity_score)}</td><td className="px-4 py-2.5 font-mono text-white/45">{formatDate(match.end_time)}</td><td className="px-4 py-2.5 font-mono">{pct(outcome?.forward_return)}</td><td className="px-4 py-2.5 font-mono">{pct(outcome?.mfe)}</td><td className="px-4 py-2.5 font-mono">{pct(outcome?.mae)}</td></tr>; })}</tbody></table></div></section>
        </>}
      </div>
    </div></div>
  </main>;
}
