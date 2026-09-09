"use client";

import { SlidersHorizontal } from "lucide-react";
import MarketSelector from "@/components/markets/MarketSelector";
import { normalizeMarketSymbol } from "@/lib/marketContext";
import { useEffect, useState } from "react";

type SearchControlsProps = {
  symbol: string;
  timeframe: string;
  patternLength: string;
  topK: string;
  loading: boolean;
  liveQuote?: { price: number; change: number } | null;
  onSymbolChange: (value: string) => void;
  onTimeframeChange: (value: string) => void;
  onPatternLengthChange: (value: string) => void;
  onTopKChange: (value: string) => void;
};

type MarketQuote = { price: number; change: number };

const TIMEFRAMES = [
  { value: "5m", label: "5m", detail: "5 minutes" },
  { value: "15m", label: "15m", detail: "15 minutes" },
  { value: "1h", label: "1H", detail: "1 hour" },
];
const PATTERN_LENGTHS = ["20", "30", "45", "60", "90"];
const MATCH_COUNTS = ["5", "10", "20", "50"];

const formatPrice = (value: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

function PillButton({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`h-8 shrink-0 rounded-md px-2.5 text-xs font-medium transition ${
        active
          ? "bg-white/[0.11] text-white ring-1 ring-white/[0.13]"
          : "text-white/45 hover:bg-white/[0.045] hover:text-white/80"
      }`}
    >
      {children}
    </button>
  );
}

export default function SearchControls({
  symbol,
  timeframe,
  patternLength,
  topK,
  loading,
  liveQuote,
  onSymbolChange,
  onTimeframeChange,
  onPatternLengthChange,
  onTopKChange,
}: SearchControlsProps) {
  const [market, setMarket] = useState<MarketQuote | null>(liveQuote ?? null);

  useEffect(() => setMarket(liveQuote ?? null), [liveQuote]);

  function selectMarket(value: string) {
    const normalized = normalizeMarketSymbol(value);
    if (normalized) onSymbolChange(normalized);
  }

  const currentLabel = symbol.includes("/")
    ? symbol
    : symbol.endsWith("USDT")
      ? `${symbol.slice(0, -4)}/USDT`
      : symbol;

  return (
    <section className="relative z-30 border-b border-white/[0.07] bg-[#080b10] px-3 py-2 sm:px-4">
      <div className="flex w-full min-w-0 items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:flex-none sm:w-[260px]">
          <MarketSelector value={symbol} onChange={selectMarket} className="w-full" />
        </div>

        <div className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-[#0b0f15] px-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="max-w-[100px] truncate text-[9px] font-semibold uppercase tracking-[0.05em] text-white/45">
            {currentLabel}
          </span>
          <span className="font-mono text-xs font-semibold tabular-nums text-white/90">
            {market ? formatPrice(market.price) : "—"}
          </span>
          {market && (
            <span className={`font-mono text-[10px] tabular-nums ${market.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {market.change >= 0 ? "+" : ""}{market.change.toFixed(2)}%
            </span>
          )}
        </div>

        <div className="hidden h-6 w-px shrink-0 bg-white/[0.08] sm:block" />

        <div className="flex h-9 shrink-0 items-center rounded-lg border border-white/[0.08] bg-[#0b0f15] p-0.5" aria-label="Timeframe">
          {TIMEFRAMES.map((item) => (
            <PillButton key={item.value} active={timeframe === item.value} onClick={() => onTimeframeChange(item.value)} title={item.detail}>
              {item.label}
            </PillButton>
          ))}
        </div>

        <div className="hidden h-9 shrink-0 items-center gap-0.5 rounded-lg border border-white/[0.08] bg-[#0b0f15] p-0.5 md:flex" aria-label="Pattern length">
          {PATTERN_LENGTHS.map((value) => (
            <PillButton key={value} active={patternLength === value} onClick={() => onPatternLengthChange(value)} title={`${value} candles`}>
              {value}
            </PillButton>
          ))}
          <span className="px-1.5 text-[9px] uppercase tracking-[0.1em] text-white/25">candles</span>
        </div>

        <div className="hidden h-9 shrink-0 items-center gap-0.5 rounded-lg border border-white/[0.08] bg-[#0b0f15] p-0.5 lg:flex" aria-label="Historical matches">
          <span className="px-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/30">Matches</span>
          {MATCH_COUNTS.map((value) => (
            <PillButton key={value} active={topK === value} onClick={() => onTopKChange(value)} title={`Show ${value} historical matches`}>
              {value}
            </PillButton>
          ))}
        </div>

        <div className="ml-auto hidden text-[10px] font-medium text-white/25 xl:block">
          {loading ? (
            <span className="flex items-center gap-1.5 text-amber-300/70">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" /> Updating
            </span>
          ) : ""}
        </div>

        <div className="flex h-9 shrink-0 items-center rounded-lg border border-white/[0.08] bg-[#0b0f15] px-2 md:hidden" title="Pattern settings">
          <SlidersHorizontal size={13} className="text-white/35" />
        </div>
      </div>
    </section>
  );
}
