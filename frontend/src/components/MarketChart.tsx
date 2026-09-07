"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, createChart, type CandlestickData, type Time } from "lightweight-charts";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type MarketChartProps = { symbol: string; timeframe: string; patternLength: number };

function positionPatternBox(chart: ReturnType<typeof createChart>, box: HTMLDivElement, candles: Candle[], patternLength: number) {
  if (candles.length < patternLength) return;
  const first = candles[candles.length - patternLength];
  const last = candles[candles.length - 1];
  const left = chart.timeScale().timeToCoordinate(first.time as Time);
  const right = chart.timeScale().timeToCoordinate(last.time as Time);
  if (left == null || right == null) return;
  box.style.left = `${Math.max(0, Math.min(left, right) - 5)}px`;
  box.style.width = `${Math.max(12, Math.abs(right - left) + 10)}px`;
  box.style.display = "block";
}

export default function MarketChart({ symbol, timeframe, patternLength }: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const patternBoxRef = useRef<HTMLDivElement | null>(null);
  const candlesRef = useRef<Candle[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 380,
      layout: { background: { type: ColorType.Solid, color: "#0d1219" }, textColor: "#8b95a7" },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      crosshair: { vertLine: { color: "rgba(255,255,255,0.18)" }, horzLine: { color: "rgba(255,255,255,0.18)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.10)" },
      timeScale: { borderColor: "rgba(255,255,255,0.10)", timeVisible: true, secondsVisible: false },
    });
    const series = chart.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444" });

    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({ width: containerRef.current.clientWidth });
      if (patternBoxRef.current) positionPatternBox(chart, patternBoxRef.current, candlesRef.current, patternLength);
    });
    resizeObserver.observe(container);

    async function loadCandles() {
      try {
        const limit = Math.min(Math.max(patternLength * 2, 60), 5000);
        const params = new URLSearchParams({ symbol, timeframe, limit: String(limit) });
        const response = await fetch(`/api/backend/api/v1/candles?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Candle API returned ${response.status}`);
        const result = await response.json();
        const candles = (result.candles as Candle[]) ?? [];
        candlesRef.current = candles;
        const data: CandlestickData<Time>[] = candles.map((candle) => ({ time: candle.time as Time, open: candle.open, high: candle.high, low: candle.low, close: candle.close }));
        series.setData(data);
        chart.timeScale().fitContent();
        if (patternBoxRef.current) positionPatternBox(chart, patternBoxRef.current, candles, patternLength);
      } catch (error) {
        console.error("Failed to load candles:", error);
      }
    }
    loadCandles();

    return () => { resizeObserver.disconnect(); chart.remove(); };
  }, [symbol, timeframe, patternLength]);

  return (
    <div ref={containerRef} className="relative h-[380px] w-full">
      <div ref={patternBoxRef} className="pointer-events-none absolute bottom-[28px] top-[8px] z-10 hidden border border-amber-300/70 bg-amber-300/[0.06]" aria-label={`Current ${patternLength}-candle matched pattern`}>
        <span className="absolute left-1 top-1 rounded bg-amber-300/90 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-black">Matched {patternLength}</span>
      </div>
    </div>
  );
}
