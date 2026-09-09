"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDown, ArrowUp, RefreshCw, ScanSearch, Zap } from "lucide-react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import { readGlobalMarket, writeGlobalMarket } from "@/lib/marketContext";

type Timeframe = "5m" | "15m" | "1h";
type VolumeMarket = { symbol: string; base_asset?: string | null; quote_asset?: string | null; quote_volume_24h?: number | null };
type CandlePoint = { time: number; close: number; volume: number };
type RadarRow = { symbol: string; baseAsset: string; quoteAsset: string; priceChange: number; volumeRatio: number; score: number; direction: "buying" | "selling" | "flat"; volume24h?: number | null; error?: string };

function pct(value: number) { return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`; }
function compactVolume(value: number | null | undefined) { if (value == null || !Number.isFinite(value)) return "—"; if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`; if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`; if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`; return `$${value.toFixed(0)}`; }

export default function ScannerPage() {
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [topMarkets, setTopMarkets] = useState<VolumeMarket[]>([]);
  const [rows, setRows] = useState<RadarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const scan = async () => {
    setRefreshing(true);
    try {
      const universeResponse = await fetch("/api/backend/api/v1/instruments?sort=volume&limit=30", { credentials: "include", cache: "no-store" });
      const universePayload = universeResponse.ok ? await universeResponse.json() : null;
      const universe: VolumeMarket[] = Array.isArray(universePayload?.instruments) ? universePayload.instruments : [];
      setTopMarkets(universe);
      const controller = new AbortController();
      const results = await Promise.all(universe.map(async (market): Promise<RadarRow> => {
        try {
          const candleTimeframe = timeframe === "1h" ? "15m" : timeframe;
          const params = new URLSearchParams({ symbol: market.symbol, timeframe: candleTimeframe, limit: "40" });
          const response = await fetch(`/api/backend/api/v1/candles?${params.toString()}`, { cache: "no-store", signal: controller.signal });
          if (!response.ok) return { symbol: market.symbol, baseAsset: market.base_asset || market.symbol, quoteAsset: market.quote_asset || "", priceChange: 0, volumeRatio: 0, score: 0, direction: "flat", volume24h: market.quote_volume_24h, error: `Unavailable (${response.status})` };
          const payload = await response.json();
          const candles: CandlePoint[] = Array.isArray(payload?.candles) ? payload.candles : [];
          if (candles.length < 6) return { symbol: market.symbol, baseAsset: market.base_asset || market.symbol, quoteAsset: market.quote_asset || "", priceChange: 0, volumeRatio: 0, score: 0, direction: "flat", volume24h: market.quote_volume_24h, error: "Not enough candles" };
          const latest = candles[candles.length - 1];
          const lookback = timeframe === "5m" ? 3 : 1;
          const anchor = candles[Math.max(0, candles.length - 1 - lookback)];
          const baseline = candles.slice(0, -1).map((c) => c.volume).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
          const median = baseline.length ? baseline[Math.floor(baseline.length / 2)] : latest.volume;
          const volumeRatio = median > 0 ? latest.volume / median : 0;
          const priceChange = anchor.close > 0 ? latest.close / anchor.close - 1 : 0;
          const movement = Math.abs(priceChange) * 100;
          const volumeBoost = Math.min(Math.max(volumeRatio - 1, 0), 8) * 1.5;
          const score = movement + volumeBoost;
          const direction = priceChange > 0.001 ? "buying" : priceChange < -0.001 ? "selling" : "flat";
          return { symbol: market.symbol, baseAsset: market.base_asset || market.symbol, quoteAsset: market.quote_asset || "", priceChange, volumeRatio, score, direction, volume24h: market.quote_volume_24h };
        } catch {
          return { symbol: market.symbol, baseAsset: market.base_asset || market.symbol, quoteAsset: market.quote_asset || "", priceChange: 0, volumeRatio: 0, score: 0, direction: "flat", volume24h: market.quote_volume_24h, error: "Unavailable" };
        }
      }));
      setRows(results.filter((row) => !row.error).sort((a, b) => b.score - a.score).slice(0, 15));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void scan(); }, [timeframe]);
  const best = useMemo(() => rows.slice(0, 10), [rows]);
  const selectMarket = (nextSymbol: string) => { const normalized = nextSymbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); if (normalized) writeGlobalMarket(normalized, timeframe); };
  const activeSymbol = readGlobalMarket().symbol;

  return <main className="min-h-screen bg-[#070a0f] text-white"><header className="sticky top-0 z-40 h-12 border-b border-white/8 bg-[#070a0f]"><div className="flex h-full items-center px-4 sm:px-5"><Link href="/" className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black"><ScanSearch size={15} /></div><span className="text-xs font-semibold tracking-[0.12em]">MARKET MEMORY</span></Link><div className="ml-4 border-l border-white/8 pl-4 text-[10px] uppercase tracking-[0.14em] text-white/30">Sudden Movement Radar</div></div></header>
    <div className="flex"><Sidebar symbol={activeSymbol} collapsed={collapsed} onCollapsedChange={setCollapsed} onSymbolSelect={selectMarket} />
      <div className="min-w-0 flex-1"><div className="mx-auto max-w-[1250px] px-4 py-6 sm:px-7 lg:px-10"><div className="mb-5"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/65"><Zap size={12} /> Market radar</div><h1 className="mt-1 text-2xl font-semibold tracking-tight">Sudden Movement Radar</h1><p className="mt-1 max-w-2xl text-sm text-white/40">Automatically watches the most liquid Binance Spot markets and surfaces unusual price movement backed by a fresh volume spike.</p></div>
        <section className="mb-4 rounded-lg border border-white/8 bg-[#0a0e15] p-3"><div className="flex flex-wrap items-center gap-2"><div className="mr-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/30">Radar timeframe</div>{(["5m", "15m", "1h"] as Timeframe[]).map((value) => <button key={value} type="button" onClick={() => setTimeframe(value)} className={`h-8 rounded border px-3 text-[10px] font-semibold ${timeframe === value ? "border-amber-200/25 bg-amber-300 text-black" : "border-white/10 bg-white/[0.03] text-white/55"}`}>{value}</button>)}<button type="button" onClick={() => void scan()} disabled={refreshing} className="ml-auto flex h-8 items-center gap-1.5 rounded border border-white/10 bg-white/[0.03] px-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/55 disabled:opacity-40"><RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />Refresh</button></div></section>
        <section className="overflow-hidden rounded-lg border border-white/8 bg-[#0a0e15]"><div className="flex items-center justify-between border-b border-white/7 px-4 py-3"><div className="flex items-center gap-2 text-xs font-semibold text-white/65"><Activity size={14} /> Live radar</div><div className="text-[9px] text-white/25">Scanning top {topMarkets.length || 30} by 24h quote volume</div></div>
          <div className="grid grid-cols-[38px_minmax(160px,1.4fr)_110px_120px_120px_110px] border-b border-white/7 px-4 py-2 text-[8px] font-semibold uppercase tracking-[0.12em] text-white/20"><span>#</span><span>Market</span><span>Movement</span><span>Volume spike</span><span>24h volume</span><span>Radar score</span></div>
          {loading && <div className="px-4 py-10 text-center text-xs text-white/25">Scanning liquid markets…</div>}
          {!loading && best.map((row, index) => <button key={row.symbol} type="button" onClick={() => selectMarket(row.symbol)} className="grid w-full grid-cols-[38px_minmax(160px,1.4fr)_110px_120px_120px_110px] items-center border-b border-white/5 px-4 py-3 text-left transition hover:bg-white/[0.025]"><span className="font-mono text-[9px] text-white/20">{index + 1}</span><span><span className="block text-[11px] font-semibold text-white/75">{row.baseAsset} <span className="text-white/25">· {row.symbol}</span></span><span className="text-[9px] text-white/20">{row.quoteAsset} · liquid universe</span></span><span className={`flex items-center gap-1 text-[10px] font-semibold ${row.direction === "buying" ? "text-emerald-300/75" : row.direction === "selling" ? "text-red-300/75" : "text-white/45"}`}>{row.direction === "buying" ? <ArrowUp size={11} /> : row.direction === "selling" ? <ArrowDown size={11} /> : null}{pct(row.priceChange)}</span><span className="font-mono text-[10px] text-amber-200/70">{row.volumeRatio.toFixed(1)}×</span><span className="font-mono text-[10px] text-white/45">{compactVolume(row.volume24h)}</span><span className="font-mono text-[10px] text-white/55">{row.score.toFixed(2)}</span></button>)}
          {!loading && !best.length && <div className="px-4 py-10 text-center text-xs text-white/25">No usable movement data returned yet.</div>}
        </section>
      </div></div>
    </div></main>;
}
