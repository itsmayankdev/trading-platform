"use client";

import { useEffect, useMemo, useRef } from "react";
import { CandlestickSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type Match = { start_time: string; end_time: string; similarity_score: number };
type Props = { currentCandles: Candle[]; currentIndex: number; patternLength: number; match: Match | null; historicalCandles: Candle[]; historicalIndex: number; highlightLocked: boolean; playing: boolean };
type CandleSeries = ISeriesApi<"Candlestick">;
type ChartState = { chart: IChartApi; series: CandleSeries };

function setup(container: HTMLDivElement): ChartState {
  const chart = createChart(container, {
    width: container.clientWidth,
    height: Math.max(320, container.clientHeight),
    layout: { background: { type: ColorType.Solid, color: "#0d1219" }, textColor: "#8b95a7" },
    grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
    rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
    timeScale: { borderColor: "rgba(255,255,255,0.1)", timeVisible: true, secondsVisible: false },
    crosshair: { vertLine: { color: "rgba(255,255,255,0.18)" }, horzLine: { color: "rgba(255,255,255,0.18)" } },
    handleScroll: false,
    handleScale: false,
  });
  const series = chart.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444" });
  return { chart, series };
}

function chartWindow(candles: Candle[], endIndex: number, patternLength: number, fixedHighlightStart?: number) {
  if (!candles.length) return { data: [], highlightFrom: 0, highlightTo: -1, firstTime: undefined as number | undefined, lastTime: undefined as number | undefined };
  const safeEnd = Math.min(candles.length - 1, Math.max(0, endIndex));
  const contextLength = Math.min(candles.length, Math.max(patternLength * 2, 60));
  const start = Math.max(0, safeEnd - contextLength + 1);
  const slice = candles.slice(start, safeEnd + 1);
  const highlightStart = fixedHighlightStart == null ? safeEnd - patternLength + 1 : fixedHighlightStart;
  const highlightEnd = fixedHighlightStart == null ? safeEnd : fixedHighlightStart + patternLength - 1;
  return {
    data: slice.map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })),
    highlightFrom: highlightStart - start,
    highlightTo: highlightEnd - start,
    firstTime: slice[0]?.time,
    lastTime: slice[slice.length - 1]?.time,
  };
}

function formatUtc(seconds?: number) {
  if (seconds == null) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(seconds * 1000)) + " UTC";
}

export default function DualReplayChart({ currentCandles, currentIndex, patternLength, match, historicalCandles, historicalIndex, highlightLocked, playing }: Props) {
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const leftState = useRef<ChartState | null>(null);
  const rightState = useRef<ChartState | null>(null);
  const leftHighlight = useRef<HTMLDivElement | null>(null);
  const rightHighlight = useRef<HTMLDivElement | null>(null);
  const current = useMemo(() => chartWindow(currentCandles, currentIndex, patternLength), [currentCandles, currentIndex, patternLength]);
  const historicalStart = useMemo(() => {
    if (!match || !historicalCandles.length) return undefined;
    const start = new Date(match.start_time).getTime() / 1000;
    const index = historicalCandles.findIndex((row) => row.time === start);
    return index >= 0 ? index : undefined;
  }, [match, historicalCandles]);
  const historical = useMemo(() => chartWindow(historicalCandles, historicalIndex, patternLength, historicalStart), [historicalCandles, historicalIndex, patternLength, historicalStart]);
  const chartsLocked = highlightLocked || playing;

  useEffect(() => {
    if (!leftRef.current || !rightRef.current) return;
    const left = setup(leftRef.current);
    const right = setup(rightRef.current);
    leftState.current = left;
    rightState.current = right;
    const resize = new ResizeObserver(() => {
      if (leftRef.current) left.chart.applyOptions({ width: leftRef.current.clientWidth, height: Math.max(320, leftRef.current.clientHeight) });
      if (rightRef.current) right.chart.applyOptions({ width: rightRef.current.clientWidth, height: Math.max(320, rightRef.current.clientHeight) });
    });
    resize.observe(leftRef.current);
    resize.observe(rightRef.current);
    return () => {
      resize.disconnect();
      left.chart.remove();
      right.chart.remove();
      leftState.current = null;
      rightState.current = null;
    };
  }, []);

  useEffect(() => {
    const left = leftState.current;
    const right = rightState.current;
    if (!left || !right) return;
    left.series.setData(current.data);
    right.series.setData(historical.data);
    left.chart.timeScale().fitContent();
    right.chart.timeScale().fitContent();
    const place = (chart: IChartApi, node: HTMLDivElement | null, from: number, to: number, total: number) => {
      if (!node || total === 0 || to < 0 || from >= total) return;
      const safeFrom = Math.max(0, from);
      const safeTo = Math.min(total - 1, to);
      const x1 = chart.timeScale().logicalToCoordinate(safeFrom);
      const x2 = chart.timeScale().logicalToCoordinate(safeTo);
      if (x1 == null || x2 == null) return;
      node.style.left = `${Math.max(0, Math.min(x1, x2) - 2)}px`;
      node.style.width = `${Math.max(8, Math.abs(x2 - x1) + 4)}px`;
    };
    place(left.chart, leftHighlight.current, current.highlightFrom, current.highlightTo, current.data.length);
    place(right.chart, rightHighlight.current, historical.highlightFrom, historical.highlightTo, historical.data.length);
  }, [current, historical, highlightLocked]);

  useEffect(() => {
    const left = leftState.current;
    const right = rightState.current;
    if (!left || !right) return;
    const options = { handleScroll: !chartsLocked, handleScale: !chartsLocked };
    left.chart.applyOptions(options);
    right.chart.applyOptions(options);
  }, [chartsLocked]);

  useEffect(() => {
    const left = leftState.current;
    const right = rightState.current;
    if (!left || !right) return;
    let syncing = false;
    const sync = (source: IChartApi, target: IChartApi) => {
      if (syncing || chartsLocked) return;
      const range = source.timeScale().getVisibleLogicalRange();
      if (!range) return;
      syncing = true;
      target.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    };
    const onLeft = () => sync(left.chart, right.chart);
    const onRight = () => sync(right.chart, left.chart);
    left.chart.timeScale().subscribeVisibleLogicalRangeChange(onLeft);
    right.chart.timeScale().subscribeVisibleLogicalRangeChange(onRight);
    return () => {
      left.chart.timeScale().unsubscribeVisibleLogicalRangeChange(onLeft);
      right.chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRight);
    };
  }, [chartsLocked]);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="overflow-hidden rounded-md border border-amber-300/15 bg-[#0d1219]">
        <div className="flex items-center justify-between border-b border-white/8 px-3 py-2"><div><div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-white/30">Replay · Current</div><div className="mt-0.5 text-[11px] font-semibold text-white/75">{current.lastTime != null ? formatUtc(current.lastTime) : "Selected replay point"}</div></div><span className="rounded bg-amber-300/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-amber-200">Current</span></div>
        <div className="relative"><div ref={leftRef} className="h-[380px] w-full" />{highlightLocked && <div ref={leftHighlight} className="pointer-events-none absolute bottom-0 top-0 border border-amber-300/65 bg-amber-300/[0.06]"><span className="absolute left-1 top-1 rounded bg-amber-300/90 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-black">Matched {patternLength}</span></div>}{playing && <div className="absolute inset-0 z-20 cursor-not-allowed" aria-hidden="true" />}</div>
        <div className="border-t border-white/8 px-3 py-2 text-[8px] uppercase tracking-[0.08em] text-white/25">{highlightLocked ? `HLT locked · exact replay pattern · ${patternLength} candles` : "HLT off · chart movable"} · actual market prices/time</div>
      </section>
      <section className="overflow-hidden rounded-md border border-white/10 bg-[#0d1219]">
        <div className="flex items-center justify-between border-b border-white/8 px-3 py-2"><div><div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-white/30">Historical match</div><div className="mt-0.5 text-[11px] font-semibold text-white/75">{match ? `${match.similarity_score.toFixed(2)}% similarity` : "Search Memory to compare"}</div></div>{match && <span className="font-mono text-[8px] text-white/25">{formatUtc(new Date(match.end_time).getTime() / 1000)}</span>}</div>
        <div className="relative"><div ref={rightRef} className="h-[380px] w-full" />{highlightLocked && <div ref={rightHighlight} className="pointer-events-none absolute bottom-0 top-0 border border-amber-300/65 bg-amber-300/[0.06]"><span className="absolute left-1 top-1 rounded bg-amber-300/90 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-black">Matched {patternLength}</span></div>}{playing && <div className="absolute inset-0 z-20 cursor-not-allowed" aria-hidden="true" />}</div>
        <div className="border-t border-white/8 px-3 py-2 text-[8px] uppercase tracking-[0.08em] text-white/25">{highlightLocked ? "HLT locked · exact historical match · future candles reveal with replay" : "HLT off · chart movable"} · actual market prices/time</div>
      </section>
    </div>
  );
}
