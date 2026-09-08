"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, Play, ShieldCheck, TrendingUp } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";

type Aggregate = { sample_size: number; mean_return: number | null; win_rate: number | null; mean_mfe: number | null; mean_mae: number | null; baseline_mean_return: number | null; edge_vs_baseline: number | null };
type Checkpoint = { replay_time: string; pattern_start: string; matches_found: number; top_match_similarity: number | null; aggregates: Record<string, Aggregate> };
type Stability = { checkpoint_count: number; positive_return_checkpoints: number; positive_return_fraction: number | null; positive_edge_checkpoints: number; positive_edge_fraction: number | null; mean_return: number | null; median_return: number | null; mean_edge_vs_baseline: number | null; median_edge_vs_baseline: number | null };
type EvaluationResponse = { symbol: string; timeframe: string; pattern_length: number; top_k: number; available_start_time: string; available_end_time: string; evaluation_start_time: string; evaluation_end_time: string; checkpoints: Checkpoint[]; horizons: number[]; stability?: Record<string, Stability>; similarity_stability?: { checkpoint_count: number; min: number | null; median: number | null; max: number | null } };
const WATCHLIST = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

function formatDate(value: string | null | undefined) { if (!value) return "—"; return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(value)) + " UTC"; }
function pct(value: number | null | undefined) { return value == null ? "—" : `${(value * 100).toFixed(2)}%`; }

export default function EvaluationLab() {
  const [symbol, setSymbol] = useState("ETHUSDT");
  const [timeframe, setTimeframe] = useState("15m");
  const [patternLength, setPatternLength] = useState("45");
  const [topK, setTopK] = useState("10");
  const [checkpoints, setCheckpoints] = useState("12");
  const [data, setData] = useState<EvaluationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  async function runEvaluation() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ symbol, timeframe, pattern_length: patternLength, top_k: topK, checkpoints });
      const response = await fetch(`/api/backend/api/v1/evaluation?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body?.detail ?? `Evaluation returned ${response.status}`); }
      setData((await response.json()) as EvaluationResponse);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Evaluation failed."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void runEvaluation(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe]);

  const summary = useMemo(() => {
    if (!data?.checkpoints.length) return null;
    return data.horizons.map((h) => {
      const rows = data.checkpoints.map((c) => c.aggregates[String(h)]).filter(Boolean);
      const returns = rows.map((r) => r.mean_return).filter((v): v is number => v != null);
      const edges = rows.map((r) => r.edge_vs_baseline).filter((v): v is number => v != null);
      const wins = rows.map((r) => r.win_rate).filter((v): v is number => v != null);
      return { horizon: h, meanReturn: returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : null, edge: edges.length ? edges.reduce((a, b) => a + b, 0) / edges.length : null, winRate: wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : null };
    });
  }, [data]);

  const stability60 = data?.stability?.["60"];
  const similarity = data?.similarity_stability;

  return (
    <main className="min-h-screen bg-[#070a0f] text-white">
      <header className="sticky top-0 z-40 h-12 border-b border-white/8 bg-[#070a0f]"><div className="flex h-full items-center px-4 sm:px-5"><div className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black"><Activity size={15} /></div><span className="text-xs font-semibold tracking-[0.12em]">MARKET MEMORY</span><span className="ml-2 text-[9px] uppercase tracking-[0.12em] text-amber-200/55">Evaluation Lab</span></div></div></header>
      <div className="flex"><Sidebar symbol={symbol} collapsed={collapsed} onCollapsedChange={setCollapsed} onSymbolSelect={setSymbol} selectedSymbols={WATCHLIST} onWatchlistToggle={() => undefined} />
        <div className="min-w-0 flex-1">
          <div className="border-b border-white/7 bg-[#080c12] px-4 py-3 sm:px-5"><div className="flex flex-wrap items-end gap-2.5">
            <label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">Symbol<select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75"><option>BTCUSDT</option><option>ETHUSDT</option><option>SOLUSDT</option></select></label>
            <label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">Timeframe<select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75"><option>5m</option><option>15m</option><option>1h</option></select></label>
            <label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">Pattern<select value={patternLength} onChange={(e) => setPatternLength(e.target.value)} className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75"><option>30</option><option>45</option><option>60</option><option>100</option></select></label>
            <label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">Top matches<select value={topK} onChange={(e) => setTopK(e.target.value)} className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75"><option>5</option><option>10</option><option>20</option></select></label>
            <label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">Checkpoints<select value={checkpoints} onChange={(e) => setCheckpoints(e.target.value)} className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75"><option>6</option><option>12</option><option>20</option><option>30</option></select></label>
            <button type="button" onClick={() => void runEvaluation()} disabled={loading} className="flex h-8 items-center gap-1.5 rounded bg-amber-300 px-3 text-[9px] font-bold uppercase tracking-[0.1em] text-black disabled:opacity-40"><Play size={11} />{loading ? "Running…" : "Run Evaluation"}</button>
          </div><div className="mt-2 flex items-center gap-2 text-[9px] text-white/30"><span className="rounded border border-white/8 bg-white/[0.02] px-2 py-1">Walk-forward · no lookahead</span><span className="hidden sm:inline">Each checkpoint searches only history available at that replay point.</span></div></div>

          <div className="mx-auto max-w-[1800px] space-y-3 px-3 py-3 sm:px-4 lg:px-5">
            {error && <div className="rounded-md border border-red-400/15 bg-red-400/5 px-3 py-2 text-xs text-red-300">{error}</div>}
            {data && <>
              <section className="grid gap-3 md:grid-cols-4"><div className="panel p-4"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-white/35"><ShieldCheck size={13} />Evaluation window</div><div className="mt-2 text-sm font-semibold">{formatDate(data.evaluation_start_time)}</div><div className="mt-0.5 text-[10px] text-white/35">to {formatDate(data.evaluation_end_time)}</div></div><div className="panel p-4"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-white/35"><BarChart3 size={13} />Checkpoints</div><div className="mt-2 text-2xl font-semibold">{data.checkpoints.length}</div><div className="mt-0.5 text-[10px] text-white/35">walk-forward historical points</div></div><div className="panel p-4"><div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-white/35">+60 edge consistency</div><div className="mt-2 text-2xl font-semibold">{pct(stability60?.positive_edge_fraction)}</div><div className="mt-0.5 text-[10px] text-white/35">{stability60 ? `${stability60.positive_edge_checkpoints}/${stability60.checkpoint_count} checkpoints beat baseline` : "—"}</div></div><div className="panel p-4"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-white/35"><TrendingUp size={13} />Top similarity</div><div className="mt-2 text-2xl font-semibold">{similarity?.median == null ? "—" : `${similarity.median.toFixed(1)}%`}</div><div className="mt-0.5 text-[10px] text-white/35">range {similarity?.min == null ? "—" : similarity.min.toFixed(1)}–{similarity?.max == null ? "—" : similarity.max.toFixed(1)}%</div></div></section>

              <section className="panel overflow-hidden"><div className="border-b border-white/8 px-4 py-3"><div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/45">Retrieval performance by horizon</div><div className="mt-1 text-[10px] text-white/25">Returns are historical outcomes, not probabilities. Edge compares retrieved matches with the unconditional historical mean available at each checkpoint.</div></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-[10px]"><thead className="bg-white/[0.02] text-[8px] uppercase tracking-[0.12em] text-white/25"><tr><th className="px-4 py-2.5">Horizon</th><th className="px-4 py-2.5">Mean return</th><th className="px-4 py-2.5">Win rate</th><th className="px-4 py-2.5">Edge vs baseline</th><th className="px-4 py-2.5">Positive checkpoints</th></tr></thead><tbody>{summary?.map((row) => { const s = data.stability?.[String(row.horizon)]; return <tr key={row.horizon} className="border-t border-white/6"><td className="px-4 py-3 font-semibold text-white/65">+{row.horizon} candles</td><td className="px-4 py-3 font-mono text-white/65">{pct(row.meanReturn)}</td><td className="px-4 py-3 font-mono text-white/65">{pct(row.winRate)}</td><td className="px-4 py-3 font-mono text-white/65">{pct(row.edge)}</td><td className="px-4 py-3 font-mono text-white/65">{s ? `${s.positive_edge_checkpoints}/${s.checkpoint_count}` : "—"}</td></tr>})}</tbody></table></div></section>

              <section className="panel overflow-hidden"><div className="border-b border-white/8 px-4 py-3"><div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/45">Stability across checkpoints</div><div className="mt-1 text-[10px] text-white/25">No composite score: inspect whether returns and retrieval edge persist across historical replay points.</div></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-[10px]"><thead className="bg-white/[0.02] text-[8px] uppercase tracking-[0.12em] text-white/25"><tr><th className="px-4 py-2.5">Horizon</th><th className="px-4 py-2.5">Median return</th><th className="px-4 py-2.5">Median edge</th><th className="px-4 py-2.5">Positive return</th><th className="px-4 py-2.5">Positive edge</th><th className="px-4 py-2.5">Checkpoints</th></tr></thead><tbody>{data.horizons.map((h) => { const s=data.stability?.[String(h)]; return <tr key={h} className="border-t border-white/6"><td className="px-4 py-3 font-semibold text-white/65">+{h}</td><td className="px-4 py-3 font-mono">{pct(s?.median_return)}</td><td className="px-4 py-3 font-mono">{pct(s?.median_edge_vs_baseline)}</td><td className="px-4 py-3 font-mono">{pct(s?.positive_return_fraction)}</td><td className="px-4 py-3 font-mono">{pct(s?.positive_edge_fraction)}</td><td className="px-4 py-3 font-mono">{s?.checkpoint_count ?? "—"}</td></tr>})}</tbody></table></div></section>

              <section className="panel overflow-hidden"><div className="border-b border-white/8 px-4 py-3"><div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/45">Checkpoint audit</div><div className="mt-1 text-[10px] text-white/25">Use this table to spot regime changes, weak retrieval periods, and unstable similarity.</div></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-[10px]"><thead className="bg-white/[0.02] text-[8px] uppercase tracking-[0.12em] text-white/25"><tr><th className="px-4 py-2.5">Replay point</th><th className="px-4 py-2.5">Top similarity</th><th className="px-4 py-2.5">+5 return</th><th className="px-4 py-2.5">+15 return</th><th className="px-4 py-2.5">+30 return</th><th className="px-4 py-2.5">+60 return</th><th className="px-4 py-2.5">+60 MFE / MAE</th></tr></thead><tbody>{data.checkpoints.map((row) => { const a5=row.aggregates["5"], a15=row.aggregates["15"], a30=row.aggregates["30"], a60=row.aggregates["60"]; return <tr key={row.replay_time} className="border-t border-white/6"><td className="px-4 py-3 font-mono text-white/55">{formatDate(row.replay_time)}</td><td className="px-4 py-3 font-mono text-amber-200/75">{row.top_match_similarity == null ? "—" : `${row.top_match_similarity.toFixed(2)}%`}</td><td className="px-4 py-3 font-mono">{pct(a5?.mean_return)}</td><td className="px-4 py-3 font-mono">{pct(a15?.mean_return)}</td><td className="px-4 py-3 font-mono">{pct(a30?.mean_return)}</td><td className="px-4 py-3 font-mono">{pct(a60?.mean_return)}</td><td className="px-4 py-3 font-mono">{pct(a60?.mean_mfe)} / {pct(a60?.mean_mae)}</td></tr>; })}</tbody></table></div></section>
            </>}
          </div>
        </div>
      </div>
    </main>
  );
}
