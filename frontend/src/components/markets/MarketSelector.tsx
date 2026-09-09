"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { normalizeMarketSymbol } from "@/lib/marketContext";

type Instrument = { symbol: string; base_asset?: string | null; quote_asset?: string | null; status?: string | null; quote_volume_24h?: number | null };
type MarketSelectorProps = { value: string; onChange: (symbol: string) => void; className?: string };
type CacheEntry = { at: number; items: Instrument[] };
const CACHE_TTL = 30_000;
const resultCache = new Map<string, CacheEntry>();

function compactVolume(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function rankAndDeduplicate(items: Instrument[], query: string) {
  const normalizedQuery = normalizeMarketSymbol(query);
  const ranked = [...items].sort((a, b) => {
    const aExact = normalizeMarketSymbol(a.symbol) === normalizedQuery ? 1 : 0;
    const bExact = normalizeMarketSymbol(b.symbol) === normalizedQuery ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    const aBase = normalizeMarketSymbol(a.base_asset || "");
    const bBase = normalizeMarketSymbol(b.base_asset || "");
    const aBaseExact = aBase === normalizedQuery ? 1 : 0;
    const bBaseExact = bBase === normalizedQuery ? 1 : 0;
    if (aBaseExact !== bBaseExact) return bBaseExact - aBaseExact;
    return (b.quote_volume_24h ?? 0) - (a.quote_volume_24h ?? 0);
  });
  const seen = new Set<string>();
  return ranked.filter((item) => {
    const key = normalizeMarketSymbol(item.base_asset || item.symbol);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

export default function MarketSelector({ value, onChange, className = "" }: MarketSelectorProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Instrument[]>(() => resultCache.get(`q:${value.toUpperCase()}`)?.items ?? []);
  const [open, setOpen] = useState(false);
  const [browseMode, setBrowseMode] = useState(false);

  useEffect(() => setQuery(value), [value]);
  useEffect(() => {
    const controller = new AbortController();
    const search = browseMode ? "" : query.trim().toUpperCase();
    const key = `${browseMode ? "b" : "q"}:${search}`;
    const cached = resultCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL) {
      setResults(cached.items);
      return () => controller.abort();
    }
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ search, limit: "30", status: "TRADING", sort: "volume" });
      try {
        const response = await fetch(`/api/backend/api/v1/instruments?${params.toString()}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const payload = await response.json();
        const raw = Array.isArray(payload?.instruments) ? payload.instruments as Instrument[] : [];
        const items = rankAndDeduplicate(raw, search);
        resultCache.set(key, { at: Date.now(), items });
        setResults(items);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      }
    }, 60);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, browseMode]);

  function choose(symbol: string) {
    const normalized = normalizeMarketSymbol(symbol);
    if (!normalized) return;
    onChange(normalized);
    setQuery(normalized);
    setBrowseMode(false);
    setOpen(false);
  }

  return <div className={`relative ${className}`}>
    <div className="flex h-8 items-center rounded border border-white/10 bg-[#0d1219] px-2 focus-within:border-amber-200/30">
      <Search size={11} className="mr-1.5 shrink-0 text-white/25" />
      <input value={query} onChange={(event) => { setQuery(event.target.value.toUpperCase()); setBrowseMode(false); setOpen(true); }} onFocus={() => { setBrowseMode(true); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Enter") { const exact = results.find((item) => normalizeMarketSymbol(item.symbol) === normalizeMarketSymbol(query)); choose(exact?.symbol || results[0]?.symbol || query); } if (event.key === "Escape") setOpen(false); }} placeholder="Search Binance Spot market" aria-label="Search Binance Spot market" className="w-full bg-transparent text-[11px] text-white/80 outline-none placeholder:text-white/20" />
    </div>
    {open && results.length > 0 && <div className="absolute left-0 top-9 z-50 max-h-72 w-[300px] overflow-auto rounded-md border border-white/10 bg-[#0b1017] p-1 shadow-2xl">
      {results.map((item) => <button key={item.symbol} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item.symbol)} className="flex w-full items-center justify-between rounded px-2.5 py-2 text-left hover:bg-white/[.05]">
        <span className="min-w-0"><span className="block truncate text-[11px] font-medium text-white/75">{item.base_asset || item.symbol} <span className="text-white/30">· {item.symbol}</span></span><span className="block text-[9px] text-white/25">{item.quote_asset || ""} · 24h volume {compactVolume(item.quote_volume_24h)}</span></span>
        <span className="ml-3 shrink-0 text-[8px] uppercase tracking-wider text-emerald-300/55">{item.status || "TRADING"}</span>
      </button>)}
    </div>}
  </div>;
}
