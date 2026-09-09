"use client";

import { useEffect, useRef } from "react";
import { Maximize2, Minimize2, Pin, RotateCcw } from "lucide-react";
import { CandlestickSeries, ColorType, createChart, type CandlestickData, type IChartApi, type MouseEventParams, type Time } from "lightweight-charts";
import { getMarketCandles, prefetchMarketCandles, refreshMarketCandles, type CachedCandle } from "@/lib/marketCache";

type Candle = CachedCandle;
type MarketChartProps = { symbol: string; timeframe: string; patternLength: number; highlightLocked: boolean; dashboardFullscreen: boolean; onFullscreenToggle: () => void; onPin?: () => void };

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
const candleTimeFormatter = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

function positionPatternBox(chart: IChartApi, box: HTMLDivElement, candles: Candle[], patternLength: number) { if (candles.length < patternLength) return; const first = candles[candles.length - patternLength]; const last = candles[candles.length - 1]; const left = chart.timeScale().timeToCoordinate(first.time as Time); const right = chart.timeScale().timeToCoordinate(last.time as Time); if (left == null || right == null) return; box.style.left = `${Math.max(0, Math.min(left, right) - 4)}px`; box.style.width = `${Math.max(14, Math.abs(right - left) + 8)}px`; }
function formatNumber(value: number) { return numberFormatter.format(value); }
function formatVolume(value: number) { if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`; if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`; if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`; return formatNumber(value); }
function formatCandleTime(value: number) { return candleTimeFormatter.format(new Date(value * 1000)); }

export default function MarketChart({ symbol, timeframe, patternLength, highlightLocked, dashboardFullscreen, onFullscreenToggle, onPin }: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null); const chartRef = useRef<IChartApi | null>(null); const patternBoxRef = useRef<HTMLDivElement | null>(null); const tooltipRef = useRef<HTMLDivElement | null>(null); const candlesRef = useRef<Candle[]>([]); const candleByTimeRef = useRef<Map<number, Candle>>(new Map()); const renderedSignatureRef = useRef<string>("");
  function hideTooltip() { if (tooltipRef.current) tooltipRef.current.style.opacity = "0"; }
  function fitChart() { chartRef.current?.timeScale().fitContent(); if (chartRef.current && patternBoxRef.current) positionPatternBox(chartRef.current, patternBoxRef.current, candlesRef.current, patternLength); hideTooltip(); }

  useEffect(() => {
    const container = containerRef.current; if (!container) return; let disposed = false;
    const chart = createChart(container, { width: container.clientWidth, height: Math.max(300, container.clientHeight), layout: { background: { type: ColorType.Solid, color: "#0d1219" }, textColor: "#8b95a7" }, grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } }, crosshair: { vertLine: { color: "rgba(255,255,255,0.18)" }, horzLine: { color: "rgba(255,255,255,0.18)" } }, rightPriceScale: { borderColor: "rgba(255,255,255,0.10)" }, timeScale: { borderColor: "rgba(255,255,255,0.10)", timeVisible: true, secondsVisible: false }, handleScroll: highlightLocked ? false : true, handleScale: highlightLocked ? false : true });
    chartRef.current = chart;
    const series = chart.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444" });
    const resizeObserver = new ResizeObserver(() => { if (disposed || !containerRef.current) return; chart.applyOptions({ width: containerRef.current.clientWidth, height: Math.max(300, containerRef.current.clientHeight) }); if (!disposed && patternBoxRef.current) positionPatternBox(chart, patternBoxRef.current, candlesRef.current, patternLength); });
    resizeObserver.observe(container);

    function handleCrosshairMove(param: MouseEventParams<Time>) { if (disposed) return; const tooltip = tooltipRef.current; if (!tooltip || param.point == null || param.time == null) { hideTooltip(); return; } const candle = candleByTimeRef.current.get(Number(param.time)); if (!candle) { hideTooltip(); return; } const change = candle.open !== 0 ? ((candle.close - candle.open) / candle.open) * 100 : 0; const matched = candlesRef.current.length >= patternLength && candlesRef.current.indexOf(candle) >= candlesRef.current.length - patternLength; tooltip.innerHTML = `<div class="mb-1 font-mono text-[9px] text-white/40">${formatCandleTime(candle.time)} UTC</div><div class="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px]"><span class="text-white/35">O <b class="font-medium text-white/75">${formatNumber(candle.open)}</b></span><span class="text-white/35">H <b class="font-medium text-white/75">${formatNumber(candle.high)}</b></span><span class="text-white/35">L <b class="font-medium text-white/75">${formatNumber(candle.low)}</b></span><span class="text-white/35">C <b class="font-medium ${change >= 0 ? "text-emerald-300" : "text-rose-300"}">${formatNumber(candle.close)}</b></span><span class="col-span-2 text-white/35">VOL <b class="font-medium text-white/70">${formatVolume(candle.volume)}</b></span>${matched ? '<span class="col-span-2 mt-0.5 border-t border-amber-300/10 pt-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-amber-200/80">Matched pattern candle</span>' : ""}</div>`; const x = Math.min(Math.max(param.point.x + 12, 8), Math.max(8, container.clientWidth - 142)); const y = Math.min(Math.max(param.point.y - 18, 8), Math.max(8, container.clientHeight - 82)); tooltip.style.left = `${x}px`; tooltip.style.top = `${y}px`; tooltip.style.opacity = "1"; }
    chart.subscribeCrosshairMove(handleCrosshairMove);

    function render(candles: Candle[]) {
      if (disposed || candles.length === 0) return;
      const first = candles[0]; const last = candles[candles.length - 1];
      const signature = `${candles.length}:${first.time}:${last.time}:${last.close}`;
      candlesRef.current = candles;
      candleByTimeRef.current = new Map(candles.map((candle) => [candle.time, candle]));
      if (signature === renderedSignatureRef.current) return;
      renderedSignatureRef.current = signature;
      const data: CandlestickData<Time>[] = candles.map((candle) => ({ time: candle.time as Time, open: candle.open, high: candle.high, low: candle.low, close: candle.close }));
      series.setData(data);
      chart.timeScale().fitContent();
      if (!disposed && patternBoxRef.current) positionPatternBox(chart, patternBoxRef.current, candles, patternLength);
    }

    // Paint retained data immediately. Then revalidate in the background so a
    // market switch is not blocked by provider/DB latency.
    const cached = getMarketCandles(symbol, timeframe);
    if (cached) {
      render(cached);
      void refreshMarketCandles(symbol, timeframe, Math.max(patternLength * 2, 120)).then(render).catch((error) => { if (!disposed) console.error("Failed to refresh candles:", error); });
    } else {
      void prefetchMarketCandles(symbol, timeframe, Math.max(patternLength * 2, 120)).then(render).catch((error) => { if (!disposed) console.error("Failed to load candles:", error); });
    }

    return () => { disposed = true; resizeObserver.disconnect(); chart.unsubscribeCrosshairMove(handleCrosshairMove); hideTooltip(); candleByTimeRef.current.clear(); if (chartRef.current === chart) chartRef.current = null; chart.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, patternLength]);

  useEffect(() => { if (!chartRef.current) return; chartRef.current.applyOptions({ handleScroll: highlightLocked ? false : true, handleScale: highlightLocked ? false : true }); if (patternBoxRef.current) positionPatternBox(chartRef.current, patternBoxRef.current, candlesRef.current, patternLength); }, [highlightLocked, patternLength]);

  return <div ref={containerRef} onMouseLeave={hideTooltip} className={`group relative w-full ${dashboardFullscreen ? "min-h-0 flex-1" : "h-[380px]"}`}><div ref={tooltipRef} className="pointer-events-none absolute z-50 w-[134px] rounded-md border border-white/10 bg-[#090d13]/95 px-2 py-1.5 opacity-0 shadow-2xl backdrop-blur-sm transition-opacity" /><div onMouseEnter={hideTooltip} className="pointer-events-none absolute right-2 top-2 z-30 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100"><button type="button" aria-label="Pin current chart pattern" title="Pin pattern to Favorites" onClick={onPin} className="pointer-events-auto flex h-7 items-center gap-1 rounded border border-white/10 bg-[#090d13]/90 px-2 text-[8px] font-semibold uppercase tracking-[0.1em] text-white/60 shadow-lg backdrop-blur hover:text-amber-200"><Pin size={11} /> Pin</button><button type="button" aria-label="Fit chart to visible candles" title="Fit chart" onClick={fitChart} className="pointer-events-auto flex h-7 items-center gap-1 rounded border border-white/10 bg-[#090d13]/90 px-2 text-[8px] font-semibold uppercase tracking-[0.1em] text-white/60 shadow-lg backdrop-blur hover:text-white"><RotateCcw size={11} /> Fit</button><button type="button" aria-label={dashboardFullscreen ? "Exit fullscreen" : "Open both charts fullscreen"} title={dashboardFullscreen ? "Exit fullscreen" : "Open both charts fullscreen"} onClick={onFullscreenToggle} className="pointer-events-auto flex h-7 items-center justify-center rounded border border-white/10 bg-[#090d13]/90 px-2 text-white/60 shadow-lg backdrop-blur hover:text-white">{dashboardFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}</button></div>{highlightLocked && <div ref={patternBoxRef} className="pointer-events-none absolute bottom-[28px] top-[8px] z-10 border border-amber-300/75 bg-amber-300/[0.07]"><span className="pointer-events-none absolute left-1 top-1 rounded bg-amber-300/90 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-black">Matched {patternLength}</span></div>}{!highlightLocked && <div className="pointer-events-none absolute right-2 top-10 z-10 rounded bg-black/35 px-1.5 py-1 text-[8px] uppercase tracking-[0.1em] text-white/25">HLT off · chart movable</div>}</div>;
}
