"use client";

import { Check, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  { value: "ETHUSDT", short: "ETH", name: "Ethereum", aliases: ["ether", "eth", "ethereum", "ethusdt"] },
  { value: "BTCUSDT", short: "BTC", name: "Bitcoin", aliases: ["btc", "bitcoin", "btc-usdt", "btcusdt"] },
  { value: "SOLUSDT", short: "SOL", name: "Solana", aliases: ["sol", "solana", "solusdt"] },
];

const TIMEFRAMES = [
  { value: "5m", label: "5m", detail: "5 minutes" },
  { value: "15m", label: "15m", detail: "15 minutes" },
  { value: "1h", label: "1H", detail: "1 hour" },
];

const PATTERN_LENGTHS = ["20", "30", "45", "60", "90"];
const MATCH_COUNTS = ["5", "10", "20", "50"];

const formatPrice = (value: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

function scoreSymbol(item: (typeof SYMBOLS)[number], query: string) {
  if (!query) return 0;
  const q = query.toLowerCase().trim();
  if (item.value.toLowerCase() === q || item.short.toLowerCase() === q) return 0;
  if (item.short.toLowerCase().startsWith(q)) return 1;
  if (item.name.toLowerCase().startsWith(q)) return 2;
  if (item.aliases.some((alias) => alias.startsWith(q))) return 3;
  if (item.name.toLowerCase().includes(q) || item.value.toLowerCase().includes(q)) return 4;
  if (item.aliases.some((alias) => alias.includes(q))) return 5;
  return 99;
}

function PillButton({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`h-8 shrink-0 rounded-md px-2.5 text-xs font-medium transition ${active ? "bg-white/[0.11] text-white ring-1 ring-white/[0.13]" : "text-white/45 hover:bg-white/[0.045] hover:text-white/80"}`}
    >
      {children}
    </button>
  );
}

export default function SearchControls({ symbol, timeframe, patternLength, topK, loading, liveQuote, onSymbolChange, onTimeframeChange, onPatternLengthChange, onTopKChange }: SearchControlsProps) {
  const [marketQuery, setMarketQuery] = useState("");
  const [marketFocused, setMarketFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedSymbol = SYMBOLS.find((item) => item.value === symbol) ?? SYMBOLS[0];

  const suggestions = useMemo(() => {
    const ranked = SYMBOLS
      .map((item) => ({ item, score: scoreSymbol(item, marketQuery) }))
      .filter(({ score }) => !marketQuery.trim() || score < 99)
      .sort((a, b) => a.score - b.score);
    return ranked.map(({ item }) => item);
  }, [marketQuery]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "/" || (event.ctrlKey && event.key.toLowerCase() === "k")) && !marketFocused) {
        const target = event.target as HTMLElement | null;
        if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") return;
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setMarketFocused(false);
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [marketFocused]);

  const selectSymbol = (value: string) => {
    onSymbolChange(value);
    setMarketQuery("");
    setMarketFocused(false);
    searchRef.current?.blur();
  };

  return (
    <section className="relative z-30 border-b border-white/[0.07] bg-[#080b10] px-3 py-2 sm:px-4">
      <div className="flex w-full min-w-0 items-center gap-2">
        <div className={`relative min-w-0 flex-1 sm:flex-none ${marketFocused ? "sm:w-[245px]" : "sm:w-[205px]"}`}>
          <div className={`flex h-9 w-full items-center gap-2 rounded-lg border bg-[#0b0f15] px-2.5 transition ${marketFocused ? "border-white/20 ring-1 ring-white/[0.05]" : "border-white/[0.09] hover:border-white/[0.15]"}`}>
            <Search size={14} className="shrink-0 text-white/35" />
            <input
              ref={searchRef}
              value={marketQuery}
              onChange={(event) => setMarketQuery(event.target.value)}
              onFocus={() => setMarketFocused(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && suggestions[0]) selectSymbol(suggestions[0].value);
              }}
              placeholder="Search market…"
              className="min-w-0 flex-1 bg-transparent text-xs font-medium text-white outline-none placeholder:text-white/28"
              aria-label="Search market"
              autoComplete="off"
            />
            {marketQuery ? (
              <button type="button" onClick={() => { setMarketQuery(""); searchRef.current?.focus(); }} className="text-white/30 hover:text-white/70" aria-label="Clear market search"><X size={13} /></button>
            ) : <kbd className="hidden rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-white/22 lg:block">/</kbd>}
          </div>

          {marketFocused && (
            <>
              <button type="button" aria-label="Close market suggestions" className="fixed inset-0 -z-10 cursor-default" onClick={() => setMarketFocused(false)} />
              <div className="absolute left-0 top-[calc(100%+7px)] w-[245px] overflow-hidden rounded-xl border border-white/[0.12] bg-[#0b0f15] p-1.5 shadow-2xl shadow-black/50">
                <div className="px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/25">Markets</div>
                {suggestions.length ? suggestions.map((item, index) => (
                  <button
                    key={item.value}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSymbol(item.value)}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition hover:bg-white/[0.055]"
                  >
                    <span className="min-w-0">
                      <span className="font-semibold text-white">{item.short}</span>
                      <span className="ml-2 text-xs text-white/40">{item.name}</span>
                      {index === 0 && marketQuery.trim() && <span className="ml-2 text-[9px] text-emerald-400/70">Best match</span>}
                    </span>
                    {item.value === symbol && <Check size={14} className="shrink-0 text-emerald-400" />}
                  </button>
                )) : <div className="px-2.5 py-3 text-xs text-white/35">No matching market.</div>}
              </div>
            </>
          )}
        </div>

        <div className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-[#0b0f15] px-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="font-mono text-xs font-semibold tabular-nums text-white/90">{liveQuote ? formatPrice(liveQuote.price) : "—"}</span>
          {liveQuote && <span className={`font-mono text-[10px] tabular-nums ${liveQuote.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{liveQuote.change >= 0 ? "+" : ""}{liveQuote.change.toFixed(2)}%</span>}
        </div>

        <div className="hidden h-6 w-px shrink-0 bg-white/[0.08] sm:block" />

        <div className="flex h-9 shrink-0 items-center rounded-lg border border-white/[0.08] bg-[#0b0f15] p-0.5" aria-label="Timeframe">
          {TIMEFRAMES.map((item) => <PillButton key={item.value} active={timeframe === item.value} onClick={() => onTimeframeChange(item.value)} title={item.detail}>{item.label}</PillButton>)}
        </div>

        <div className="hidden h-9 shrink-0 items-center gap-0.5 rounded-lg border border-white/[0.08] bg-[#0b0f15] p-0.5 md:flex" aria-label="Pattern length">
          {PATTERN_LENGTHS.map((value) => <PillButton key={value} active={patternLength === value} onClick={() => onPatternLengthChange(value)} title={`${value} candles`}>{value}</PillButton>)}
          <span className="px-1.5 text-[9px] uppercase tracking-[0.1em] text-white/25">candles</span>
        </div>

        <div className="hidden h-9 shrink-0 items-center gap-0.5 rounded-lg border border-white/[0.08] bg-[#0b0f15] p-0.5 lg:flex" aria-label="Historical matches">
          <span className="px-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/30">Matches</span>
          {MATCH_COUNTS.map((value) => <PillButton key={value} active={topK === value} onClick={() => onTopKChange(value)} title={`Show ${value} historical matches`}>{value}</PillButton>)}
        </div>

        <div className="ml-auto hidden text-[10px] font-medium text-white/25 xl:block">
          {loading ? <span className="flex items-center gap-1.5 text-amber-300/70"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />Updating</span> : ""}
        </div>

        <div className="flex h-9 shrink-0 items-center rounded-lg border border-white/[0.08] bg-[#0b0f15] px-2 md:hidden" title="Pattern settings">
          <SlidersHorizontal size={13} className="text-white/35" />
        </div>
      </div>
    </section>
  );
}
