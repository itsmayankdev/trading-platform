"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type CandlestickData, type Time } from "lightweight-charts";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type MarketChartProps = { symbol: string; timeframe: string; limit?: number };

export default function MarketChart({ symbol, timeframe, limit = 200 }: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 360,
      layout: { background: { type: ColorType.Solid, color: "#0d1219" }, textColor: "#8b95a7" },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      crosshair: { vertLine: { color: "rgba(255,255,255,0.18)" }, horzLine: { color: "rgba(255,255,255,0.18)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.10)" },
      timeScale: { borderColor: "rgba(255,255,255,0.10)", timeVisible: true, secondsVisible: false },
    });
    const series = chart.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444" });
    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver(() => { if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth }); });
    resizeObserver.observe(container);

    async function loadCandles() {
      try {
        const params = new URLSearchParams({ symbol, timeframe, limit: String(limit) });
        const response = await fetch(`/api/backend/api/v1/candles?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Candle API returned ${response.status}`);
        const result = await response.json();
        const candles: CandlestickData<Time>[] = (result.candles as Candle[]).map((candle) => ({ time: candle.time as Time, open: candle.open, high: candle.high, low: candle.low, close: candle.close }));
        series.setData(candles);
        chart.timeScale().fitContent();
      } catch (error) {
        console.error("Failed to load candles:", error);
      }
    }
    loadCandles();

    return () => { resizeObserver.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, [symbol, timeframe, limit]);

  return <div ref={containerRef} className="h-[360px] w-full" />;
}
