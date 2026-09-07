"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Loader2 } from "lucide-react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import type { Match } from "./types";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type Props = {
  symbol: string;
  timeframe: string;
  patternLength: number;
  matches: Match[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default function HistoricalPatternChart({ symbol, timeframe, patternLength, matches }: Props) {
  const [index, setIndex] = useState(0);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const match = matches[index];

  useEffect(() => {
    setIndex(0);
  }, [symbol, timeframe, patternLength, matches]);

  useEffect(() => {
    if (!match) return;

    const controller = new AbortController();
    setLoading(true);
    setError("");

    const params = new URLSearchParams({
      symbol,
      timeframe,
      limit: String(Math.min(patternLength + 60, 5000)),
      start_time: match.start_time,
      end_time: match.end_time,
    });

    fetch(`/api/backend/api/v1/candles?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Historical candle API returned ${response.status}`);
        const result = (await response.json()) as { candles: Candle[] };
        setCandles(result.candles ?? []);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setCandles([]);
        setError("Could not load this historical pattern.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [match, symbol, timeframe, patternLength]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 360,
      layout: {
        background: { type: ColorType.Solid, color: "#0b1017" },
        textColor: "#7f8999",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.035)" },
        horzLines: { color: "rgba(255,255,255,0.035)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
      crosshair: {
        vertLine: { color: "rgba(255,255,255,0.16)" },
        horzLine: { color: "rgba(255,255,255,0.16)" },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    resizeObserver.observe(container);

    if (candles.length) {
      const data: CandlestickData<Time>[] = candles.map((candle) => ({
        time: candle.time as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }));
      series.setData(data);
      chart.timeScale().fitContent();
    }

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles]);

  if (!match) {
    return <section className="panel p-6 text-sm text-white/35">No historical matches available.</section>;
  }

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="eyebrow">Historical pattern</div>
          <div className="mt-1 flex items-center gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Match {String(index + 1).padStart(2, "0")}</h2>
            <span className="rounded-md border border-white/8 bg-white/[0.025] px-2 py-1 font-mono text-[10px] text-white/45">
              {match.similarity_score.toFixed(2)}% similarity
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-white/30">
            <CalendarDays size={13} />
            {formatDate(match.start_time)} → {formatDate(match.end_time)} UTC
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous historical match"
            disabled={index === 0 || loading}
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/8 bg-white/[0.02] text-white/55 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-[92px] text-center font-mono text-[11px] text-white/35">
            {index + 1} / {matches.length}
          </div>
          <button
            type="button"
            aria-label="Next historical match"
            disabled={index === matches.length - 1 || loading}
            onClick={() => setIndex((value) => Math.min(matches.length - 1, value + 1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/8 bg-white/[0.02] text-white/55 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b1017]/70 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-xs text-white/45"><Loader2 size={15} className="animate-spin" /> Loading historical candles</div>
          </div>
        )}
        {error && <div className="absolute left-4 top-4 z-10 rounded-md border border-red-400/15 bg-[#0b1017] px-3 py-2 text-xs text-red-300">{error}</div>}
        <div ref={containerRef} className="h-[360px] w-full" />
      </div>

      <div className="grid grid-cols-2 border-t border-white/8 sm:grid-cols-4">
        {[
          ["+5", 5],
          ["+15", 15],
          ["+30", 30],
          ["+60", 60],
        ].map(([label, horizon]) => {
          const outcome = match.outcomes.find((item) => item.horizon_candles === horizon);
          return (
            <div key={String(label)} className="border-r border-white/6 px-4 py-3 last:border-r-0">
              <div className="text-[9px] uppercase tracking-[0.14em] text-white/25">{label} candles</div>
              <div className={`mt-1 font-mono text-sm ${outcome && outcome.forward_return >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {outcome ? `${outcome.forward_return >= 0 ? "+" : ""}${(outcome.forward_return * 100).toFixed(2)}%` : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
