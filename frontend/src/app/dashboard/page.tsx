"use client";

import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import MarketChart from "@/components/MarketChart";
import Sidebar from "@/components/layout/Sidebar";
import HistoricalPatternChart from "@/components/pattern-search/HistoricalPatternChart";
import OutcomeStatistics from "@/components/pattern-search/OutcomeStatistics";
import PatternSummary from "@/components/pattern-search/PatternSummary";
import SearchControls from "@/components/pattern-search/SearchControls";
import PinPatternDialog from "@/components/pattern-search/PinPatternDialog";
import type { SearchResponse } from "@/components/pattern-search/types";
import { prefetchMarketCandles } from "@/lib/marketCache";
import { readFavoritePatterns, type FavoritePattern } from "@/lib/favorites";
import { readGlobalMarket, writeGlobalMarket } from "@/lib/marketContext";

type LiveQuote = { price: number; change: number };
type PinTarget = Omit<FavoritePattern, "id" | "name" | "createdAt">;
const WATCHLIST_KEY = "market-memory-watchlist";
const DEFAULT_SYMBOL = "ETHUSDT";

export default function Dashboard() {
  const [symbol, setSymbol] = useState(() => readGlobalMarket(DEFAULT_SYMBOL).symbol);
  const [timeframe, setTimeframe] = useState("5m");
  const [patternLength, setPatternLength] = useState("45");
  const [topK, setTopK] = useState("10");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [liveQuote, setLiveQuote] = useState<LiveQuote | null>(null);
  const [highlightLocked, setHighlightLocked] = useState(true);
  const [chartsFullscreen, setChartsFullscreen] = useState(false);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState(0);
  const [pinTarget, setPinTarget] = useState<PinTarget | null>(null);
  const chartWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchRequestRef = useRef(0);
  const favoriteMatchIndexRef = useRef<number | null>(null);

  useEffect(() => { try { const saved = JSON.parse(window.localStorage.getItem(WATCHLIST_KEY) || "[]"); if (Array.isArray(saved)) setWatchlist(saved.filter((item): item is string => typeof item === "string")); } catch {} }, []);
  function warmChart(value: string, nextTimeframe = timeframe) { void prefetchMarketCandles(value, nextTimeframe, Math.max(Number(patternLength) * 2, 120)).catch(() => {}); }
  function selectSymbol(value: string) { writeGlobalMarket(value, timeframe); warmChart(value); setSymbol(value); setError(""); setLiveQuote(null); setSelectedMatchIndex(0); void fetch(`/api/backend/api/v1/instruments/usage?symbol=${encodeURIComponent(value)}`, { method: "POST", credentials: "include", cache: "no-store" }).catch(() => {}); }
  function changeTimeframe(value: string) { writeGlobalMarket(symbol, value); warmChart(symbol, value); setTimeframe(value); setError(""); setLiveQuote(null); setSelectedMatchIndex(0); }
  function changePatternLength(value: string) { setPatternLength(value); setError(""); setSelectedMatchIndex(0); }
  function changeTopK(value: string) { setTopK(value); setError(""); setSelectedMatchIndex(0); }
  function toggleWatchlist(value: string) { setWatchlist((current) => { const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value].slice(-20); try { window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next)); } catch {} window.dispatchEvent(new Event("storage")); return next; }); }
  async function toggleChartsFullscreen() { const workspace = chartWorkspaceRef.current; if (!workspace) return; try { if (document.fullscreenElement === workspace) await document.exitFullscreen(); else await workspace.requestFullscreen(); } catch {} }
  useEffect(() => { const onFullscreenChange = () => setChartsFullscreen(document.fullscreenElement === chartWorkspaceRef.current); document.addEventListener("fullscreenchange", onFullscreenChange); return () => document.removeEventListener("fullscreenchange", onFullscreenChange); }, []);
  useEffect(() => { const id = new URLSearchParams(window.location.search).get("favorite"); if (!id) return; const favorite = readFavoritePatterns().find((item) => item.id === id); if (!favorite) return; favoriteMatchIndexRef.current = favorite.matchIndex ?? null; writeGlobalMarket(favorite.symbol, favorite.timeframe); warmChart(favorite.symbol, favorite.timeframe); setSymbol(favorite.symbol); setTimeframe(favorite.timeframe); setPatternLength(String(favorite.patternLength)); setSelectedMatchIndex(favorite.matchIndex ?? 0); }, []);
  async function refreshLiveQuote() { try { const response = await fetch(`/api/backend/api/v1/quote?symbol=${encodeURIComponent(symbol)}`, { credentials: "include", cache: "no-store" }); if (!response.ok) return; const result = await response.json() as { price: number; change_percent_24h: number }; if (typeof result.price !== "number") return; setLiveQuote({ price: result.price, change: result.change_percent_24h ?? 0 }); } catch {} }
  async function searchPatterns() { const requestedTopK = Number(topK); const requestedPatternLength = Number(patternLength); if (!Number.isInteger(requestedTopK) || requestedTopK < 5 || requestedTopK > 50 || !Number.isInteger(requestedPatternLength) || requestedPatternLength < 5 || requestedPatternLength > 500) return; searchAbortRef.current?.abort(); const controller = new AbortController(); searchAbortRef.current = controller; const requestId = ++searchRequestRef.current; setLoading(true); setError(""); const timeout = window.setTimeout(() => controller.abort(), 30000); try { const params = new URLSearchParams({ symbol, timeframe, pattern_length: String(requestedPatternLength), top_k: String(requestedTopK) }); const response = await fetch(`/api/backend/api/v1/pattern-search?${params.toString()}`, { cache: "no-store", signal: controller.signal }); if (!response.ok) { let message = `Pattern search returned ${response.status}`; try { const body = await response.json(); if (body?.detail) message = body.detail; } catch {} if (requestId === searchRequestRef.current) setError(message); return; } const next = await response.json() as SearchResponse; if (requestId === searchRequestRef.current && !controller.signal.aborted) { setData(next); if (favoriteMatchIndexRef.current != null) { setSelectedMatchIndex(Math.min(favoriteMatchIndexRef.current, Math.max(0, next.matches.length - 1))); favoriteMatchIndexRef.current = null; } } } catch (caught: unknown) { if (controller.signal.aborted) { if (requestId === searchRequestRef.current) setError("Pattern search timed out. Try again or reduce the match count."); return; } if (requestId === searchRequestRef.current) setError(caught instanceof Error ? caught.message : "Could not reach the Pattern Search service. Check that FastAPI is running."); } finally { window.clearTimeout(timeout); if (requestId === searchRequestRef.current) setLoading(false); } }
  useEffect(() => { void searchPatterns(); return () => searchAbortRef.current?.abort(); }, [symbol, timeframe, patternLength, topK]);
  useEffect(() => { const initialTimer = window.setTimeout(() => void refreshLiveQuote(), 0); const interval = window.setInterval(() => void refreshLiveQuote(), 10000); return () => { window.clearTimeout(initialTimer); window.clearInterval(interval); }; }, [symbol, timeframe]);
  function pinCurrent() { if (!data) return; setPinTarget({ type: "current", symbol: data.symbol, timeframe: data.timeframe, patternLength: data.pattern_length, startTime: data.current_pattern.start_time, endTime: data.current_pattern.end_time }); }
  function pinHistorical() { if (!data || !data.matches[selectedMatchIndex]) return; const match = data.matches[selectedMatchIndex]; setPinTarget({ type: "historical", symbol: data.symbol, timeframe: data.timeframe, patternLength: data.pattern_length, startTime: match.start_time, endTime: match.end_time, similarityScore: match.similarity_score, matchIndex: selectedMatchIndex }); }

  return <main className="min-h-screen bg-[#070a0f] text-white"><header className="sticky top-0 z-40 h-12 border-b border-white/8 bg-[#070a0f]"><div className="flex h-full items-center px-4 sm:px-5"><div className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black"><Activity size={15} /></div><span className="text-xs font-semibold tracking-[0.12em]">MARKET MEMORY</span></div></div></header><div className="flex"><Sidebar symbol={symbol} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} onSymbolSelect={selectSymbol} selectedSymbols={watchlist} onWatchlistToggle={toggleWatchlist} /><div className="min-w-0 flex-1"><SearchControls symbol={symbol} timeframe={timeframe} patternLength={patternLength} topK={topK} loading={loading} liveQuote={liveQuote} onSymbolChange={selectSymbol} onTimeframeChange={changeTimeframe} onPatternLengthChange={changePatternLength} onTopKChange={changeTopK} /><div className="mx-auto max-w-[1800px] px-3 py-3 sm:px-4 lg:px-5">{error && <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-red-400/15 bg-red-400/5 px-3 py-2 text-xs text-red-300"><span>{error}</span><button type="button" onClick={() => void searchPatterns()} className="rounded border border-red-300/15 px-2 py-1 text-[9px] uppercase tracking-[0.1em] text-red-200/80 hover:bg-red-300/5">Retry</button></div>}<div ref={chartWorkspaceRef} className={`${chartsFullscreen ? "h-screen bg-[#070a0f] p-3" : ""}`}><section className="grid h-full min-h-0 grid-cols-2 gap-3"><section className={`panel overflow-hidden ${chartsFullscreen ? "flex h-full min-h-0 flex-col" : ""}`}><div className="flex h-12 shrink-0 items-center justify-between border-b border-white/8 px-3.5"><div><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Current market</div><div className="mt-0.5 text-xs font-semibold">{symbol.replace("USDT", "/USDT")} <span className="text-white/20">·</span> {timeframe}</div></div><div className="font-mono text-[10px] text-white/30">{data?.pattern_length ?? Number(patternLength)} matched candles</div></div><MarketChart symbol={symbol} timeframe={timeframe} patternLength={Number(patternLength)} highlightLocked={highlightLocked} dashboardFullscreen={chartsFullscreen} onFullscreenToggle={() => void toggleChartsFullscreen()} onPin={pinCurrent} /></section>{data ? <HistoricalPatternChart symbol={data.symbol} timeframe={data.timeframe} patternLength={data.pattern_length} matches={data.matches} highlightLocked={highlightLocked} dashboardFullscreen={chartsFullscreen} onFullscreenToggle={() => void toggleChartsFullscreen()} onPin={pinHistorical} selectedIndex={selectedMatchIndex} onSelectedIndexChange={setSelectedMatchIndex} /> : <section className="panel flex min-h-[440px] items-center justify-center"><div className="text-[10px] uppercase tracking-[0.12em] text-white/25">Searching historical matches…</div></section>}</section></div>{data && <div className="space-y-3 mt-3"><PatternSummary data={data} /><OutcomeStatistics statistics={data.statistics} /><footer className="flex flex-col gap-1 border-t border-white/6 py-3 text-[9px] uppercase tracking-[0.1em] text-white/18 sm:flex-row sm:items-center sm:justify-between"><span>Algorithm {data.algorithm_version} · Features {data.feature_version}</span><span>Historical outcomes do not guarantee future performance.</span></footer></div>}</div></div></div><PinPatternDialog favorite={pinTarget} onClose={() => setPinTarget(null)} /></main>;
}
