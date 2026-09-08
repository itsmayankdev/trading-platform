"use client";

import { Search } from "lucide-react";

type SearchControlsProps = {
  symbol: string;
  timeframe: string;
  patternLength: string;
  topK: string;
  loading: boolean;
  onSymbolChange: (value: string) => void;
  onTimeframeChange: (value: string) => void;
  onPatternLengthChange: (value: string) => void;
  onTopKChange: (value: string) => void;
};

const fieldClass =
  "h-9 rounded-md border border-white/10 bg-[#080b10] px-2.5 text-xs font-medium text-white outline-none transition focus:border-white/25 focus:ring-1 focus:ring-white/10";

export default function SearchControls({
  symbol,
  timeframe,
  patternLength,
  topK,
  loading,
  onSymbolChange,
  onTimeframeChange,
  onPatternLengthChange,
  onTopKChange,
}: SearchControlsProps) {
  return (
    <section className="border-b border-white/8 bg-[#090d13] px-3 py-2 sm:px-4">
      <div className="flex items-center gap-2 overflow-x-auto">
        <div className="mr-1 flex shrink-0 items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-white/30">
          <span className="flex h-5 w-5 items-center justify-center rounded border border-white/8 bg-white/[0.025]"><Search size={11} /></span>
          Market
        </div>
        <label className="shrink-0">
          <span className="sr-only">Symbol</span>
          <select value={symbol} onChange={(e) => onSymbolChange(e.target.value)} className={`${fieldClass} w-[120px]`}>
            <option value="ETHUSDT">ETHUSDT</option><option value="BTCUSDT">BTCUSDT</option><option value="SOLUSDT">SOLUSDT</option>
          </select>
        </label>
        <label className="shrink-0">
          <span className="sr-only">Timeframe</span>
          <select value={timeframe} onChange={(e) => onTimeframeChange(e.target.value)} className={`${fieldClass} w-[92px]`}>
            <option value="5m">5 minutes</option><option value="15m">15 minutes</option><option value="1h">1 hour</option>
          </select>
        </label>
        <label className="shrink-0">
          <span className="sr-only">Pattern length</span>
          <select value={patternLength} onChange={(e) => onPatternLengthChange(e.target.value)} className={`${fieldClass} w-[110px]`}>
            <option value="20">20 candles</option><option value="30">30 candles</option><option value="45">45 candles</option><option value="60">60 candles</option><option value="90">90 candles</option>
          </select>
        </label>
        <label className="flex shrink-0 items-center gap-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/30">Matches</span>
          <input
            type="number"
            min={5}
            max={50}
            step={1}
            inputMode="numeric"
            value={topK}
            onChange={(e) => onTopKChange(e.target.value)}
            onBlur={() => {
              const parsed = Number(topK);
              if (!Number.isFinite(parsed)) onTopKChange("10");
              else onTopKChange(String(Math.min(50, Math.max(5, Math.round(parsed)))));
            }}
            className={`${fieldClass} w-[76px] text-center tabular-nums`}
            aria-label="Number of historical matches"
            title="Historical matches to retrieve (5–50)"
          />
          <span className="text-[8px] text-white/20">5–50</span>
        </label>
        <div className="ml-1 flex h-9 shrink-0 items-center gap-2 border-l border-white/8 pl-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/30">
          <span className={`h-1.5 w-1.5 rounded-full ${loading ? "animate-pulse bg-amber-400" : "bg-emerald-400"}`} />
          {loading ? "Analyzing" : "Auto analysis"}
        </div>
      </div>
    </section>
  );
}
