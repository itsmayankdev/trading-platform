"use client";

import { Search, SlidersHorizontal } from "lucide-react";

type SearchControlsProps = {
  symbol: string;
  timeframe: string;
  patternLength: string;
  loading: boolean;
  onSymbolChange: (value: string) => void;
  onTimeframeChange: (value: string) => void;
  onPatternLengthChange: (value: string) => void;
  onSearch: () => void;
};

const fieldClass =
  "mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#080b10] px-3 text-sm text-white outline-none transition focus:border-white/25 focus:ring-1 focus:ring-white/10";

export default function SearchControls({
  symbol,
  timeframe,
  patternLength,
  loading,
  onSymbolChange,
  onTimeframeChange,
  onPatternLengthChange,
  onSearch,
}: SearchControlsProps) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="icon-box">
            <SlidersHorizontal size={16} />
          </div>
          <div>
            <h2 className="section-title">Search configuration</h2>
            <p className="section-subtitle">Define the market window to compare.</p>
          </div>
        </div>
        <span className="hidden rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white/40 sm:block">
          V1 engine
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.35fr]">
        <label className="field-label">
          Symbol
          <select value={symbol} onChange={(e) => onSymbolChange(e.target.value)} className={fieldClass}>
            <option value="ETHUSDT">ETHUSDT</option>
            <option value="BTCUSDT">BTCUSDT</option>
            <option value="SOLUSDT">SOLUSDT</option>
          </select>
        </label>

        <label className="field-label">
          Timeframe
          <select value={timeframe} onChange={(e) => onTimeframeChange(e.target.value)} className={fieldClass}>
            <option value="5m">5 minutes</option>
            <option value="15m">15 minutes</option>
            <option value="1h">1 hour</option>
          </select>
        </label>

        <label className="field-label">
          Pattern length
          <select value={patternLength} onChange={(e) => onPatternLengthChange(e.target.value)} className={fieldClass}>
            <option value="20">20 candles</option>
            <option value="30">30 candles</option>
            <option value="45">45 candles</option>
            <option value="60">60 candles</option>
            <option value="90">90 candles</option>
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="button"
            onClick={onSearch}
            disabled={loading}
            className="primary-button h-11 w-full"
          >
            <Search size={16} />
            {loading ? "Searching market memory…" : "Search market memory"}
          </button>
        </div>
      </div>
    </section>
  );
}
