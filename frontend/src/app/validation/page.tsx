"use client";

import { useState } from "react";
import { Activity, FlaskConical, Play, ShieldCheck } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";

type Stability = { positive_edge_fraction: number | null; median_edge_vs_baseline: number | null };
type Evaluation = {
  symbol: string; timeframe: string; checkpoints: Array<{ current_regime: { label?: string | null } | null; same_regime_match_fraction: number | null }>;
  stability?: Record<string, Stability>;
  similarity_stability?: { median: number | null };
  regime_analysis?: { median_same_regime_match_fraction: number | null; regimes_observed?: Record<string, number> };
};
type Result = Evaluation & { status: "running" | "done" | "error"; error?: string };
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const TIMEFRAMES = ["5m", "15m", "1h"];

function pct(v: number | null | undefined) { return v == null ? "—" : `${(v * 100).toFixed(1)}%`; }

export default function ValidationLab() {
  const [patternLength, setPatternLength] = useState("45");
  const [topK, setTopK] = useState("10");
  const [checkpoints, setCheckpoints] = useState("12");
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  async function runMatrix() {
    setRunning(true);
    const initial: Record<string, Result> = {};
    for (const symbol of SYMBOLS) for (const timeframe of TIMEFRAMES) initial[`${symbol}-${timeframe}`] = { symbol, timeframe, checkpoints: [], status: "running" };
    setResults(initial);

    const jobs = SYMBOLS.flatMap((symbol) => TIMEFRAMES.map((timeframe) => ({ symbol, timeframe })));
    const queue = [...jobs];
    const worker = async () => {
      while (queue.length) {
        const job = queue.shift();
        if (!job) return;
        const { symbol, timeframe } = job;
        const key = `${symbol}-${timeframe}`;
        try {
          const params = new URLSearchParams({ symbol, timeframe, pattern_length: patternLength, top_k: topK, checkpoints });
          const response = await fetch(`/api/backend/api/v1/evaluation?${params.toString()}`, { cache: "no-store" });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body?.detail ?? `HTTP ${response.status}`);
          setResults((prev) => ({ ...prev, [key]: { ...(body as Evaluation), status: "done" } }));
        } catch (error) {
          setResults((prev) => ({ ...prev, [key]: { ...prev[key], status: "error", error: error instanceof Error ? error.message : "Evaluation failed" } }));
        }
      }
    };
    await Promise.all(Array.from({ length: 2 }, () => worker()));
    setRunning(false);
  }

  const done = Object.values(results).filter((r) => r.status === "done");
  const edges60 = done.map((r) => r.stability?.["60"]?.positive_edge_fraction).filter((v): v is number => v != null);
  const sameRegime = done.map((r) => r.regime_analysis?.median_same_regime_match_fraction).filter((v): v is number => v != null);
  const median = (values: number[]) => values.length ? [...values].sort((a,b) => a-b)[Math.floor(values.length / 2)] : null;

  return <main className="min-h-screen bg-[#070a0f] text-white"><header className="sticky top-0 z-40 h-12 border-b border-white/8 bg-[#070a0f]"><div className="flex h-full items-center px-4 sm:px-5"><div className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black"><Activity size={15}/></div><span className="text-xs font-semibold tracking-[0.12em]">MARKET MEMORY</span><span className="ml-2 text-[9px] uppercase tracking-[0.12em] text-amber-200/55">Cross-Market Validation</span></div></div></header>
    <div className="flex"><Sidebar symbol="ETHUSDT" collapsed={collapsed} onCollapsedChange={setCollapsed} onSymbolSelect={() => undefined} selectedSymbols={SYMBOLS} onWatchlistToggle={() => undefined}/><div className="min-w-0 flex-1"><div className="border-b border-white/7 bg-[#080c12] px-4 py-3 sm:px-5"><div className="flex flex-wrap items-end gap-2.5"><label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">Pattern<select value={patternLength} onChange={(e)=>setPatternLength(e.target.value)} className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75"><option>30</option><option>45</option><option>60</option></select></label><label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">Top matches<select value={topK} onChange={(e)=>setTopK(e.target.value)} className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75"><option>5</option><option>10</option><option>20</option></select></label><label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">Checkpoints<select value={checkpoints} onChange={(e)=>setCheckpoints(e.target.value)} className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75"><option>6</option><option>12</option><option>20</option><option>30</option></select></label><button type="button" onClick={()=>void runMatrix()} disabled={running} className="flex h-8 items-center gap-1.5 rounded bg-amber-300 px-3 text-[9px] font-bold uppercase tracking-[0.1em] text-black disabled:opacity-40"><Play size={11}/>{running ? "Running 9 evaluations…" : "Run 9-Market Validation"}</button></div><div className="mt-2 flex items-center gap-2 text-[9px] text-white/30"><span className="rounded border border-white/8 bg-white/[0.02] px-2 py-1">BTC · ETH · SOL × 5m · 15m · 1h</span><span className="hidden sm:inline">Two evaluations run at a time to keep database load predictable.</span></div></div>
      <div className="mx-auto max-w-[1800px] space-y-3 px-3 py-3 sm:px-4 lg:px-5">{done.length > 0 && <section className="grid gap-3 md:grid-cols-3"><div className="panel p-4"><div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.13em] text-white/35"><ShieldCheck size={13}/>Coverage</div><div className="mt-2 text-2xl font-semibold">{done.length}/9</div><div className="mt-0.5 text-[10px] text-white/35">market/timeframe evaluations completed</div></div><div className="panel p-4"><div className="text-[9px] uppercase tracking-[0.13em] text-white/35">+60 edge consistency</div><div className="mt-2 text-2xl font-semibold">{pct(median(edges60))}</div><div className="mt-0.5 text-[10px] text-white/35">median across completed cells</div></div><div className="panel p-4"><div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.13em] text-white/35"><FlaskConical size={13}/>Same-regime retrieval</div><div className="mt-2 text-2xl font-semibold">{pct(median(sameRegime))}</div><div className="mt-0.5 text-[10px] text-white/35">median share of top matches from the current regime</div></div></section>}
        <section className="panel overflow-hidden"><div className="border-b border-white/8 px-4 py-3"><div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/45">Cross-symbol / timeframe matrix</div><div className="mt-1 text-[10px] text-white/25">Transparent validation of retrieval edge, similarity and regime alignment. No composite score.</div></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-[10px]"><thead className="bg-white/[0.02] text-[8px] uppercase tracking-[0.12em] text-white/25"><tr><th className="px-4 py-2.5">Market</th><th className="px-4 py-2.5">Timeframe</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Median similarity</th><th className="px-4 py-2.5">+60 positive edge</th><th className="px-4 py-2.5">Median same-regime</th><th className="px-4 py-2.5">Regimes observed</th></tr></thead><tbody>{SYMBOLS.flatMap((symbol)=>TIMEFRAMES.map((timeframe)=>{const r=results[`${symbol}-${timeframe}`]; const regimes=r?.checkpoints?.map(c=>c.current_regime?.label).filter((v):v is string=>!!v) ?? []; return <tr key={`${symbol}-${timeframe}`} className="border-t border-white/6"><td className="px-4 py-3 font-semibold text-white/65">{symbol.replace("USDT", "")}</td><td className="px-4 py-3 font-mono text-white/55">{timeframe}</td><td className="px-4 py-3">{r?.status === "done" ? <span className="text-emerald-300/75">Complete</span> : r?.status === "error" ? <span className="text-red-300/75" title={r.error}>Error</span> : r?.status === "running" ? <span className="text-amber-200/75">Running…</span> : <span className="text-white/20">Not run</span>}</td><td className="px-4 py-3 font-mono">{r?.similarity_stability?.median == null ? "—" : `${r.similarity_stability.median.toFixed(1)}%`}</td><td className="px-4 py-3 font-mono">{pct(r?.stability?.["60"]?.positive_edge_fraction)}</td><td className="px-4 py-3 font-mono">{pct(r?.regime_analysis?.median_same_regime_match_fraction)}</td><td className="px-4 py-3 text-white/45">{regimes.length ? Array.from(new Set(regimes)).join(", ") : r?.status === "error" ? <span title={r.error}>—</span> : "—"}</td></tr>}))}</tbody></table></div></section>
        {done.length > 0 && <section className="panel p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/45">How to read this</div><div className="mt-2 grid gap-3 text-[10px] leading-5 text-white/40 md:grid-cols-3"><div><strong className="text-white/65">Positive edge</strong><br/>How often retrieved matches beat the historical baseline at +60 candles. Higher consistency is useful; it is not a guarantee.</div><div><strong className="text-white/65">Same-regime</strong><br/>How often the top historical analogs share the current trend + volatility regime.</div><div><strong className="text-white/65">Regime coverage</strong><br/>Bull, bear and sideways states are evaluated with volatility buckets using only information available at each checkpoint.</div></div></section>}</div></div></div></main>;
}
