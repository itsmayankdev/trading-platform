"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Filter, ScanSearch, TrendingUp, Zap } from "lucide-react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import MarketSelector from "@/components/markets/MarketSelector";
import type { SearchResponse } from "@/components/pattern-search/types";
import { MARKET_CONTEXT_EVENT, readGlobalMarket, writeGlobalMarket } from "@/lib/marketContext";

const TIMEFRAMES = ["5m", "15m", "1h"];
const PATTERN_LENGTHS = [30, 45, 60];
const WATCHLIST_KEY = "market-memory-watchlist";
type ScanRow = { symbol: string; response?: SearchResponse; error?: string };
type VolumeMarket = { symbol: string; base_asset?: string | null; quote_asset?: string | null; quote_volume_24h?: number | null };
type PulseRow = { symbol: string; priceChange: number; volumeRatio: number; score: number; direction: "buying" | "selling" | "flat"; error?: string };
type Direction = "all" | "higher" | "lower";

function pct(value: number) { return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`; }
function compactVolume(value: number | null | undefined) { if (value == null) return "—"; if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`; if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`; if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`; return `$${value.toFixed(0)}`; }
function readSavedUniverse() { try { const raw = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]"); const saved = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : []; return Array.from(new Set([...saved, readGlobalMarket().symbol])).filter(Boolean).slice(0, 20); } catch { return [readGlobalMarket().symbol]; } }
function saveMarket(symbol: string) { try { const raw = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]"); const list = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : []; localStorage.setItem(WATCHLIST_KEY, JSON.stringify(Array.from(new Set([...list, symbol])).slice(-20))); } catch {} }

type CandlePoint = { time: number; close: number; volume: number };

export default function ScannerPage() {
  const [timeframe, setTimeframe] = useState("5m"); const [patternLength, setPatternLength] = useState(45); const [minSimilarity, setMinSimilarity] = useState(90); const [minCases, setMinCases] = useState(5); const [direction, setDirection] = useState<Direction>("all"); const [symbols, setSymbols] = useState<string[]>([]); const [topVolume, setTopVolume] = useState<VolumeMarket[]>([]); const [rows, setRows] = useState<ScanRow[]>([]); const [loading, setLoading] = useState(true); const [collapsed, setCollapsed] = useState(false); const [pulseMode, setPulseMode] = useState(false); const [pulseRows, setPulseRows] = useState<PulseRow[]>([]); const [pulseLoading, setPulseLoading] = useState(false);

  const addMarket = (symbol: string) => { const normalized = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); if (!normalized) return; writeGlobalMarket(normalized, timeframe); saveMarket(normalized); setSymbols((current) => Array.from(new Set([...current, normalized])).slice(0, 30)); };

  useEffect(() => {
    let alive = true;
    async function loadUniverse() {
      try {
        const response = await fetch("/api/backend/api/v1/instruments?sort=volume&limit=10", { credentials: "include", cache: "no-store" });
        const payload = response.ok ? await response.json() : null;
        const volume: VolumeMarket[] = Array.isArray(payload?.instruments) ? payload.instruments : [];
        if (!alive) return;
        setTopVolume(volume);
        setSymbols(Array.from(new Set([...volume.map((item) => item.symbol), ...readSavedUniverse()])).slice(0, 30));
      } catch { if (alive) setSymbols(readSavedUniverse()); }
    }
    void loadUniverse();
    const refresh = () => setSymbols((current) => Array.from(new Set([...current, ...readSavedUniverse()])).slice(0, 30));
    window.addEventListener("storage", refresh); window.addEventListener(MARKET_CONTEXT_EVENT, refresh);
    return () => { alive = false; window.removeEventListener("storage", refresh); window.removeEventListener(MARKET_CONTEXT_EVENT, refresh); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (!symbols.length) { setRows([]); setLoading(false); return () => controller.abort(); }
    setLoading(true);
    async function scan() {
      const results = await Promise.all(symbols.map(async (symbol): Promise<ScanRow> => {
        try { const params = new URLSearchParams({ symbol, timeframe, pattern_length: String(patternLength), top_k: "10" }); const response = await fetch(`/api/backend/api/v1/pattern-search?${params}`, { cache: "no-store", signal: controller.signal }); if (!response.ok) return { symbol, error: `Unavailable (${response.status})` }; return { symbol, response: (await response.json()) as SearchResponse }; }
        catch { return { symbol, error: "Unavailable" }; }
      }));
      if (!controller.signal.aborted) { setRows(results); setLoading(false); }
    }
    void scan(); return () => controller.abort();
  }, [symbols, timeframe, patternLength]);

  useEffect(() => {
    if (!pulseMode) { setPulseRows([]); return; }
    const controller = new AbortController(); setPulseLoading(true);
    async function loadPulse() {
      const universe = Array.from(new Set([...topVolume.map((item) => item.symbol), ...symbols])).slice(0, 30);
      const results = await Promise.all(universe.map(async (symbol): Promise<PulseRow> => {
        try {
          const params = new URLSearchParams({ symbol, timeframe: timeframe === "1h" ? "5m" : timeframe, limit: "24" });
          const response = await fetch(`/api/backend/api/v1/candles?${params.toString()}`, { cache: "no-store", signal: controller.signal });
          if (!response.ok) return { symbol, priceChange: 0, volumeRatio: 0, score: 0, direction: "flat", error: `Unavailable (${response.status})` };
          const payload = await response.json(); const candles: CandlePoint[] = Array.isArray(payload?.candles) ? payload.candles : [];
          if (candles.length < 5) return { symbol, priceChange: 0, volumeRatio: 0, score: 0, direction: "flat", error: "Not enough candles" };
          const latest = candles[candles.length - 1]; const lookback = timeframe === "15m" ? 1 : 3; const anchor = candles[Math.max(0, candles.length - 1 - lookback)];
          const baseline = candles.slice(Math.max(0, candles.length - 13), candles.length - 1).map((c) => c.volume).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
          const median = baseline.length ? baseline[Math.floor(baseline.length / 2)] : latest.volume; const volumeRatio = median > 0 ? latest.volume / median : 0; const priceChange = anchor.close > 0 ? latest.close / anchor.close - 1 : 0;
          const score = Math.abs(priceChange) * 100 + Math.min(volumeRatio, 10) * 2; const direction = priceChange > 0.001 ? "buying" : priceChange < -0.001 ? "selling" : "flat";
          return { symbol, priceChange, volumeRatio, score, direction };
        } catch { return { symbol, priceChange: 0, volumeRatio: 0, score: 0, direction: "flat", error: "Unavailable" }; }
      }));
      if (!controller.signal.aborted) { setPulseRows(results.sort((a, b) => b.score - a.score)); setPulseLoading(false); }
    }
    void loadPulse(); return () => controller.abort();
  }, [pulseMode, topVolume, symbols, timeframe]);

  const ranked = useMemo(() => rows.filter((row) => row.response).map((row) => { const response = row.response!; const top = response.matches[0]?.similarity_score ?? 0; const stat = response.statistics.find((item) => item.horizon_candles === 60); const median = stat?.median_return ?? 0; const agreement = median >= 0 ? (stat?.win_rate ?? 0) : 1 - (stat?.win_rate ?? 0); return { ...row, response, top, median, agreement, cases: stat?.sample_size ?? 0 }; }).filter((row) => row.top >= minSimilarity && row.cases >= minCases).filter((row) => direction === "all" || (direction === "higher" ? row.median >= 0 : row.median < 0)).sort((a, b) => b.top - a.top), [rows, minSimilarity, minCases, direction]);
  const available = rows.filter((row) => row.response).length; const filteredOut = available - ranked.length; const activeSymbol = readGlobalMarket().symbol;

  return <main className="min-h-screen bg-[#070a0f] text-white"><header className="sticky top-0 z-40 h-12 border-b border-white/8 bg-[#070a0f]"><div className="flex h-full items-center px-4 sm:px-5"><Link href="/" className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black"><ScanSearch size={15} /></div><span className="text-xs font-semibold tracking-[0.12em]">MARKET MEMORY</span></Link><div className="ml-4 border-l border-white/8 pl-4 text-[10px] uppercase tracking-[0.14em] text-white/30">Market Scanner</div></div></header>
    <div className="flex"><Sidebar symbol={activeSymbol} collapsed={collapsed} onCollapsedChange={setCollapsed} onSymbolSelect={addMarket} selectedSymbols={symbols} onWatchlistToggle={(symbol) => addMarket(symbol)} />
      <div className="min-w-0 flex-1"><div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-7 lg:px-10"><div className="mb-5"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/65">Market-wide search</div><h1 className="mt-1 text-2xl font-semibold tracking-tight">Market Scanner</h1><p className="mt-1 text-sm text-white/40">Search any Binance Spot market to add it to this scanner, or use the sudden-move radar for fresh buying/selling pressure.</p></div>
        <section className="mb-4 rounded-lg border border-white/8 bg-[#0a0e15] p-3"><div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_auto_auto] md:items-end"><label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">Add market<MarketSelector value={activeSymbol} onChange={addMarket} className="mt-1 w-full" /></label><button type="button" onClick={() => setPulseMode(false)} className={`h-8 rounded border px-3 text-[9px] font-bold uppercase tracking-[0.1em] ${!pulseMode ? "border-amber-200/25 bg-amber-300 text-black" : "border-white/10 bg-white/[0.03] text-white/55"}`}>Pattern scanner</button><button type="button" onClick={() => setPulseMode((value) => !value)} className={`flex h-8 items-center justify-center gap-1.5 rounded border px-3 text-[9px] font-bold uppercase tracking-[0.1em] ${pulseMode ? "border-amber-200/25 bg-amber-300 text-black" : "border-white/10 bg-white/[0.03] text-white/55"}`}><Zap size={11} />Sudden moves</button></div><div className="mt-2 text-[9px] text-white/25">Selected markets are remembered in your workspace. Sudden moves compares the latest 5m/15m candle movement with recent volume activity.</div></section>
        <section className="mb-4 rounded-lg border border-white/8 bg-[#0a0e15] p-3"><div className="mb-3 flex items-center gap-2 text-xs font-semibold text-white/55"><TrendingUp size={14} /> Top 10 traded · 24h quote volume</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10">{topVolume.map((market, index) => <button type="button" key={market.symbol} onClick={() => addMarket(market.symbol)} className="rounded-md border border-white/7 bg-white/[0.015] p-2 text-left transition hover:border-amber-200/20 hover:bg-white/[0.03]"><div className="text-[8px] font-mono text-white/20">#{index + 1}</div><div className="mt-1 truncate text-[10px] font-semibold text-white/70">{market.symbol}</div><div className="mt-1 font-mono text-[9px] text-emerald-200/65">{compactVolume(market.quote_volume_24h)}</div></button>)}</div></section>
        {!pulseMode ? <><section className="mb-4 rounded-lg border border-white/8 bg-[#0a0e15] p-3"><div className="mb-3 flex items-center gap-2 text-xs font-semibold text-white/55"><Filter size={14} /> Scan filters</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className="text-[10px] text-white/35">Timeframe<select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="mt-1 block h-8 w-full rounded border border-white/8 bg-[#0d121a] px-2 text-xs text-white/75 outline-none"><option value="5m">5 minutes</option><option value="15m">15 minutes</option><option value="1h">1 hour</option></select></label><label className="text-[10px] text-white/35">Pattern<select value={patternLength} onChange={(e) => setPatternLength(Number(e.target.value))} className="mt-1 block h-8 w-full rounded border border-white/8 bg-[#0d121a] px-2 text-xs text-white/75 outline-none">{PATTERN_LENGTHS.map((v) => <option key={v} value={v}>{v} candles</option>)}</select></label><label className="text-[10px] text-white/35">Minimum match<select value={minSimilarity} onChange={(e) => setMinSimilarity(Number(e.target.value))} className="mt-1 block h-8 w-full rounded border border-white/8 bg-[#0d121a] px-2 text-xs text-white/75 outline-none">{[80, 85, 90, 92, 95, 97].map((v) => <option key={v} value={v}>{v}%+</option>)}</select></label><label className="text-[10px] text-white/35">Minimum cases<select value={minCases} onChange={(e) => setMinCases(Number(e.target.value))} className="mt-1 block h-8 w-full rounded border border-white/8 bg-[#0d121a] px-2 text-xs text-white/75 outline-none">{[1, 3, 5, 7, 10].map((v) => <option key={v} value={v}>{v} cases</option>)}</select></label><label className="text-[10px] text-white/35">Historical direction<select value={direction} onChange={(e) => setDirection(e.target.value as Direction)} className="mt-1 block h-8 w-full rounded border border-white/8 bg-[#0d121a] px-2 text-xs text-white/75 outline-none"><option value="all">Any direction</option><option value="higher">Higher</option><option value="lower">Lower</option></select></label></div></section>
        <div className="mb-3 flex items-center justify-between rounded-md border border-white/7 bg-white/[0.015] px-3 py-2 text-[11px] text-white/35"><span>{timeframe} · {patternLength} candles · {symbols.length} selected markets</span><span>{loading ? "Scanning…" : `${ranked.length} match${ranked.length === 1 ? "" : "es"}${filteredOut > 0 ? ` · ${filteredOut} filtered out` : ""}`}</span></div>
        <section className="overflow-hidden rounded-lg border border-white/8 bg-[#0a0e15]"><div className="grid grid-cols-[42px_1.35fr_1fr_1fr_1fr] gap-4 border-b border-white/8 px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/25"><span>#</span><span>Market</span><span>Pattern match</span><span>Historical direction</span><span>Agreement</span></div>{loading && symbols.map((market) => <div key={market} className="h-16 animate-pulse border-b border-white/6 bg-white/[0.01]" />)}{!loading && ranked.map((row, index) => <Link href={`/?symbol=${encodeURIComponent(row.symbol)}`} key={row.symbol} onClick={() => writeGlobalMarket(row.symbol, timeframe)} className="grid grid-cols-[42px_1.35fr_1fr_1fr_1fr] items-center gap-4 border-b border-white/6 px-4 py-4 transition last:border-0 hover:bg-white/[0.025]"><span className="font-mono text-xs text-white/25">{String(index + 1).padStart(2, "0")}</span><span><div className="text-sm font-semibold">{row.symbol.replace("USDT", "/USDT")}</div><div className="mt-0.5 text-[10px] text-white/25">{row.response.timeframe} · {row.response.pattern_length} candles</div></span><span><div className="font-mono text-sm font-semibold">{row.top.toFixed(2)}%</div><div className="mt-0.5 text-[9px] text-white/25">closest historical shape</div></span><span className={`flex items-center gap-1.5 font-mono text-sm font-semibold ${row.median >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{row.median >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}{pct(row.median)}</span><span><div className="font-mono text-sm font-semibold">{(row.agreement * 100).toFixed(0)}%</div><div className="mt-0.5 text-[9px] text-white/25">{row.cases} historical cases</div></span></Link>)}{!loading && ranked.length === 0 && <div className="px-5 py-10 text-center"><div className="text-sm font-medium text-white/60">No markets match these filters</div><div className="mt-1 text-xs text-white/25">The top-volume markets are shown above; lower the filters to see more scan results.</div></div>}{!loading && rows.filter((row) => row.error).map((row) => <div key={row.symbol} className="grid grid-cols-[42px_1.35fr_1fr_1fr_1fr] gap-4 border-b border-white/6 px-4 py-4 text-xs text-white/25"><span>—</span><span>{row.symbol.replace("USDT", "/USDT")}</span><span>Unavailable</span><span>—</span><span>—</span></div>)}</section></> : <section className="overflow-hidden rounded-lg border border-white/8 bg-[#0a0e15]"><div className="border-b border-white/8 px-4 py-3"><div className="flex items-center gap-2 text-sm font-semibold"><Zap size={14} className="text-amber-200/70" />Sudden buying / selling · live radar</div><div className="mt-1 text-[10px] text-white/25">Ranks markets by recent price movement plus current candle volume versus its recent baseline. This is a market-activity signal, not a trade guarantee.</div></div>{pulseLoading ? <div className="p-8 text-center text-xs text-white/30">Reading recent candles and volume…</div> : <div>{pulseRows.map((row, index) => <div key={row.symbol} className="grid grid-cols-[42px_1.4fr_1fr_1fr_1fr] items-center gap-3 border-b border-white/6 px-4 py-3 last:border-0"><span className="font-mono text-xs text-white/20">{String(index + 1).padStart(2, "0")}</span><span><button type="button" onClick={() => addMarket(row.symbol)} className="text-left text-sm font-semibold hover:text-amber-100">{row.symbol}</button><div className="mt-0.5 text-[9px] text-white/25">{row.direction === "buying" ? "Buying pressure" : row.direction === "selling" ? "Selling pressure" : "Mixed / flat"}</div></span><span className={`font-mono text-sm font-semibold ${row.priceChange >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{pct(row.priceChange)}</span><span className="font-mono text-sm">{row.volumeRatio.toFixed(1)}×<div className="text-[9px] font-sans text-white/25">volume vs baseline</div></span><span className="text-right font-mono text-[10px] text-white/30">{row.error || "activity score " + row.score.toFixed(1)}</span></div>)}{!pulseRows.length && <div className="p-8 text-center text-xs text-white/30">No recent market activity is available.</div>}</div>}</section>}
        <div className="mt-3 text-[10px] text-white/25">The scanner uses provider-ranked top volume plus markets you explicitly add. No fixed BTC/ETH/SOL universe remains.</div>
      </div></div></div>
  </main>;
}
