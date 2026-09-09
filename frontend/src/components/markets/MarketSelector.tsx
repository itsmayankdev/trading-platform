"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { normalizeMarketSymbol } from "@/lib/marketContext";

type Instrument = { symbol: string; base_asset?: string | null; quote_asset?: string | null; status?: string | null };
type MarketSelectorProps = { value: string; onChange: (symbol: string) => void; className?: string };

export default function MarketSelector({ value, onChange, className = "" }: MarketSelectorProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Instrument[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => setQuery(value), [value]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const search = query.trim().toUpperCase();
      const params = new URLSearchParams({ search, limit: "12", status: "TRADING" });
      try { const response = await fetch(`/api/backend/api/v1/instruments?${params.toString()}`, { cache: "no-store", signal: controller.signal }); if (!response.ok) return; const payload = await response.json(); setResults(Array.isArray(payload?.instruments) ? payload.instruments : []); } catch { if (!controller.signal.aborted) setResults([]); }
    }, 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);
  function choose(symbol: string) { const normalized = normalizeMarketSymbol(symbol); if (!normalized) return; onChange(normalized); setQuery(normalized); setOpen(false); }
  return <div className={`relative ${className}`}><div className="flex h-8 items-center rounded border border-white/10 bg-[#0d1219] px-2 focus-within:border-amber-200/30"><Search size={11} className="mr-1.5 shrink-0 text-white/25" /><input value={query} onChange={(event) => { setQuery(event.target.value.toUpperCase()); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={(event) => { if (event.key === "Enter") { const exact = results.find((item) => item.symbol === normalizeMarketSymbol(query)); choose(exact?.symbol || results[0]?.symbol || query); } if (event.key === "Escape") setOpen(false); }} placeholder="Search Binance Spot market" aria-label="Search Binance Spot market" className="w-full bg-transparent text-[11px] text-white/80 outline-none placeholder:text-white/20" /></div>{open && results.length > 0 && <div className="absolute left-0 top-9 z-50 max-h-64 w-[260px] overflow-auto rounded-md border border-white/10 bg-[#0b1017] p-1 shadow-2xl">{results.map((item) => <button key={item.symbol} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item.symbol)} className="flex w-full items-center justify-between rounded px-2.5 py-2 text-left hover:bg-white/[.05]"><span><span className="block text-[11px] font-medium text-white/75">{item.symbol}</span><span className="block text-[9px] text-white/25">{item.base_asset || item.symbol} · {item.quote_asset || ""}</span></span><span className="text-[8px] uppercase tracking-wider text-emerald-300/55">{item.status || "TRADING"}</span></button>)}</div>}</div>;
}
