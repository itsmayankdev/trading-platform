"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, createChart, type CandlestickData, type Time } from "lightweight-charts";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type MarketChartProps = { symbol: string; timeframe: string; patternLength: number };

function updatePatternBox(container: HTMLDivElement, box: HTMLDivElement, chart: ReturnType<typeof createChart>, candles: Candle[], patternLength: number) {
  if (candles.length < patternLength) return;
  const firstPattern = candles[candles.length - patternLength];
  const lastPattern = candles[candles.length - 1];
  const left = chart.timeScale().timeToCoordinate(firstPattern.time as Time);
  const right = chart.timeScale().timeToCoordinate(lastPattern.time as Time);
  if (left == null || right == null) return;
  const x = Math.max(0, Math.min(left, right) - 5);
  const width = Math.max(12, Math.abs(right - left) + 10);
  box.style.left = `${x}px`;
  box.style.width = `${width}px`;
  box.style.top = "8px";
  box.style.bottom = "28px";
  box.style.display = "block";
  container.dataset.patternReady = "true";
}

export default function MarketChart({ symbol, timeframe, patternLength }: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const patternBoxRef = useRef<HTMLDivElement | null>(null);

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
      const box = patternBoxRef.current;
      if (box && container.dataset.patternReady === "true") {
        const first = (series.dataByIndex(candlesRef.current.length - patternLength)?.time) as Time | undefined;
        const last = (series.dataByIndex(candlesRef.current.length - 1)?.time) as Time | undefined;
        if (first != null && last != null) {
          const left = chart.timeScale().timeToCoordinate(first);
          const right = chart.timeScale().timeToCoordinate(last);
          if (left != null && right != null) { box.style.left = `${Math.max(0, Math.min(left, right) - 5)}px`; box.style.width = `${Math.max(12, Math.abs(right - left) + 10)}px`; }
        }
      }
    });
    resizeObserver.observe(container);

    const candlesRefValue: Candle[] = [];
    const candlesRef = { current: candlesRefValue };
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
        const box = patternBoxRef.current;
        if (box) updatePatternBox(container, box, chart, candles, patternLength);
      } catch (error) {
        console.error("Failed to load candles:", error);
      }
    }
    loadCandles();

    return () => { resizeObserver.disconnect(); chart.remove(); };
  }, [symbol, timeframe, patternLength]);

  return (
    <div ref={containerRef} className="relative h-[380px] w-full">
      <div ref={patternBoxRef} className="pointer-events-none absolute z-10 hidden border border-amber-300/70 bg-amber-300/[0.06]" aria-label={`Current ${patternLength}-candle matched pattern`}>
        <span className="absolute left-1 top-1 rounded bg-amber-300/90 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-black">Matched {patternLength}</span>
      </div>
    </div>
  );
}
