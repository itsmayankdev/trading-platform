"use client";

import { useEffect, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import MarketSelector from "@/components/markets/MarketSelector";
import { normalizeMarketSymbol, readGlobalMarket, writeGlobalMarket } from "@/lib/marketContext";

const WATCHLIST_KEY = "market-memory-watchlist";

function readWatchlist() {
  try {
    const value = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]");
    return Array.isArray(value) ? Array.from(new Set(value.filter((item): item is string => typeof item === "string").map(normalizeMarketSymbol).filter(Boolean))).slice(-50) : [];
  } catch { return []; }
}

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [selected, setSelected] = useState(() => readGlobalMarket().symbol);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => setWatchlist(readWatchlist()), []);
  const persist = (next: string[]) => { setWatchlist(next); try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next)); } catch {} window.dispatchEvent(new Event("storage")); };
  const add = (symbol: string) => { const normalized = normalizeMarketSymbol(symbol); if (!normalized) return; persist(Array.from(new Set([...watchlist, normalized])).slice(-50)); writeGlobalMarket(normalized); setSelected(normalized); };
  const remove = (symbol: string) => persist(watchlist.filter((item) => item !== symbol));

  return <main className="min-h-screen bg-[#070a0f] text-white">
    <header className="sticky top-0 z-40 h-12 border-b border-white/8 bg-[#070a0f]"><div className="flex h-full items-center px-4 sm:px-5"><Link href="/" className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black"><Star size={14} fill="currentColor" /></div><span className="text-sm font-semibold tracking-[0.12em]">MARKET MEMORY</span></Link><div className="ml-4 border-l border-white/8 pl-4 text-[10px] uppercase tracking-[0.14em] text-white/30">Watchlist</div></div></header>
    <div className="flex"><Sidebar symbol={selected} collapsed={collapsed} onCollapsedChange={setCollapsed} onSymbolSelect={(symbol) => { writeGlobalMarket(symbol); setSelected(symbol); }} />
      <div className="min-w-0 flex-1"><div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-7 lg:px-10">
        <div className="mb-5"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/65">Favorites</div><h1 className="mt-1 text-2xl font-semibold tracking-tight">Watchlist</h1><p className="mt-1 text-sm text-white/40">Keep the markets you actively follow in one fast, reusable list.</p></div>
        <section className="panel p-4"><div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-white/35">Add market</div><div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center"><MarketSelector value={selected} onChange={add} className="w-full sm:max-w-[360px]" /><button type="button" onClick={() => add(selected)} className="flex h-8 items-center justify-center gap-1.5 rounded bg-amber-300 px-3 text-[9px] font-bold uppercase tracking-[0.1em] text-black"><Plus size={11}/>Add to watchlist</button></div></section>
        <section className="mt-3 panel overflow-hidden"><div className="border-b border-white/8 px-4 py-3"><div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/45">Saved markets</div><div className="mt-1 text-[10px] text-white/25">{watchlist.length} markets</div></div>{watchlist.length === 0 ? <div className="px-6 py-14 text-center text-xs text-white/30">No markets saved yet. Search above and add one.</div> : <div className="divide-y divide-white/6">{watchlist.map((market) => <div key={market} className="flex items-center justify-between px-4 py-3"><button type="button" onClick={() => { writeGlobalMarket(market); setSelected(market); }} className="font-mono text-xs text-white/65 hover:text-white">{market}</button><button type="button" onClick={() => remove(market)} aria-label={`Remove ${market}`} className="rounded border border-white/8 p-1.5 text-white/25 hover:border-rose-300/20 hover:text-rose-300"><Trash2 size={12}/></button></div>)}</div>}</section>
      </div></div>
    </div>
  </main>;
}
