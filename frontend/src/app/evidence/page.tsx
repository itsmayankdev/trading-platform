"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import type { SearchResponse } from "@/components/pattern-search/types";

const DEFAULT_TIMEFRAME = "5m";
const DEFAULT_PATTERN_LENGTH = 45;
const DEFAULT_TOP_K = 50;

function pct(value: number) { return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`; }
function score(value: number) { return `${value.toFixed(2)}%`; }

export default function EvidencePage() {
  const searchParams = useSearchParams();
  const symbol = (searchParams.get("symbol") || "ETHUSDT").toUpperCase();
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    async function load() {
      try {
        const params = new URLSearchParams({ symbol, timeframe: DEFAULT_TIMEFRAME, pattern_length: String(DEFAULT_PATTERN_LENGTH), top_k: String(DEFAULT_TOP_K) });
        const response = await fetch(`/api/backend/api/v1/pattern-search?${params.toString()}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`Could not load pattern quality (${response.status}).`);
        setData((await response.json()) as SearchResponse);
      } catch (caught: unknown) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load pattern quality."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [symbol]);

  const quality = useMemo(() => {
    if (!data || !data.matches.length) return null;
    const scores = data.matches.map((m) => m.similarity_score);
    const sortedScores = [...scores].sort((a, b) => a - b);
    const top = scores[0];
    const medianScore = sortedScores[Math.floor(sortedScores.length / 2)];
    const spread = top - medianScore;
    const get60 = (m: SearchResponse["matches"][number]) => m.outcomes.find((o) => o.horizon_candles === 60)?.forward_return ?? null;
    const returns = data.matches.map(get60).filter((v): v is number => v !== null);
    const positive = returns.filter((v) => v > 0).length;
    const negative = returns.filter((v) => v < 0).length;
    const flat = returns.length - positive - negative;
    const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const median = sortedReturns.length ? sortedReturns[Math.floor(sortedReturns.length / 2)] : 0;
    const meanMedianGap = Math.abs(mean - median);
    const midpoint = Math.ceil(data.matches.length / 2);
    const first = data.matches.slice(0, midpoint).map(get60).filter((v): v is number => v !== null);
    const second = data.matches.slice(midpoint).map(get60).filter((v): v is number => v !== null);
    const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const groupOutcomeGap = Math.abs(avg(first) - avg(second));
    const directionalShare = Math.max(positive, negative) / Math.max(1, returns.length);
    const qualityLabel = spread < 3 && meanMedianGap < 0.01 && directionalShare >= 0.6 ? "Clean evidence" : spread < 6 && directionalShare >= 0.55 ? "Mixed evidence" : "Weak evidence";
    const qualityTone = qualityLabel === "Clean evidence" ? "good" : qualityLabel === "Mixed evidence" ? "mid" : "weak";
    return { scores, top, medianScore, spread, positive, negative, flat, returns, meanMedianGap, groupOutcomeGap, directionalShare, qualityLabel, qualityTone };
  }, [data]);

  return <main className="min-h-screen bg-[#070a0f] text-white">
    <header className="sticky top-0 z-40 h-12 border-b border-white/8 bg-[#070a0f]"><div className="flex h-full items-center px-4 sm:px-5"><Link href="/" className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black"><BarChart3 size={14} /></div><span className="text-sm font-semibold tracking-[0.12em]">MARKET MEMORY</span></Link><div className="ml-4 border-l border-white/8 pl-4 text-[10px] uppercase tracking-[0.14em] text-white/35">Pattern Quality</div></div></header>
    <div className="flex"><Sidebar symbol={symbol} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} onSymbolSelect={(next) => { window.location.href = `/evidence?symbol=${next}`; }} selectedSymbols={[symbol]} onWatchlistToggle={() => {}} /><div className="min-w-0 flex-1"><div className="mx-auto max-w-[1450px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-end justify-between gap-4"><div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/65">Evidence quality · {symbol.replace("USDT", "/USDT")}</div><h1 className="mt-1.5 text-2xl font-semibold tracking-tight">Pattern Quality</h1><p className="mt-1.5 text-sm text-white/40">Checks whether the historical matches are strong, consistent, and worth investigating.</p></div>{quality && <div className={`rounded-md border px-3 py-2 text-right ${quality.qualityTone === "good" ? "border-emerald-300/15 bg-emerald-300/5" : quality.qualityTone === "mid" ? "border-amber-200/15 bg-amber-200/5" : "border-rose-300/15 bg-rose-300/5"}`}><div className="text-[9px] uppercase tracking-[0.12em] text-white/35">Overall read</div><div className="mt-0.5 text-sm font-semibold">{quality.qualityLabel}</div></div>}</div>
      {loading && <div className="space-y-3"><div className="panel h-28 animate-pulse" /><div className="panel h-64 animate-pulse" /></div>}
      {error && <div className="rounded-lg border border-red-400/15 bg-red-400/5 px-4 py-3 text-sm text-red-300">{error}</div>}
      {data && quality && <div className="space-y-3">
        <section className="grid gap-3 md:grid-cols-4"><div className="panel p-4"><div className="text-xs text-white/40">Best match</div><div className="mt-2 font-mono text-2xl font-semibold">{score(quality.top)}</div><div className="mt-1 text-[11px] text-white/25">Strongest historical match</div></div><div className="panel p-4"><div className="text-xs text-white/40">Typical match</div><div className="mt-2 font-mono text-2xl font-semibold">{score(quality.medianScore)}</div><div className="mt-1 text-[11px] text-white/25">Middle of the ranked sample</div></div><div className="panel p-4"><div className="text-xs text-white/40">Direction agreement</div><div className="mt-2 font-mono text-2xl font-semibold">{Math.round(quality.directionalShare * 100)}%</div><div className="mt-1 text-[11px] text-white/25">Same direction at +60</div></div><div className="panel p-4"><div className="text-xs text-white/40">Outcome spread</div><div className="mt-2 font-mono text-2xl font-semibold">{pct(quality.meanMedianGap)}</div><div className="mt-1 text-[11px] text-white/25">Mean vs typical outcome</div></div></section>

        <section className="panel p-4"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Are many matches genuinely similar?</h2><p className="mt-0.5 text-xs text-white/30">This shows whether the result depends on one unusually good match.</p></div><div className="font-mono text-xs text-white/35">Gap: {quality.spread.toFixed(2)} pts</div></div><div className="mt-4 space-y-1.5">{quality.scores.map((value, i) => <div key={i} className="flex items-center gap-2"><span className="w-7 text-right font-mono text-[9px] text-white/20">{i + 1}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-white/40" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} /></div><span className="w-14 font-mono text-[10px] text-white/40">{score(value)}</span></div>)}</div></section>

        <section className="grid gap-3 lg:grid-cols-2"><div className="panel p-4"><div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-300" /><h2 className="text-sm font-semibold">Do historical outcomes agree?</h2></div><div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/5"><div className="bg-emerald-300/70" style={{ width: `${quality.positive / Math.max(1, quality.returns.length) * 100}%` }} /><div className="bg-rose-300/70" style={{ width: `${quality.negative / Math.max(1, quality.returns.length) * 100}%` }} /><div className="bg-white/20" style={{ width: `${quality.flat / Math.max(1, quality.returns.length) * 100}%` }} /></div><div className="mt-3 flex justify-between text-xs"><span className="text-emerald-300">Higher {quality.positive}</span><span className="text-rose-300">Lower {quality.negative}</span><span className="text-white/35">Flat {quality.flat}</span></div></div>
          <div className="panel p-4"><div className="flex items-center gap-2"><ShieldAlert size={16} className="text-amber-200" /><h2 className="text-sm font-semibold">Evidence warnings</h2></div><div className="mt-3 space-y-2">{quality.spread >= 6 && <div className="flex gap-2 text-xs text-amber-200/70"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> Similarity falls sharply after the strongest matches.</div>}{quality.meanMedianGap >= 0.01 && <div className="flex gap-2 text-xs text-amber-200/70"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> A few large outcomes may be distorting the average.</div>}{quality.groupOutcomeGap >= 0.01 && <div className="flex gap-2 text-xs text-amber-200/70"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> Higher-ranked and lower-ranked matches have different average outcomes.</div>}{quality.spread < 6 && quality.meanMedianGap < 0.01 && quality.groupOutcomeGap < 0.01 && <div className="text-xs text-emerald-300/70">No major warning found in this sample.</div>}</div></div></section>

        <section className="panel p-4"><div className="flex items-center gap-2"><Info size={16} className="text-white/35" /><h2 className="text-sm font-semibold">Bottom line</h2></div><p className="mt-2 text-xs leading-5 text-white/40">{quality.qualityLabel === "Clean evidence" ? "The matches stay relatively close together and historical outcomes show a clear direction. This is stronger evidence to investigate further." : quality.qualityLabel === "Mixed evidence" ? "Some useful evidence is present, but the matches or outcomes are not fully consistent. Treat the result as a lead, not a strong signal." : "The historical evidence is inconsistent. The current pattern does not have enough clean agreement to rely on by itself."}</p></section>
      </div>}
    </div></div></div>
  </main>;
}
