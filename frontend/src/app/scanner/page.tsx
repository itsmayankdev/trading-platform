"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ScanSearch } from "lucide-react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import type { SearchResponse } from "@/components/pattern-search/types";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const TIMEFRAME = "5m";
const PATTERN_LENGTH = 45;

type ScanRow = { symbol: string; response?: SearchResponse; error?: string };

function pct(value: number) { return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`; }
function directionLabel(value: number) { return value >= 0 ? "Higher" : "Lower"; }

export default function ScannerPage() {
  const [rows, setRows] = useState<ScanRow[]>(SYMBOLS.map((symbol) => ({ symbol })));
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function scan() {
      const results = await Promise.all(SYMBOLS.map(async (symbol): Promise<ScanRow> => {
        try {
          const params = new URLSearchParams({ symbol, timeframe: TIMEFRAME, pattern_length: String(PATTERN_LENGTH), top_k: "10" });
          const response = await fetch(`/api/backend/api/v1/pattern-search?${params}`, { cache: "no-store", signal: controller.signal });
          if (!response.ok) return { symbol, error: `Unavailable (${response.status})` };
          return { symbol, response: (await response.json()) as SearchResponse };
        } catch { return { symbol, error: "Unavailable" }; }
      }));
      if (!controller.signal.aborted) { setRows(results); setLoading(false); }
    }
    void scan();
    return () => controller.abort();
  }, []);

  const ranked = useMemo(() => rows.filter((row) => row.response).sort((a, b) => (b.response?.matches[0]?.similarity_score ?? 0) - (a.response?.matches[0]?.similarity_score ?? 0)), [rows]);

  return <main className="min-h-screen bg-[#070a0f] text-white">
    <header className="sticky top-0 z-40 h-12 border-b border-white/8 bg-[#070a0f]"><div className="flex h-full items-center px-4 sm:px-5"><Link href="/" className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black"><ScanSearch size={15} /></div><span className="text-xs font-semibold tracking-[0.12em]">MARKET MEMORY</span></Link><div className="ml-4 border-l border-white/8 pl-4 text-[10px] uppercase tracking-[0.14em] text-white/30">Market Scanner</div></div></header>
    <div className="flex"><Sidebar symbol="ETHUSDT" collapsed={collapsed} onCollapsedChange={setCollapsed} onSymbolSelect={(symbol) => { window.location.href = `/scanner?symbol=${symbol}`; }} selectedSymbols={[]} onWatchlistToggle={() => {}} />
      <div className="min-w-0 flex-1"><div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-7 lg:px-10">
        <div className="mb-6"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/65">Market-wide search</div><h1 className="mt-1 text-2xl font-semibold tracking-tight">Market Scanner</h1><p className="mt-1 text-sm text-white/40">Quickly find which market has the strongest historical pattern match right now.</p></div>
        <div className="mb-4 rounded-md border border-white/7 bg-white/[0.015] px-3 py-2 text-[11px] text-white/35"><span>{TIMEFRAME} · {PATTERN_LENGTH} candles · {SYMBOLS.length} core markets</span><span className="float-right">{loading ? "Scanning…" : `${ranked.length} ready`}</span></div>
        <section className="overflow-hidden rounded-lg border border-white/8 bg-[#0a0e15]">
          <div className="grid grid-cols-[42px_1.35fr_1fr_1fr_1fr] gap-4 border-b border-white/8 px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/25"><span>#</span><span>Market</span><span>Pattern match</span><span>Typical history</span><span>Agreement</span></div>
          {loading && SYMBOLS.map((symbol) => <div key={symbol} className="h-16 animate-pulse border-b border-white/6 bg-white/[0.01]" />)}
          {!loading && ranked.map((row, index) => { const response = row.response!; const top = response.matches[0]?.similarity_score ?? 0; const stat = response.statistics.find((item) => item.horizon_candles === 60); const median = stat?.median_return ?? 0; const agreement = median >= 0 ? (stat?.win_rate ?? 0) : 1 - (stat?.win_rate ?? 0); const up = median >= 0; return <Link href={`/?symbol=${row.symbol}`} key={row.symbol} className="grid grid-cols-[42px_1.35fr_1fr_1fr_1fr] items-center gap-4 border-b border-white/6 px-4 py-4 transition last:border-0 hover:bg-white/[0.025]"><span className="font-mono text-xs text-white/25">{String(index + 1).padStart(2, "0")}</span><span><div className="text-sm font-semibold">{row.symbol.replace("USDT", "/USDT")}</div><div className="mt-0.5 text-[10px] text-white/25">{response.timeframe} · {response.pattern_length} candles</div></span><span><div className="font-mono text-sm font-semibold">{top.toFixed(2)}%</div><div className="mt-0.5 text-[9px] text-white/25">closest historical shape</div></span><span className={`flex items-center gap-1.5 font-mono text-sm font-semibold ${up ? "text-emerald-300" : "text-rose-300"}`}>{up ? <ArrowUp size={14} /> : <ArrowDown size={14} />}{pct(median)}<span className="font-sans text-[9px] font-normal text-white/25">{directionLabel(median)}</span></span><span><div className="font-mono text-sm font-semibold">{(agreement * 100).toFixed(0)}%</div><div className="mt-0.5 text-[9px] text-white/25">{stat?.sample_size ?? 0} cases</div></span></Link>; })}
          {!loading && rows.filter((row) => row.error).map((row) => <div key={row.symbol} className="grid grid-cols-[42px_1.35fr_1fr_1fr_1fr] gap-4 border-b border-white/6 px-4 py-4 text-xs text-white/25"><span>—</span><span>{row.symbol.replace("USDT", "/USDT")}</span><span>Unavailable</span><span>—</span><span>—</span></div>)}
        </section>
        <div className="mt-4 text-[10px] text-white/25">Use the scanner to shortlist markets. A high pattern match means the price shape resembles history; agreement shows how consistently those historical cases moved in the same direction.</div>
      </div></div>
    </div>
  </main>;
}
