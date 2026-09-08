"use client";

import { useEffect, useMemo, useRef } from "react";
import { CandlestickSeries, ColorType, createChart, type IChartApi, type Time } from "lightweight-charts";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type Match = { start_time: string; end_time: string; similarity_score: number };
type Props = { currentCandles: Candle[]; currentIndex: number; patternLength: number; match: Match | null; historicalCandles: Candle[]; historicalIndex: number; onHistoricalReady?: (index: number) => void };

function toTime(value: string | number): Time { return typeof value === "number" ? value as Time : Math.floor(new Date(value).getTime() / 1000) as Time; }
function normalizePath(candles: Candle[], endIndex: number, length: number) {
  const start = Math.max(0, endIndex - length + 1); const slice = candles.slice(start, endIndex + 1); const base = slice[0]?.close ?? 1;
  return slice.map((c) => ({ ...c, open: c.open / base, high: c.high / base, low: c.low / base, close: c.close / base }));
}
function setupChart(container: HTMLDivElement) {
  const chart = createChart(container, { width: container.clientWidth, height: Math.max(320, container.clientHeight), layout: { background: { type: ColorType.Solid, color: "#0d1219" }, textColor: "#8b95a7" }, grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } }, rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" }, timeScale: { borderColor: "rgba(255,255,255,0.1)", timeVisible: true, secondsVisible: false }, crosshair: { vertLine: { color: "rgba(255,255,255,0.18)" }, horzLine: { color: "rgba(255,255,255,0.18)" } } });
  return chart;
}

export default function DualReplayChart({ currentCandles, currentIndex, patternLength, match, historicalCandles, historicalIndex }: Props) {
  const leftRef = useRef<HTMLDivElement | null>(null); const rightRef = useRef<HTMLDivElement | null>(null); const leftChartRef = useRef<IChartApi | null>(null); const rightChartRef = useRef<IChartApi | null>(null);
  const historicalVisible = useMemo(() => historicalCandles.slice(0, historicalIndex + 1), [historicalCandles, historicalIndex]);
  const currentVisible = useMemo(() => currentCandles.slice(0, currentIndex + 1), [currentCandles, currentIndex]);

  useEffect(() => {
    if (!leftRef.current || !rightRef.current) return;
    const left = setupChart(leftRef.current); const right = setupChart(rightRef.current); leftChartRef.current = left; rightChartRef.current = right;
    const leftSeries = left.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444" });
    const rightSeries = right.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444" });
    const resize = new ResizeObserver(() => { if (leftRef.current) left.applyOptions({ width: leftRef.current.clientWidth, height: Math.max(320, leftRef.current.clientHeight) }); if (rightRef.current) right.applyOptions({ width: rightRef.current.clientWidth, height: Math.max(320, rightRef.current.clientHeight) }); });
    resize.observe(leftRef.current); resize.observe(rightRef.current);
    return () => { resize.disconnect(); left.remove(); right.remove(); leftChartRef.current = null; rightChartRef.current = null; };
  }, []);

  useEffect(() => {
    const left = leftChartRef.current; const right = rightChartRef.current; if (!left || !right) return;
    const leftSeries = left.series()[0]; const rightSeries = right.series()[0];
    const current = normalizePath(currentCandles, currentIndex, patternLength);
    const historical = normalizePath(historicalCandles, historicalIndex, patternLength);
    leftSeries.setData(current.map((c, i) => ({ time: i as Time, open: c.open, high: c.high, low: c.low, close: c.close })));
    rightSeries.setData(historical.map((c, i) => ({ time: i as Time, open: c.open, high: c.high, low: c.low, close: c.close })));
    left.timeScale().fitContent(); right.timeScale().fitContent();
  }, [currentCandles, currentIndex, historicalCandles, historicalIndex, patternLength]);

  useEffect(() => {
    const left = leftChartRef.current; const right = rightChartRef.current; if (!left || !right) return;
    const sync = (source: IChartApi, target: IChartApi) => { const range = source.timeScale().getVisibleLogicalRange(); if (range) target.timeScale().setVisibleLogicalRange(range); };
    const onLeft = () => sync(left, right); const onRight = () => sync(right, left);
    left.timeScale().subscribeVisibleLogicalRangeChange(onLeft); right.timeScale().subscribeVisibleLogicalRangeChange(onRight);
    return () => { left.timeScale().unsubscribeVisibleLogicalRangeChange(onLeft); right.timeScale().unsubscribeVisibleLogicalRangeChange(onRight); };
  }, []);

  return <div className="grid gap-3 lg:grid-cols-2">
    <section className="overflow-hidden rounded-md border border-amber-300/15 bg-[#0d1219]">
      <div className="flex items-center justify-between border-b border-white/8 px-3 py-2"><div><div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-white/30">Replay · Current</div><div className="mt-0.5 text-[11px] font-semibold text-white/75">Selected replay point</div></div><span className="rounded bg-amber-300/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-amber-200">Live context</span></div>
      <div ref={leftRef} className="h-[380px] w-full" />
      <div className="border-t border-white/8 px-3 py-2 text-[8px] uppercase tracking-[0.08em] text-white/25">Highlighted window · {Math.min(patternLength, currentVisible.length)} candles</div>
    </section>
    <section className="overflow-hidden rounded-md border border-white/10 bg-[#0d1219]">
      <div className="flex items-center justify-between border-b border-white/8 px-3 py-2"><div><div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-white/30">Historical match</div><div className="mt-0.5 text-[11px] font-semibold text-white/75">{match ? `${match.similarity_score.toFixed(2)}% similarity` : "Select a memory match"}</div></div>{match && <span className="font-mono text-[8px] text-white/25">{match.start_time} → {match.end_time}</span>}</div>
      <div ref={rightRef} className="h-[380px] w-full" />
      <div className="border-t border-white/8 px-3 py-2 text-[8px] uppercase tracking-[0.08em] text-white/25">Same pattern window · future path remains hidden until replay advances</div>
    </section>
  </div>;
}
