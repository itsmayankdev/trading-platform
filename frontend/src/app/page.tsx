"use client";

import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import MarketChart from "@/components/MarketChart";
import Sidebar from "@/components/layout/Sidebar";
import HistoricalPatternChart from "@/components/pattern-search/HistoricalPatternChart";
import OutcomeStatistics from "@/components/pattern-search/OutcomeStatistics";
import PatternSummary from "@/components/pattern-search/PatternSummary";
import ForwardPathChart from "@/components/pattern-search/ForwardPathChart";
import SearchControls from "@/components/pattern-search/SearchControls";
import type { SearchResponse } from "@/components/pattern-search/types";

const WATCHLIST = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
type LiveQuote = { price: number; change: number };
function formatPrice(value: number) { return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }

export default function Home() {
  const [symbol, setSymbol] = useState("ETHUSDT"); const [timeframe, setTimeframe] = useState("5m"); const [patternLength, setPatternLength] = useState("45"); const [topK, setTopK] = useState("10");
  const [data, setData] = useState<SearchResponse | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>(WATCHLIST); const [liveQuote, setLiveQuote] = useState<LiveQuote | null>(null); const [highlightLocked, setHighlightLocked] = useState(true); const [chartsFullscreen, setChartsFullscreen] = useState(false); const [selectedMatchIndex, setSelectedMatchIndex] = useState(0);
  const chartWorkspaceRef = useRef<HTMLDivElement | null>(null); const searchAbortRef = useRef<AbortController | null>(null); const searchRequestRef = useRef(0);
  function selectSymbol(value: string) { setSymbol(value); setError(""); setLiveQuote(null); setSelectedMatchIndex(0); }
  function changeTimeframe(value: string) { setTimeframe(value); setError(""); setLiveQuote(null); setSelectedMatchIndex(0); }
  function changePatternLength(value: string) { setPatternLength(value); setError(""); setSelectedMatchIndex(0); }
  function changeTopK(value: string) { setTopK(value); setError(""); setSelectedMatchIndex(0); }
  function toggleWatchlist(value: string) { setWatchlist((current) => { const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value]; try { window.localStorage.setItem("market-memory-watchlist", JSON.stringify(next)); } catch { /* Optional persistence. */ } return next; }); }
  async function toggleChartsFullscreen() { const workspace = chartWorkspaceRef.current; if (!workspace) return; try { if (document.fullscreenElement === workspace) await document.exitFullscreen(); else await workspace.requestFullscreen(); } catch { /* Embedded previews may block fullscreen. */ } }
  useEffect(() => { const onFullscreenChange = () => setChartsFullscreen(document.fullscreenElement === chartWorkspaceRef.current); document.addEventListener("fullscreenchange", onFullscreenChange); return () => document.removeEventListener("fullscreenchange", onFullscreenChange); }, []);
  async function refreshLiveQuote() { try { const params = new URLSearchParams({ symbol, timeframe, limit: "2" }); const response = await fetch(`/api/backend/api/v1/candles?${params.toString()}`, { cache: "no-store" }); if (!response.ok) return; const result = (await response.json()) as { candles: Array<{ close: number }> }; const candles = result.candles ?? []; const latest = candles.at(-1)?.close; const previous = candles.at(-2)?.close; if (latest == null) return; setLiveQuote({ price: latest, change: previous ? ((latest - previous) / previous) * 100 : 0 }); } catch { /* Keep last known quote. */ } }
  async function searchPatterns() {
    const requestedTopK = Number(topK); const requestedPatternLength = Number(patternLength);
    if (!Number.isInteger(requestedTopK) || requestedTopK < 5 || requestedTopK > 50 || !Number.isInteger(requestedPatternLength) || requestedPatternLength < 5 || requestedPatternLength > 500) return;
    searchAbortRef.current?.abort(); const controller = new AbortController(); searchAbortRef.current = controller; const requestId = ++searchRequestRef.current;
    setLoading(true); setError(""); setSelectedMatchIndex(0);
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    try {
      const params = new URLSearchParams({ symbol, timeframe, pattern_length: String(requestedPatternLength), top_k: String(requestedTopK) });
      const response = await fetch(`/api/backend/api/v1/pattern-search?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) { let message = `Pattern Engine returned ${response.status}`; try { const body = await response.json(); if (body?.detail) message = body.detail; } catch { /* Generic error. */ } if (requestId === searchRequestRef.current) setError(message); return; }
      const next = (await response.json()) as SearchResponse; if (requestId === searchRequestRef.current && !controller.signal.aborted) setData(next);
    } catch (caught: unknown) {
      if (controller.signal.aborted) { if (requestId === searchRequestRef.current) setError("Pattern search timed out. Try again or reduce the match count."); return; }
      if (requestId === searchRequestRef.current) setError(caught instanceof Error ? caught.message : "Could not reach the Pattern Engine. Check that FastAPI is running.");
    } finally { window.clearTimeout(timeout); if (requestId === searchRequestRef.current) setLoading(false); }
  }
  useEffect(() => { const timer = window.setTimeout(() => void searchPatterns(), 250); return () => window.clearTimeout(timer); }, [symbol, timeframe, patternLength, topK]);
  useEffect(() => { const initialTimer = window.setTimeout(() => void refreshLiveQuote(), 0); const interval = window.setInterval(() => void refreshLiveQuote(), 10000); return () => { window.clearTimeout(initialTimer); window.clearInterval(interval); }; }, [symbol, timeframe]);
  return (
    <main className="min-h-screen bg-[#070a0f] text-white">
      <header className="sticky top-0 z-40 h-12 border-b border-white/8 bg-[#070a0f]"><div className="flex h-full items-center px-4 sm:px-5"><div className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black"><Activity size={15} /></div><span className="text-xs font-semibold tracking-[0.12em]">MARKET MEMORY</span></div></div></header>
      <div className="flex"><Sidebar symbol={symbol} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} onSymbolSelect={selectSymbol} selectedSymbols={watchlist} onWatchlistToggle={toggleWatchlist} /><div className="min-w-0 flex-1">
        <SearchControls symbol={symbol} timeframe={timeframe} patternLength={patternLength} topK={topK} loading={loading} onSymbolChange={selectSymbol} onTimeframeChange={changeTimeframe} onPatternLengthChange={changePatternLength} onTopKChange={changeTopK} />
        <div className="border-b border-white/7 bg-[#080c12] px-4 py-2 sm:px-5"><div className="flex items-center gap-4 overflow-x-auto whitespace-nowrap"><div className="flex items-center gap-2 pr-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {symbol.replace("USDT", "/USDT")}</div><div className="h-4 w-px bg-white/8" /><div className="flex items-baseline gap-2"><span className="font-mono text-base font-semibold tabular-nums">{liveQuote ? formatPrice(liveQuote.price) : "—"}</span><span className={`font-mono text-[10px] tabular-nums ${liveQuote && liveQuote.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{liveQuote ? `${liveQuote.change >= 0 ? "+" : ""}${liveQuote.change.toFixed(2)}%` : "Updating…"}</span></div><div className="h-4 w-px bg-white/8" /><label className="flex cursor-pointer items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/45" title="HLT highlights the matched candles and locks both charts in place for reference"><input type="checkbox" checked={highlightLocked} onChange={(event) => setHighlightLocked(event.target.checked)} className="h-3.5 w-3.5 accent-amber-300" /><span>HLT</span></label><span className="hidden text-[9px] uppercase tracking-[0.1em] text-white/20 sm:inline">{highlightLocked ? "Highlight locked · charts fixed" : "Highlight off · charts movable"}</span>{loading && <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-amber-200/55">Updating matches…</span>}</div></div>
        <div className="mx-auto max-w-[1800px] px-3 py-3 sm:px-4 lg:px-5">
          {error && <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-red-400/15 bg-red-400/5 px-3 py-2 text-xs text-red-300"><span>{error}</span><button type="button" onClick={() => void searchPatterns()} className="rounded border border-red-300/15 px-2 py-1 text-[9px] uppercase tracking-[0.1em] text-red-200/80 hover:bg-red-300/5">Retry</button></div>}
          {loading && !data && <div className="grid grid-cols-2 gap-3"><div className="panel h-[440px] animate-pulse" /><div className="panel h-[440px] animate-pulse" /></div>}
          {data && <div className="space-y-3"><PatternSummary data={data} /><div ref={chartWorkspaceRef} className={`${chartsFullscreen ? "h-screen bg-[#070a0f] p-3" : ""}`}><section className="grid h-full min-h-0 grid-cols-2 gap-3"><section className={`panel overflow-hidden ${chartsFullscreen ? "flex h-full min-h-0 flex-col" : ""}`}><div className="flex h-12 shrink-0 items-center justify-between border-b border-white/8 px-3.5"><div><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Current market</div><div className="mt-0.5 text-xs font-semibold">{data.symbol.replace("USDT", "/USDT")} <span className="text-white/20">·</span> {data.timeframe}</div></div><div className="font-mono text-[10px] text-white/30">{data.pattern_length} matched candles</div></div><MarketChart symbol={data.symbol} timeframe={data.timeframe} patternLength={data.pattern_length} highlightLocked={highlightLocked} dashboardFullscreen={chartsFullscreen} onFullscreenToggle={() => void toggleChartsFullscreen()} /></section><HistoricalPatternChart key={`${data.symbol}-${data.timeframe}-${data.pattern_length}`} symbol={data.symbol} timeframe={data.timeframe} patternLength={data.pattern_length} matches={data.matches} highlightLocked={highlightLocked} dashboardFullscreen={chartsFullscreen} onFullscreenToggle={() => void toggleChartsFullscreen()} selectedIndex={selectedMatchIndex} onSelectedIndexChange={setSelectedMatchIndex} /></section></div><ForwardPathChart paths={data.forward_paths} selectedMatchIndex={selectedMatchIndex} /><OutcomeStatistics statistics={data.statistics} /><footer className="flex flex-col gap-1 border-t border-white/6 py-3 text-[9px] uppercase tracking-[0.1em] text-white/18 sm:flex-row sm:items-center sm:justify-between"><span>Algorithm {data.algorithm_version} · Features {data.feature_version}</span><span>Historical outcomes do not guarantee future performance.</span></footer></div>}
        </div>
      </div></div>
    </main>
  );
}
