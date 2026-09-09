"use client";

import { Check, ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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

const SYMBOLS = [
  { value: "ETHUSDT", name: "Ethereum", short: "ETH" },
  { value: "BTCUSDT", name: "Bitcoin", short: "BTC" },
  { value: "SOLUSDT", name: "Solana", short: "SOL" },
];

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

const prettyLength = (value: string) => `${value} candles`;

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
      className={`h-8 shrink-0 rounded-lg px-2.5 text-xs font-medium transition ${
        active
          ? "bg-white/[0.10] text-white shadow-sm ring-1 ring-white/[0.12]"
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
  const [marketOpen, setMarketOpen] = useState(false);
  const [marketQuery, setMarketQuery] = useState("");
  const selectedSymbol = SYMBOLS.find((item) => item.value === symbol) ?? SYMBOLS[0];

  const filteredSymbols = useMemo(() => {
    const query = marketQuery.trim().toLowerCase();
    if (!query) return SYMBOLS;
    return SYMBOLS.filter(
      (item) =>
        item.value.toLowerCase().includes(query) ||
        item.short.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query),
    );
  }, [marketQuery]);

  useEffect(() => {
    if (!marketOpen) setMarketQuery("");
  }, [marketOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "/" || (event.ctrlKey && event.key.toLowerCase() === "k")) && !marketOpen) {
        const target = event.target as HTMLElement | null;
        if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") return;
        event.preventDefault();
        setMarketOpen(true);
      }
      if (event.key === "Escape") setMarketOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [marketOpen]);

  return (
    <section className="relative z-30 border-b border-white/[0.07] bg-[#080b10] px-3 py-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto scrollbar-none">
        {/* Instrument search */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMarketOpen((open) => !open)}
            className={`group flex h-9 items-center gap-2 rounded-lg border px-2.5 transition ${
              marketOpen
                ? "border-white/20 bg-white/[0.07]"
                : "border-white/[0.09] bg-[#0b0f15] hover:border-white/[0.16] hover:bg-white/[0.035]"
            }`}
            aria-expanded={marketOpen}
            aria-haspopup="dialog"
            title="Search market · Press / or Ctrl+K"
          >
            <Search size={14} className="text-white/40 group-hover:text-white/70" />
            <span className="font-semibold tracking-tight text-white">{selectedSymbol.short}</span>
            <span className="hidden text-xs text-white/35 sm:inline">{selectedSymbol.name}</span>
            <ChevronDown size={13} className={`text-white/30 transition ${marketOpen ? "rotate-180" : ""}`} />
          </button>

          {marketOpen && (
            <div className="absolute left-0 top-[calc(100%+8px)] w-[290px] overflow-hidden rounded-xl border border-white/[0.12] bg-[#0b0f15] p-2 shadow-2xl shadow-black/50">
              <div className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.09] bg-[#070a0f] px-2.5">
                <Search size={14} className="text-white/35" />
                <input
                  autoFocus
                  value={marketQuery}
                  onChange={(event) => setMarketQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && filteredSymbols[0]) {
                      onSymbolChange(filteredSymbols[0].value);
                      setMarketOpen(false);
                    }
                  }}
                  placeholder="Search BTC, ETH, SOL..."
                  className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/25"
                />
                <kbd className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-white/25">/</kbd>
              </div>
              <div className="mt-2 space-y-1">
                {filteredSymbols.map((item) => {
                  const active = item.value === symbol;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        onSymbolChange(item.value);
                        setMarketOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition hover:bg-white/[0.055]"
                    >
                      <span>
                        <span className="font-semibold text-white">{item.short}</span>
                        <span className="ml-2 text-xs text-white/40">{item.name}</span>
                      </span>
                      {active && <Check size={14} className="text-emerald-400" />}
                    </button>
                  );
                })}
                {!filteredSymbols.length && <div className="px-2.5 py-3 text-xs text-white/35">No matching market.</div>}
              </div>
            </div>
          )}
        </div>

        {/* Live price */}
        <div className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-[#0b0f15] px-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="font-mono text-xs font-semibold tabular-nums text-white/90">
            {liveQuote ? formatPrice(liveQuote.price) : "—"}
          </span>
          {liveQuote && (
            <span className={`font-mono text-[10px] tabular-nums ${liveQuote.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {liveQuote.change >= 0 ? "+" : ""}{liveQuote.change.toFixed(2)}%
            </span>
          )}
        </div>

        <div className="h-6 w-px shrink-0 bg-white/[0.08]" />

        {/* Timeframe */}
        <div className="flex h-9 shrink-0 items-center rounded-lg border border-white/[0.08] bg-[#0b0f15] p-0.5" aria-label="Timeframe">
          {TIMEFRAMES.map((item) => (
            <PillButton
              key={item.value}
              active={timeframe === item.value}
              onClick={() => onTimeframeChange(item.value)}
              title={item.detail}
            >
              {item.label}
            </PillButton>
          ))}
        </div>

        {/* Pattern length */}
        <div className="hidden h-9 shrink-0 items-center gap-0.5 rounded-lg border border-white/[0.08] bg-[#0b0f15] p-0.5 md:flex" aria-label="Pattern length">
          {PATTERN_LENGTHS.map((value) => (
            <PillButton
              key={value}
              active={patternLength === value}
              onClick={() => onPatternLengthChange(value)}
              title={prettyLength(value)}
            >
              {value}
            </PillButton>
          ))}
          <span className="px-1.5 text-[9px] uppercase tracking-[0.1em] text-white/25">candles</span>
        </div>

        {/* Matches */}
        <div className="hidden h-9 shrink-0 items-center gap-0.5 rounded-lg border border-white/[0.08] bg-[#0b0f15] p-0.5 lg:flex" aria-label="Historical matches">
          <span className="px-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/30">Matches</span>
          {MATCH_COUNTS.map((value) => (
            <PillButton key={value} active={topK === value} onClick={() => onTopKChange(value)} title={`Show ${value} historical matches`}>
              {value}
            </PillButton>
          ))}
        </div>

        {/* Compact fallback for narrower widths */}
        <div className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-white/[0.08] bg-[#0b0f15] px-2 md:hidden">
          <SlidersHorizontal size={13} className="text-white/35" />
          <span className="text-[11px] font-medium text-white/65">{patternLength} · {topK}</span>
        </div>

        {/* Search state only; no persistent 'Auto Analysis' label */}
        {loading && <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] font-medium text-amber-300/70"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />Updating</span>}
      </div>
    </section>
  );
}
