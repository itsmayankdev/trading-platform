"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Check, ChevronDown, Trash2, Zap } from "lucide-react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";

type HistoricalMatch = { index: number; start: string; end: string; similarity: number };
type AlertRule = {
  id: string; symbol: string; timeframe: string; patternLength: number;
  sources: { current: boolean; historical: boolean; named: boolean };
  historicalMatchIndex?: number;
  namedPatterns: string[];
  similarity: number; agreement: number; useHistoricalFilters: boolean;
  matchMode: "any" | "all"; enabled: boolean; createdAt: string;
};

const KEY = "market-memory-alert-rules-v2";
const PATTERN_GROUPS = [
  { title: "Chart patterns", items: ["Head & Shoulders", "Inverse Head & Shoulders", "Double Top", "Double Bottom", "Triple Top", "Triple Bottom", "Ascending Triangle", "Descending Triangle", "Symmetrical Triangle", "Rising Wedge", "Falling Wedge", "Bull Flag", "Bear Flag", "Pennant", "Rectangle", "Cup & Handle"] },
  { title: "Candlestick patterns", items: ["Doji", "Hammer", "Shooting Star", "Bullish Engulfing", "Bearish Engulfing", "Morning Star", "Evening Star", "Three White Soldiers", "Three Black Crows"] },
];

function formatDate(value: string) { return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }

export default function AlertsPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [symbol, setSymbol] = useState("ETHUSDT");
  const [timeframe, setTimeframe] = useState("5m");
  const [patternLength, setPatternLength] = useState(45);
  const [similarity, setSimilarity] = useState(95);
  const [agreement, setAgreement] = useState(60);
  const [current, setCurrent] = useState(true);
  const [historical, setHistorical] = useState(false);
  const [named, setNamed] = useState(false);
  const [namedPatterns, setNamedPatterns] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState<"any" | "all">("any");
  const [useHistoricalFilters, setUseHistoricalFilters] = useState(true);
  const [historicalMatches, setHistoricalMatches] = useState<HistoricalMatch[]>([]);
  const [selectedHistorical, setSelectedHistorical] = useState(0);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { try { setRules(JSON.parse(localStorage.getItem(KEY) || "[]") as AlertRule[]); } catch { setRules([]); } }, []);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(rules)); }, [rules]);

  useEffect(() => {
    if (!historical) return;
    const controller = new AbortController();
    async function loadMatches() {
      setLoadingMatches(true);
      try {
        const params = new URLSearchParams({ symbol, timeframe, pattern_length: String(patternLength), top_k: "50" });
        const response = await fetch(`/api/backend/api/v1/pattern-search?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Unable to load historical matches");
        const data = await response.json() as { matches: { start_time: string; end_time: string; similarity_score: number }[] };
        setHistoricalMatches(data.matches.map((match, index) => ({ index, start: match.start_time, end: match.end_time, similarity: match.similarity_score })));
        setSelectedHistorical(0);
      } catch { if (!controller.signal.aborted) setHistoricalMatches([]); }
      finally { if (!controller.signal.aborted) setLoadingMatches(false); }
    }
    void loadMatches();
    return () => controller.abort();
  }, [historical, symbol, timeframe, patternLength]);

  const selectedMatch = historicalMatches[selectedHistorical];
  const selectedCount = Number(current) + Number(historical) + Number(named);
  const canSave = selectedCount > 0 && (!named || namedPatterns.length > 0) && (!historical || historicalMatches.length > 0);

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (current) parts.push("current structure");
    if (historical) parts.push(`historical chart #${(selectedHistorical + 1).toString()}`);
    if (namedPatterns.length) parts.push(namedPatterns.length === 1 ? namedPatterns[0] : `${namedPatterns.length} named patterns`);
    return parts.join(" + ");
  }, [current, historical, selectedHistorical, namedPatterns]);

  function toggleNamedPattern(name: string) { setNamedPatterns((items) => items.includes(name) ? items.filter((item) => item !== name) : [...items, name]); }
  function addRule() {
    if (!canSave) return;
    const rule: AlertRule = { id: crypto.randomUUID(), symbol, timeframe, patternLength, sources: { current, historical, named }, historicalMatchIndex: historical ? selectedHistorical : undefined, namedPatterns, similarity, agreement, useHistoricalFilters, matchMode, enabled: true, createdAt: new Date().toISOString() };
    setRules((items) => [rule, ...items]); setSaved(true); window.setTimeout(() => setSaved(false), 1800);
  }
  function toggle(id: string) { setRules((items) => items.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r)); }
  function remove(id: string) { setRules((items) => items.filter((r) => r.id !== id)); }

  return <main className="min-h-screen bg-[#070a0f] text-white"><header className="sticky top-0 z-40 h-12 border-b border-white/8 bg-[#070a0f]"><div className="flex h-full items-center px-4 sm:px-5"><Link href="/" className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black"><Bell size={14} /></div><span className="text-sm font-semibold tracking-[0.12em]">MARKET MEMORY</span></Link><div className="ml-4 border-l border-white/8 pl-4 text-[10px] uppercase tracking-[0.14em] text-white/30">Pattern Alerts</div></div></header>
    <div className="flex"><Sidebar symbol={symbol} collapsed={collapsed} onCollapsedChange={setCollapsed} onSymbolSelect={setSymbol} selectedSymbols={[symbol]} onWatchlistToggle={() => {}} /><div className="min-w-0 flex-1"><div className="mx-auto max-w-[1120px] px-4 py-6 sm:px-7 lg:px-10">
      <div className="mb-5"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/65">Pattern monitoring</div><h1 className="mt-1 text-2xl font-semibold tracking-tight">Pattern Alerts</h1><p className="mt-1 text-sm text-white/40">Choose exactly what you want to be alerted about. Every source is optional.</p></div>

      <section className="rounded-lg border border-white/8 bg-[#0a0e15] p-5"><div className="flex items-center gap-2"><Zap size={16} className="text-amber-200" /><h2 className="text-sm font-semibold">What should trigger the alert?</h2></div>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <button type="button" onClick={() => setCurrent(!current)} className={`rounded-lg border p-4 text-left transition ${current ? "border-amber-200/30 bg-amber-200/[0.045]" : "border-white/8 bg-white/[0.01]"}`}><div className="flex items-center justify-between"><span className="text-sm font-semibold">Current market structure</span><span className={`flex h-5 w-5 items-center justify-center rounded border ${current ? "border-amber-200/50 bg-amber-200 text-black" : "border-white/15"}`}>{current && <Check size={13} />}</span></div><div className="mt-1 text-[11px] text-white/35">Alert when the live chart starts resembling historical patterns.</div></button>
          <button type="button" onClick={() => setHistorical(!historical)} className={`rounded-lg border p-4 text-left transition ${historical ? "border-amber-200/30 bg-amber-200/[0.045]" : "border-white/8 bg-white/[0.01]"}`}><div className="flex items-center justify-between"><span className="text-sm font-semibold">A historical chart I choose</span><span className={`flex h-5 w-5 items-center justify-center rounded border ${historical ? "border-amber-200/50 bg-amber-200 text-black" : "border-white/15"}`}>{historical && <Check size={13} />}</span></div><div className="mt-1 text-[11px] text-white/35">Pick a specific past pattern and watch for similar setups.</div></button>
          <button type="button" onClick={() => setNamed(!named)} className={`rounded-lg border p-4 text-left transition ${named ? "border-amber-200/30 bg-amber-200/[0.045]" : "border-white/8 bg-white/[0.01]"}`}><div className="flex items-center justify-between"><span className="text-sm font-semibold">Named market patterns</span><span className={`flex h-5 w-5 items-center justify-center rounded border ${named ? "border-amber-200/50 bg-amber-200 text-black" : "border-white/15"}`}>{named && <Check size={13} />}</span></div><div className="mt-1 text-[11px] text-white/35">Head & shoulders, stars, engulfing, triangles and more.</div></button>
        </div>

        {(current || historical) && <div className="mt-4 rounded-md border border-white/7 bg-white/[0.015] p-4"><div className="grid gap-4 md:grid-cols-3"><label className="text-xs text-white/45">Market<select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="mt-2 h-9 w-full rounded-md border border-white/10 bg-[#080c12] px-2 text-sm text-white"><option>BTCUSDT</option><option>ETHUSDT</option><option>SOLUSDT</option></select></label><label className="text-xs text-white/45">Timeframe<select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="mt-2 h-9 w-full rounded-md border border-white/10 bg-[#080c12] px-2 text-sm text-white"><option>5m</option><option>15m</option><option>1h</option></select></label><label className="text-xs text-white/45">Pattern length<select value={patternLength} onChange={(e) => setPatternLength(Number(e.target.value))} className="mt-2 h-9 w-full rounded-md border border-white/10 bg-[#080c12] px-2 text-sm text-white"><option value={30}>30 candles</option><option value={45}>45 candles</option><option value={60}>60 candles</option></select></label></div>
          <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-xs text-white/45">Minimum historical similarity<select value={similarity} onChange={(e) => setSimilarity(Number(e.target.value))} className="mt-2 h-9 w-full rounded-md border border-white/10 bg-[#080c12] px-2 text-sm text-white">{[90,92,94,95,96,97,98].map((n) => <option key={n} value={n}>{n}% or higher</option>)}</select></label><label className="text-xs text-white/45">Minimum historical agreement<select value={agreement} onChange={(e) => setAgreement(Number(e.target.value))} className="mt-2 h-9 w-full rounded-md border border-white/10 bg-[#080c12] px-2 text-sm text-white">{[50,55,60,65,70,75].map((n) => <option key={n} value={n}>{n}% or higher</option>)}</select></label></div>
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-white/50"><input type="checkbox" checked={useHistoricalFilters} onChange={(e) => setUseHistoricalFilters(e.target.checked)} className="accent-white" />Use these historical filters for structure-based alerts</label>
        </div>}

        {historical && <div className="mt-3 rounded-md border border-white/7 bg-white/[0.015] p-4"><div className="flex items-center justify-between"><div><div className="text-xs font-semibold">Choose the historical chart</div><div className="mt-1 text-[10px] text-white/30">These are the same ranked historical matches used by Market Memory.</div></div><div className="text-[10px] text-white/25">{loadingMatches ? "Loading…" : `${historicalMatches.length} matches`}</div></div><div className="mt-3"><div className="relative"><select value={selectedHistorical} onChange={(e) => setSelectedHistorical(Number(e.target.value))} disabled={loadingMatches || historicalMatches.length === 0} className="h-10 w-full appearance-none rounded-md border border-white/10 bg-[#080c12] px-3 pr-9 text-sm text-white disabled:opacity-40">{historicalMatches.map((match) => <option key={match.index} value={match.index}>Match #{match.index + 1} · {match.similarity.toFixed(2)}% similarity · {formatDate(match.start)}</option>)}{historicalMatches.length === 0 && <option>No historical matches available</option>}</select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-white/25" /></div>{selectedMatch && <div className="mt-2 text-[10px] text-white/30">Selected chart: {formatDate(selectedMatch.start)} → {formatDate(selectedMatch.end)} · {selectedMatch.similarity.toFixed(2)}% similarity</div>}</div></div>}

        {named && <div className="mt-3 rounded-md border border-white/7 bg-white/[0.015] p-4"><div className="flex items-center justify-between"><div><div className="text-xs font-semibold">Pattern library</div><div className="mt-1 text-[10px] text-white/30">Select any patterns you want included. You can choose more than one.</div></div><span className="text-[10px] text-white/25">{namedPatterns.length} selected</span></div><div className="mt-4 space-y-4">{PATTERN_GROUPS.map((group) => <div key={group.title}><div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25">{group.title}</div><div className="flex flex-wrap gap-2">{group.items.map((pattern) => { const selected = namedPatterns.includes(pattern); return <button key={pattern} type="button" onClick={() => toggleNamedPattern(pattern)} className={`rounded-md border px-2.5 py-1.5 text-[11px] transition ${selected ? "border-amber-200/30 bg-amber-200/[0.08] text-amber-100" : "border-white/8 bg-white/[0.01] text-white/45 hover:bg-white/[0.03]"}`}>{selected && <Check size={11} className="mr-1 inline" />}{pattern}</button>; })}</div></div>)}</div></div>}

        <div className="mt-4 flex flex-col gap-3 border-t border-white/7 pt-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-[11px] text-white/45">Alert logic: <span className="text-white/70">{matchMode === "any" ? "any selected source" : "all selected sources"}</span> matches.</div><div className="mt-1 text-[10px] text-white/25">{summary || "Select at least one alert source."}</div></div><div className="flex items-center gap-2"><select value={matchMode} onChange={(e) => setMatchMode(e.target.value as "any" | "all")} className="h-9 rounded-md border border-white/10 bg-[#080c12] px-2 text-xs text-white"><option value="any">Any selected source</option><option value="all">All selected sources</option></select><button type="button" disabled={!canSave} onClick={addRule} className="rounded-md bg-white px-4 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-35">{saved ? "Saved" : "Save alert"}</button></div></div>
      </section>

      <section className="mt-5"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Saved alerts</h2><span className="text-[10px] text-white/25">{rules.length}</span></div>{rules.length === 0 ? <div className="rounded-lg border border-dashed border-white/10 px-5 py-10 text-center"><Bell size={20} className="mx-auto text-white/20" /><div className="mt-3 text-sm text-white/45">No alerts saved</div><div className="mt-1 text-xs text-white/25">Build an alert above and it will appear here.</div></div> : <div className="space-y-2">{rules.map((rule) => <div key={rule.id} className="flex items-center gap-4 rounded-lg border border-white/8 bg-[#0a0e15] px-4 py-3"><button type="button" onClick={() => toggle(rule.id)} className={`relative h-5 w-9 shrink-0 rounded-full ${rule.enabled ? "bg-emerald-400/70" : "bg-white/10"}`} aria-label={rule.enabled ? "Disable alert" : "Enable alert"}><span className={`absolute top-1 h-3 w-3 rounded-full bg-white ${rule.enabled ? "left-5" : "left-1"}`} /></button><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{rule.symbol.replace("USDT", "/USDT")} <span className="ml-2 text-[10px] font-normal text-white/25">{rule.timeframe} · {rule.patternLength} candles</span></div><div className="mt-1 text-[11px] text-white/35">{rule.sources.current && "Current structure"}{rule.sources.current && (rule.sources.historical || rule.sources.named) && " · "}{rule.sources.historical && `Historical #${(rule.historicalMatchIndex ?? 0) + 1}`}{rule.sources.historical && rule.sources.named && " · "}{rule.namedPatterns.length > 0 && (rule.namedPatterns.length === 1 ? rule.namedPatterns[0] : `${rule.namedPatterns.length} named patterns`)}{rule.useHistoricalFilters && <span className="text-white/20"> · {rule.similarity}%+ similarity · {rule.agreement}%+ agreement</span>}</div></div><button type="button" onClick={() => remove(rule.id)} className="rounded p-2 text-white/20 hover:text-rose-300" aria-label="Delete alert"><Trash2 size={14} /></button></div>)}</div>}</section>
      <div className="mt-4 rounded-md border border-white/8 bg-white/[0.015] px-3 py-2 text-[10px] leading-4 text-white/30">Your alert definitions are saved locally for now. The server alert engine will use these same source selections and thresholds when background monitoring is connected.</div>
    </div></div></div></main>;
}
