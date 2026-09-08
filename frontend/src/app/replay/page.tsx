"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Search } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import ReplayChart from "@/components/replay/ReplayChart";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type Match = { start_time: string; end_time: string; similarity_score: number };
type ReplaySearchResponse = { matches: Match[]; historical_candles_available: number; current_pattern: { start_time: string; end_time: string } };
const WATCHLIST = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

function isoForInput(ms: number) { const d = new Date(ms); const pad = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function formatTime(seconds: number | undefined) { return seconds == null ? "—" : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(seconds * 1000)) + " UTC"; }
function timeframeSeconds(value: string) { return value === "5m" ? 300 : value === "15m" ? 900 : 3600; }

export default function ReplayLab() {
  const [symbol, setSymbol] = useState("ETHUSDT");
  const [timeframe, setTimeframe] = useState("5m");
  const [patternLength, setPatternLength] = useState("45");
  const [topK, setTopK] = useState("10");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayInput, setReplayInput] = useState("");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("1");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [historyAvailable, setHistoryAvailable] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  async function loadWindow() {
    setLoading(true); setError(""); setPlaying(false); setMatches([]);
    try {
      const params = new URLSearchParams({ symbol, timeframe, limit: "5000" });
      const response = await fetch(`/api/backend/api/v1/candles?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Candle API returned ${response.status}`);
      const result = await response.json() as { candles: Candle[] };
      const next = result.candles ?? [];
      if (next.length < Number(patternLength) + 1) throw new Error("Not enough candles for this replay configuration.");
      setCandles(next);
      const initial = Math.max(Number(patternLength), next.length - 900);
      setReplayIndex(initial);
      setReplayInput(isoForInput(next[initial].time * 1000));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load replay candles."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadWindow(); }, [symbol, timeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing || candles.length === 0) return;
    const interval = window.setInterval(() => {
      setReplayIndex((current) => {
        if (current >= candles.length - 1) { setPlaying(false); return current; }
        return current + 1;
      });
    }, Math.max(60, 1000 / Number(speed)));
    return () => window.clearInterval(interval);
  }, [playing, speed, candles.length]);

  useEffect(() => {
    const candle = candles[replayIndex];
    if (candle) setReplayInput(isoForInput(candle.time * 1000));
  }, [replayIndex, candles]);

  const visibleCount = replayIndex + 1;
  const current = candles[replayIndex];
  const patternStartIndex = Math.max(0, replayIndex - Number(patternLength) + 1);
  const patternReady = replayIndex >= Number(patternLength) - 1;
  const replayProgress = candles.length > 1 ? (replayIndex / (candles.length - 1)) * 100 : 0;

  const priceChange = useMemo(() => {
    if (!current || !candles[0]?.close) return 0;
    return (current.close / candles[0].close - 1) * 100;
  }, [current, candles]);

  function jumpToInput() {
    const target = new Date(replayInput).getTime() / 1000;
    if (!Number.isFinite(target) || !candles.length) return;
    let nearest = 0;
    let distance = Infinity;
    candles.forEach((candle, index) => { const d = Math.abs(candle.time - target); if (d < distance) { distance = d; nearest = index; } });
    setPlaying(false); setReplayIndex(Math.max(Number(patternLength) - 1, nearest));
  }

  function resetReplay() { if (!candles.length) return; setPlaying(false); const index = Math.max(Number(patternLength) - 1, 0); setReplayIndex(index); }
  function step(delta: number) { setPlaying(false); setReplayIndex((value) => Math.max(Number(patternLength) - 1, Math.min(candles.length - 1, value + delta))); }

  async function searchMemory() {
    if (!patternReady || !current) return;
    setSearching(true); setError("");
    try {
      const replayTime = new Date(current.time * 1000).toISOString();
      const params = new URLSearchParams({ symbol, timeframe, pattern_length: patternLength, top_k: topK, replay_time: replayTime });
      const response = await fetch(`/api/backend/api/v1/replay-search?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body?.detail ?? `Replay search returned ${response.status}`); }
      const result = await response.json() as ReplaySearchResponse;
      setMatches(result.matches ?? []); setHistoryAvailable(result.historical_candles_available ?? null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Replay pattern search failed."); }
    finally { setSearching(false); }
  }

  return <main className="min-h-screen bg-[#070a0f] text-white">
    <header className="sticky top-0 z-40 h-12 border-b border-white/8 bg-[#070a0f]"><div className="flex h-full items-center px-4 sm:px-5"><div className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black"><Activity size={15} /></div><span className="text-xs font-semibold tracking-[0.12em]">MARKET MEMORY</span><span className="ml-2 text-[9px] uppercase tracking-[0.12em] text-amber-200/55">Replay Lab</span></div></div></header>
    <div className="flex"><Sidebar symbol={symbol} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} onSymbolSelect={setSymbol} selectedSymbols={WATCHLIST} onWatchlistToggle={() => undefined} />
      <div className="min-w-0 flex-1">
        <div className="border-b border-white/7 bg-[#080c12] px-4 py-3 sm:px-5"><div className="flex flex-wrap items-end gap-2.5">
          <label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">Symbol<select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75 outline-none"><option>BTCUSDT</option><option>ETHUSDT</option><option>SOLUSDT</option></select></label>
          <label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">Timeframe<select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75 outline-none"><option>5m</option><option>15m</option><option>1h</option></select></label>
          <label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">Pattern<select value={patternLength} onChange={(e) => setPatternLength(e.target.value)} className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75 outline-none"><option>30</option><option>45</option><option>60</option><option>100</option></select></label>
          <label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">Replay time<input type="datetime-local" value={replayInput} onChange={(e) => setReplayInput(e.target.value)} className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75 outline-none" /></label>
          <button type="button" onClick={jumpToInput} className="h-8 rounded border border-white/10 bg-white/[0.04] px-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/60 hover:text-white">Go</button>
          <button type="button" onClick={() => void searchMemory()} disabled={!patternReady || searching || loading} className="flex h-8 items-center gap-1.5 rounded bg-amber-300 px-3 text-[9px] font-bold uppercase tracking-[0.1em] text-black disabled:cursor-not-allowed disabled:opacity-40"><Search size={12} />{searching ? "Searching…" : "Search Memory"}</button>
        </div></div>

        <div className="mx-auto max-w-[1800px] space-y-3 px-3 py-3 sm:px-4 lg:px-5">
          {error && <div className="rounded-md border border-red-400/15 bg-red-400/5 px-3 py-2 text-xs text-red-300">{error}</div>}
          <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-3.5 py-3"><div><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Historical market replay</div><div className="mt-1 text-sm font-semibold">{symbol.replace("USDT", "/USDT")} · {timeframe}</div></div><div className="flex items-center gap-4 font-mono text-[10px] text-white/45"><span>Replay {formatTime(current?.time)}</span><span>Close {current?.close?.toFixed(4) ?? "—"}</span></div></div><ReplayChart candles={candles} visibleCount={visibleCount} /><div className="border-t border-white/8 px-3.5 py-3"><div className="mb-2 h-1 rounded-full bg-white/[0.06]"><div className="h-1 rounded-full bg-amber-300/80" style={{ width: `${replayProgress}%` }} /></div><div className="flex items-center justify-between text-[8px] uppercase tracking-[0.1em] text-white/25"><span>{formatTime(candles[0]?.time)}</span><span>Future candles hidden · {Math.max(0, candles.length - visibleCount)} remaining</span><span>{formatTime(candles.at(-1)?.time)}</span></div></div></div>
            <aside className="space-y-3">
              <section className="panel p-3.5"><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Replay controls</div><div className="mt-3 flex items-center justify-center gap-1.5"><button onClick={() => step(-10)} className="flex h-9 w-10 items-center justify-center rounded border border-white/10 text-white/55 hover:text-white" title="Back 10 candles"><ChevronLeft size={15} /></button><button onClick={() => setPlaying((v) => !v)} disabled={!candles.length} className="flex h-9 w-11 items-center justify-center rounded bg-white text-black disabled:opacity-30">{playing ? <Pause size={15} /> : <Play size={15} />}</button><button onClick={() => step(1)} className="flex h-9 w-10 items-center justify-center rounded border border-white/10 text-white/55 hover:text-white" title="Next candle"><ChevronRight size={15} /></button></div><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => step(-1)} className="rounded border border-white/8 px-2 py-2 text-[8px] uppercase tracking-[0.1em] text-white/40 hover:text-white">Previous</button><button onClick={() => step(10)} className="rounded border border-white/8 px-2 py-2 text-[8px] uppercase tracking-[0.1em] text-white/40 hover:text-white">+10 candles</button></div><div className="mt-3 flex items-center justify-between"><span className="text-[8px] uppercase tracking-[0.1em] text-white/25">Speed</span><select value={speed} onChange={(e) => setSpeed(e.target.value)} className="rounded border border-white/10 bg-[#0d1219] px-2 py-1 text-[9px] text-white/65"><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="5">5×</option><option value="10">10×</option></select></div><button onClick={resetReplay} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded border border-white/8 px-2 py-2 text-[8px] font-semibold uppercase tracking-[0.1em] text-white/35 hover:text-white"><RotateCcw size={11} /> Reset to pattern start</button></section>
              <section className="panel p-3.5"><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Replay state</div><div className="mt-3 space-y-2 font-mono text-[10px]"><div className="flex justify-between"><span className="text-white/25">Pattern ready</span><span className={patternReady ? "text-emerald-300" : "text-amber-200"}>{patternReady ? "YES" : "WAITING"}</span></div><div className="flex justify-between"><span className="text-white/25">Pattern candles</span><span className="text-white/65">{patternReady ? patternLength : `${Math.max(0, replayIndex + 1)} / ${patternLength}`}</span></div><div className="flex justify-between"><span className="text-white/25">From loaded start</span><span className={priceChange >= 0 ? "text-emerald-300" : "text-rose-300"}>{priceChange >= 0 ? "+" : ""}{priceChange.toFixed(2)}%</span></div><div className="flex justify-between"><span className="text-white/25">Future hidden</span><span className="text-emerald-300">YES</span></div></div></section>
              <section className="panel p-3.5"><div className="flex items-center justify-between"><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Memory matches</div>{historyAvailable != null && <span className="font-mono text-[8px] text-white/20">{historyAvailable.toLocaleString()} candles</span>}</div>{matches.length === 0 ? <div className="py-5 text-center text-[9px] uppercase tracking-[0.08em] text-white/20">Run Search Memory at any replay point.</div> : <div className="mt-2 space-y-1.5">{matches.map((match, index) => <div key={`${match.start_time}-${index}`} className="rounded border border-white/7 bg-white/[0.02] px-2.5 py-2"><div className="flex items-center justify-between"><span className="font-mono text-[9px] text-white/55">#{index + 1} · {match.similarity_score.toFixed(2)}%</span><span className="text-[8px] text-white/20">similarity</span></div><div className="mt-1 font-mono text-[8px] text-white/25">{formatTime(new Date(match.start_time).getTime() / 1000)}</div></div>)}</div>}</section>
            </aside>
          </section>
          <footer className="border-t border-white/6 py-3 text-[8px] uppercase tracking-[0.1em] text-white/18">Replay uses only candles at or before the selected replay time for Memory Search. Future candles remain hidden until replay advances.</footer>
        </div>
      </div>
    </div>
  </main>;
}
