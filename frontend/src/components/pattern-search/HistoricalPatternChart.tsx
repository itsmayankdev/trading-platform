"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Loader2 } from "lucide-react";
import { CandlestickSeries, ColorType, createChart, type CandlestickData, type Time } from "lightweight-charts";
import type { Match } from "./types";

type Candle = { time: number; open: number; high: number; low: number; close: number };
type Props = { symbol: string; timeframe: string; patternLength: number; matches: Match[]; highlightLocked: boolean };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(value));
}

function timeframeSeconds(timeframe: string) {
  if (timeframe === "1h") return 3600;
  if (timeframe === "15m") return 900;
  return 300;
}

function positionPatternBox(chart: ReturnType<typeof createChart>, box: HTMLDivElement, candles: Candle[], patternLength: number) {
  if (candles.length < patternLength) return;
  const left = chart.timeScale().timeToCoordinate(candles[0].time as Time);
  const right = chart.timeScale().timeToCoordinate(candles[patternLength - 1].time as Time);
  if (left == null || right == null) return;
  box.style.left = `${Math.max(0, Math.min(left, right) - 4)}px`;
  box.style.width = `${Math.max(14, Math.abs(right - left) + 8)}px`;
}

function HistoricalChartCanvas({ symbol, timeframe, patternLength, match, highlightLocked }: { symbol: string; timeframe: string; patternLength: number; match: Match; highlightLocked: boolean }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const patternBoxRef = useRef<HTMLDivElement | null>(null);
  const candlesRef = useRef<Candle[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const end = new Date(new Date(match.end_time).getTime() + timeframeSeconds(timeframe) * 45 * 1000).toISOString();
    const params = new URLSearchParams({ symbol, timeframe, limit: String(Math.min(patternLength + 45, 5000)), start_time: match.start_time, end_time: end });
    fetch(`/api/backend/api/v1/candles?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Historical candle API returned ${response.status}`);
        const result = (await response.json()) as { candles: Candle[] };
        const next = result.candles ?? [];
        candlesRef.current = next;
        setCandles(next);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCandles([]);
        setStatus("error");
      });
    return () => controller.abort();
  }, [symbol, timeframe, patternLength, match]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 380,
      layout: { background: { type: ColorType.Solid, color: "#0d1219" }, textColor: "#7f8999" },
      grid: { vertLines: { color: "rgba(255,255,255,0.035)" }, horzLines: { color: "rgba(255,255,255,0.035)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: "rgba(255,255,255,0.16)" }, horzLine: { color: "rgba(255,255,255,0.16)" } },
      handleScroll: highlightLocked ? false : true,
      handleScale: highlightLocked ? false : true,
    });
    const series = chart.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444" });
    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({ width: containerRef.current.clientWidth });
      if (patternBoxRef.current) positionPatternBox(chart, patternBoxRef.current, candlesRef.current, patternLength);
    });
    resizeObserver.observe(container);
    if (candles.length) {
      const data: CandlestickData<Time>[] = candles.map((candle) => ({ time: candle.time as Time, open: candle.open, high: candle.high, low: candle.low, close: candle.close }));
      series.setData(data);
      chart.timeScale().fitContent();
      if (patternBoxRef.current) positionPatternBox(chart, patternBoxRef.current, candles, patternLength);
    }
    return () => { resizeObserver.disconnect(); chart.remove(); };
  }, [candles, patternLength, highlightLocked]);

  return (
    <div className="relative">
      <div className={`absolute inset-0 z-20 flex items-center justify-center bg-[#0b1017]/75 backdrop-blur-sm ${status === "loading" ? "" : "hidden"}`}><div className="flex items-center gap-2 text-xs text-white/45"><Loader2 size={15} className="animate-spin" /> Loading historical candles</div></div>
      {status === "error" && <div className="absolute left-4 top-4 z-20 rounded-md border border-red-400/15 bg-[#0b1017] px-3 py-2 text-xs text-red-300">Could not load this historical pattern.</div>}
      <div ref={containerRef} className="relative h-[380px] w-full" />
      {highlightLocked && <div ref={patternBoxRef} className="group absolute bottom-[28px] top-[8px] z-10 border border-amber-300/75 bg-amber-300/[0.07]" title={`Highlighted area = the matched ${patternLength}-candle pattern`}>
        <span className="absolute left-1 top-1 rounded bg-amber-300/90 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-black">Matched {patternLength}</span>
        <span className="pointer-events-none absolute left-1/2 top-9 hidden -translate-x-1/2 whitespace-nowrap rounded border border-white/10 bg-[#090d13] px-2 py-1 text-[9px] font-medium normal-case tracking-normal text-white/75 shadow-xl group-hover:block">Highlighted area = matched {patternLength} candles</span>
      </div>}
    </div>
  );
}

export default function HistoricalPatternChart({ symbol, timeframe, patternLength, matches, highlightLocked }: Props) {
  const [index, setIndex] = useState(0);
  const match = matches[index];
  if (!match) return <section className="panel p-6 text-sm text-white/35">No historical matches available.</section>;

  return <section className="panel overflow-hidden">
    <div className="flex h-12 items-center justify-between border-b border-white/8 px-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0"><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Historical match</div><div className="mt-0.5 flex items-center gap-2"><h2 className="text-xs font-semibold">Match {String(index + 1).padStart(2, "0")}</h2><span className="rounded border border-white/8 bg-white/[0.025] px-1.5 py-0.5 font-mono text-[9px] text-white/45">{match.similarity_score.toFixed(2)}%</span></div></div>
        <div className="hidden items-center gap-1.5 text-[9px] text-white/25 xl:flex"><CalendarDays size={11} /> {formatDate(match.start_time)} → {formatDate(match.end_time)} UTC</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5"><button type="button" aria-label="Previous historical match" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/8 bg-white/[0.02] text-white/55 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-25"><ArrowLeft size={14} /></button><div className="min-w-[52px] text-center font-mono text-[9px] text-white/35">{index + 1} / {matches.length}</div><button type="button" aria-label="Next historical match" disabled={index === matches.length - 1} onClick={() => setIndex((value) => Math.min(matches.length - 1, value + 1))} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/8 bg-white/[0.02] text-white/55 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-25"><ArrowRight size={14} /></button></div>
    </div>
    <HistoricalChartCanvas key={match.start_time} symbol={symbol} timeframe={timeframe} patternLength={patternLength} match={match} highlightLocked={highlightLocked} />
    <div className="border-t border-white/8 px-3 py-2 text-[9px] uppercase tracking-[0.1em] text-white/25">Matched window · next 45 candles show what happened afterward</div>
    <div className="grid grid-cols-2 border-t border-white/8 sm:grid-cols-4">{[5, 15, 30, 60].map((horizon) => { const outcome = match.outcomes.find((item) => item.horizon_candles === horizon); return <div key={horizon} className="border-r border-white/6 px-3 py-2.5 last:border-r-0"><div className="text-[9px] uppercase tracking-[0.14em] text-white/25">+{horizon} candles</div><div className={`mt-0.5 font-mono text-sm ${outcome && outcome.forward_return >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{outcome ? `${outcome.forward_return >= 0 ? "+" : ""}${(outcome.forward_return * 100).toFixed(2)}%` : "—"}</div></div>; })}</div>
  </section>;
}
