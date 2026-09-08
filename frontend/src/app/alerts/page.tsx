"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Check, ChevronDown, CircleAlert, Loader2, Pin, Trash2, WandSparkles, Zap } from "lucide-react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import { FAVORITES_CHANGED_EVENT, readFavoritePatterns, type FavoritePattern } from "@/lib/favorites";

type HistoricalMatch = { index: number; start: string; end: string; similarity: number };
type AlertRule = {
  id: string;
  symbol: string;
  timeframe: string;
  patternLength: number;
  sources: { current: boolean; historical: boolean; named: boolean; favorites: boolean };
  favoriteIds?: string[];
  historicalMatchIndex?: number;
  namedPatterns: string[];
  similarity: number;
  agreement: number;
  useHistoricalFilters: boolean;
  matchMode: "any" | "all";
  enabled: boolean;
  createdAt: string;
};
type Evaluation = {
  symbol: string;
  timeframe: string;
  pattern_length: number;
  evaluated_at: string;
  triggered: boolean;
  match_mode: "any" | "all";
  sources: Array<{
    source: string;
    matched: boolean;
    similarity?: number | null;
    direction_agreement?: number | null;
    agreement_sample?: number;
    match_start?: string | null;
    match_end?: string | null;
    reason?: string;
    matches?: Array<{ id?: string; matched: boolean; similarity?: number | null; direction_agreement?: number | null; agreement_applicable?: boolean; reason?: string }>;
  }>;
};

const KEY = "market-memory-alert-rules-v2";
const PATTERN_GROUPS = [
  { title: "Chart patterns", items: ["Head & Shoulders", "Inverse Head & Shoulders", "Double Top", "Double Bottom", "Triple Top", "Triple Bottom", "Ascending Triangle", "Descending Triangle", "Symmetrical Triangle", "Rising Wedge", "Falling Wedge", "Bull Flag", "Bear Flag", "Pennant", "Rectangle", "Cup & Handle"] },
  { title: "Candlestick patterns", items: ["Doji", "Hammer", "Shooting Star", "Bullish Engulfing", "Bearish Engulfing", "Morning Star", "Evening Star", "Three White Soldiers", "Three Black Crows"] },
];

function formatDate(value: string) {
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function sourceLabel(rule: AlertRule, favorites: FavoritePattern[]) {
  const parts: string[] = [];
  if (rule.sources.current) parts.push("Current structure");
  if (rule.sources.favorites) {
    const names = (rule.favoriteIds ?? []).map((id) => favorites.find((item) => item.id === id)?.name).filter(Boolean) as string[];
    parts.push(names.length === 1 ? names[0] : `${names.length || "Pinned"} pinned charts`);
  }
  if (rule.sources.historical) parts.push(`Historical #${(rule.historicalMatchIndex ?? 0) + 1}`);
  if (rule.sources.named) parts.push(rule.namedPatterns.length === 1 ? rule.namedPatterns[0] : `${rule.namedPatterns.length} named patterns`);
  return parts.join(" · ");
}

function ToggleCard({ active, onClick, title, description, disabled = false }: { active: boolean; onClick: () => void; title: string; description: string; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`rounded-lg border p-4 text-left transition ${disabled ? "cursor-not-allowed border-white/6 bg-white/[0.01] opacity-45" : active ? "border-amber-200/30 bg-amber-200/[0.045]" : "border-white/8 bg-white/[0.01] hover:bg-white/[0.025]"}`}>
    <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{title}</span><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${active ? "border-amber-200/50 bg-amber-200 text-black" : "border-white/15"}`}>{active && <Check size={13} />}</span></div>
    <div className="mt-1 text-[11px] leading-5 text-white/35">{description}</div>
  </button>;
}

export default function AlertsPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [favorites, setFavorites] = useState<FavoritePattern[]>([]);
  const [symbol, setSymbol] = useState("ETHUSDT");
  const [timeframe, setTimeframe] = useState("5m");
  const [patternLength, setPatternLength] = useState(45);
  const [similarity, setSimilarity] = useState(95);
  const [agreement, setAgreement] = useState(60);
  const [current, setCurrent] = useState(true);
  const [favoritesSource, setFavoritesSource] = useState(false);
  const [historical, setHistorical] = useState(false);
  const [named, setNamed] = useState(false);
  const [selectedFavoriteIds, setSelectedFavoriteIds] = useState<string[]>([]);
  const [namedPatterns, setNamedPatterns] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState<"any" | "all">("any");
  const [useHistoricalFilters, setUseHistoricalFilters] = useState(true);
  const [historicalMatches, setHistoricalMatches] = useState<HistoricalMatch[]>([]);
  const [selectedHistorical, setSelectedHistorical] = useState(0);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [testError, setTestError] = useState("");
  const [lastPoll, setLastPoll] = useState<string | null>(null);

  useEffect(() => {
    try { setRules(JSON.parse(localStorage.getItem(KEY) || "[]") as AlertRule[]); } catch { setRules([]); }
  }, []);
  useEffect(() => {
    setFavorites(readFavoritePatterns());
    const refresh = () => setFavorites(readFavoritePatterns());
    window.addEventListener(FAVORITES_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(FAVORITES_CHANGED_EVENT, refresh);
  }, []);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(rules)); }, [rules]);
  useEffect(() => {
    if (typeof window === "undefined" || favorites.length === 0) return;
    const id = new URLSearchParams(window.location.search).get("favorite");
    if (!id) return;
    const favorite = favorites.find((item) => item.id === id);
    if (!favorite) return;
    setFavoritesSource(true);
    setSelectedFavoriteIds((items) => items.includes(id) ? items : [...items, id]);
    setSymbol(favorite.symbol);
    setTimeframe(favorite.timeframe);
    setPatternLength(favorite.patternLength);
  }, [favorites]);

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
  const selectedCount = Number(current) + Number(favoritesSource) + Number(historical);
  const canSave = selectedCount > 0 && (!favoritesSource || selectedFavoriteIds.length > 0) && (!historical || Boolean(selectedMatch)) && !named;
  const summary = useMemo(() => {
    const parts: string[] = [];
    if (current) parts.push("current structure");
    if (favoritesSource) parts.push(selectedFavoriteIds.length === 1 ? "1 pinned chart" : `${selectedFavoriteIds.length} pinned charts`);
    if (historical) parts.push(`historical chart #${selectedHistorical + 1}`);
    return parts.join(" + ");
  }, [current, favoritesSource, selectedFavoriteIds.length, historical, selectedHistorical]);

  function toggleFavorite(id: string) { setSelectedFavoriteIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]); }
  function toggleNamedPattern(name: string) { setNamedPatterns((items) => items.includes(name) ? items.filter((item) => item !== name) : [...items, name]); }

  async function evaluate(config: { rule?: AlertRule; live?: boolean } = {}) {
    const rule = config.rule;
    const sourceCurrent = rule ? rule.sources.current : current;
    const sourceFavorites = rule ? rule.sources.favorites : favoritesSource;
    const sourceHistorical = rule ? rule.sources.historical : historical;
    const favoriteIds = rule?.favoriteIds ?? selectedFavoriteIds;
    const selectedIndex = rule?.historicalMatchIndex ?? selectedHistorical;
    const match = historicalMatches[selectedIndex];
    if (!sourceCurrent && !sourceFavorites && !sourceHistorical) return null;
    if (rule?.sources.named || named) {
      setTestError("Named pattern detection is not wired to the evaluator yet. Use current structure, historical charts, or pinned charts for live checks.");
      return null;
    }
    if (sourceFavorites && favoriteIds.length === 0) throw new Error("Select at least one pinned chart");
    if (sourceHistorical && !match) throw new Error("Select a historical chart first");

    const body = {
      symbol: rule?.symbol ?? symbol,
      timeframe: rule?.timeframe ?? timeframe,
      pattern_length: rule?.patternLength ?? patternLength,
      minimum_similarity: rule?.similarity ?? similarity,
      minimum_agreement: rule?.agreement ?? agreement,
      use_historical_filters: rule?.useHistoricalFilters ?? useHistoricalFilters,
      current_enabled: sourceCurrent,
      favorites_enabled: sourceFavorites,
      historical_enabled: sourceHistorical,
      match_mode: rule?.matchMode ?? matchMode,
      favorite_windows: favoriteIds.map((id) => { const favorite = favorites.find((item) => item.id === id); return favorite ? { id: favorite.id, start_time: favorite.startTime, end_time: favorite.endTime } : null; }).filter(Boolean),
      historical_window: sourceHistorical && match ? { start_time: match.start, end_time: match.end } : null,
    };
    const response = await fetch("/api/backend/api/v1/alerts/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { detail?: string } | null;
      throw new Error(payload?.detail || "Alert evaluation failed");
    }
    const result = await response.json() as Evaluation;
    setEvaluation(result);
    setLastPoll(new Date().toISOString());
    if (result.triggered && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification(`Pattern alert: ${result.symbol} ${result.timeframe}`, { body: "Your configured pattern condition has triggered." });
    }
    return result;
  }

  async function testAlert() {
    setTesting(true); setTestError("");
    try { await evaluate(); }
    catch (error) { setEvaluation(null); setTestError(error instanceof Error ? error.message : "Alert evaluation failed"); }
    finally { setTesting(false); }
  }

  function addRule() {
    if (!canSave) return;
    const rule: AlertRule = { id: crypto.randomUUID(), symbol, timeframe, patternLength, sources: { current, favorites: favoritesSource, historical, named }, favoriteIds: favoritesSource ? selectedFavoriteIds : [], historicalMatchIndex: historical ? selectedHistorical : undefined, namedPatterns, similarity, agreement, useHistoricalFilters, matchMode, enabled: true, createdAt: new Date().toISOString() };
    setRules((items) => [rule, ...items]);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  function toggleRule(id: string) { setRules((items) => items.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r)); }
  function removeRule(id: string) { setRules((items) => items.filter((r) => r.id !== id)); }
  async function enableNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) { setTestError("Browser notifications are not supported here."); return; }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") setTestError("Notifications were not enabled. Live checks still run while this page is open.");
  }

  useEffect(() => {
    const enabledRules = rules.filter((rule) => rule.enabled && !rule.sources.named && (rule.sources.current || rule.sources.favorites || rule.sources.historical));
    if (enabledRules.length === 0) return;
    let cancelled = false;
    const run = async () => {
      for (const rule of enabledRules) {
        if (cancelled) return;
        try { await evaluate({ rule, live: true }); } catch { /* keep background polling quiet */ }
      }
    };
    void run();
    const interval = window.setInterval(() => { void run(); }, 60_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [rules, favorites, historicalMatches]);

  const inputClass = "mt-2 h-9 w-full rounded-md border border-white/10 bg-[#080c12] px-2.5 text-sm text-white outline-none focus:border-amber-200/30";

  return <main className="min-h-screen bg-[#070a0f] text-white">
    <header className="sticky top-0 z-40 h-12 border-b border-white/8 bg-[#070a0f]"><div className="flex h-full items-center px-4 sm:px-5"><Link href="/" className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black"><Bell size={14} /></div><span className="text-sm font-semibold tracking-[0.12em]">MARKET MEMORY</span></Link><div className="ml-4 border-l border-white/8 pl-4 text-[10px] uppercase tracking-[0.14em] text-white/30">Pattern Alerts</div></div></header>
    <div className="flex"><Sidebar symbol={symbol} collapsed={collapsed} onCollapsedChange={setCollapsed} onSymbolSelect={setSymbol} selectedSymbols={[symbol]} onWatchlistToggle={() => {}} />
      <div className="min-w-0 flex-1"><div className="mx-auto max-w-[1160px] px-4 py-6 sm:px-7 lg:px-10">
        <div className="mb-5"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/65">Pattern monitoring</div><h1 className="mt-1 text-2xl font-semibold tracking-tight">Pattern Alerts</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-white/40">Test a rule against the latest completed market window, save it, and keep checking while this workspace is open.</p></div>

        <section className="rounded-lg border border-white/8 bg-[#0a0e15] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Zap size={16} className="text-amber-200" /><h2 className="text-sm font-semibold">Build the trigger</h2></div><div className="text-[10px] uppercase tracking-[0.12em] text-white/25">{summary || "Choose a source"}</div></div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <ToggleCard active={current} onClick={() => setCurrent(!current)} title="Current market structure" description="Find the closest historical analog to the latest market window." />
            <ToggleCard active={favoritesSource} onClick={() => setFavoritesSource(!favoritesSource)} title="Pinned charts" description="Watch for the current market to resemble charts you saved in Favorites." />
            <ToggleCard active={historical} onClick={() => setHistorical(!historical)} title="Chosen historical chart" description="Watch one specific historical window from the current Market Memory search." />
            <ToggleCard active={named} onClick={() => { setNamed(!named); setTestError("Named pattern detection is planned for the pattern library evaluator."); }} title="Named patterns" description="Chart and candlestick names are visible here, but detection is not live yet." disabled={false} />
          </div>

          {(current || favoritesSource || historical) && <div className="mt-4 rounded-md border border-white/7 bg-white/[0.015] p-4"><div className="grid gap-4 md:grid-cols-3"><label className="text-xs text-white/45">Market<select value={symbol} onChange={(e) => setSymbol(e.target.value)} className={inputClass}><option>BTCUSDT</option><option>ETHUSDT</option><option>SOLUSDT</option></select></label><label className="text-xs text-white/45">Timeframe<select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className={inputClass}><option>5m</option><option>15m</option><option>1h</option></select></label><label className="text-xs text-white/45">Pattern length<select value={patternLength} onChange={(e) => setPatternLength(Number(e.target.value))} className={inputClass}><option value={30}>30 candles</option><option value={45}>45 candles</option><option value={60}>60 candles</option></select></label></div><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-xs text-white/45">Minimum similarity<select value={similarity} onChange={(e) => setSimilarity(Number(e.target.value))} className={inputClass}>{[90,92,94,95,96,97,98].map((n) => <option key={n} value={n}>{n}% or higher</option>)}</select></label><label className="text-xs text-white/45">Minimum historical agreement<select value={agreement} onChange={(e) => setAgreement(Number(e.target.value))} className={inputClass}>{[50,55,60,65,70,75].map((n) => <option key={n} value={n}>{n}% or higher</option>)}</select></label></div><label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-white/45"><input type="checkbox" checked={useHistoricalFilters} onChange={(e) => setUseHistoricalFilters(e.target.checked)} className="accent-white" />Use historical direction agreement for current-structure alerts</label></div>}

          {favoritesSource && <div className="mt-3 rounded-md border border-white/7 bg-white/[0.015] p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-xs font-semibold">Choose pinned charts</div><div className="mt-1 text-[10px] text-white/30">A pinned chart is an exact historical candle window. The evaluator compares today’s window with it.</div></div><Link href="/favorites" className="shrink-0 text-[10px] font-semibold text-amber-200/65 hover:text-amber-200">Manage favorites</Link></div>{favorites.length === 0 ? <div className="mt-3 rounded-md border border-dashed border-white/8 px-4 py-8 text-center"><Pin size={18} className="mx-auto text-white/15" /><div className="mt-2 text-xs text-white/35">No pinned charts yet.</div><Link href="/" className="mt-1 inline-block text-[10px] text-amber-200/60 hover:text-amber-200">Pin one from Market Memory</Link></div> : <div className="mt-3 grid gap-2 md:grid-cols-2">{favorites.map((favorite) => { const selected = selectedFavoriteIds.includes(favorite.id); return <button key={favorite.id} type="button" onClick={() => toggleFavorite(favorite.id)} className={`rounded-md border p-3 text-left transition ${selected ? "border-amber-200/30 bg-amber-200/[0.055]" : "border-white/7 bg-white/[0.01] hover:bg-white/[0.025]"}`}><div className="flex items-start gap-3"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${selected ? "border-amber-200/50 bg-amber-200 text-black" : "border-white/15"}`}>{selected && <Check size={12} />}</span><span className="min-w-0"><span className="block truncate text-xs font-semibold text-white/80">{favorite.name}</span><span className="mt-1 block text-[10px] text-white/30">{favorite.symbol.replace("USDT", "/USDT")} · {favorite.timeframe} · {favorite.patternLength} candles</span>{favorite.similarityScore != null && <span className="mt-1 block font-mono text-[10px] text-amber-200/60">Similarity {favorite.similarityScore.toFixed(1)}%</span>}</span></div></button>; })}</div>}</div>}

          {historical && <div className="mt-3 rounded-md border border-white/7 bg-white/[0.015] p-4"><div className="flex items-center justify-between"><div><div className="text-xs font-semibold">Choose historical match</div><div className="mt-1 text-[10px] text-white/30">Use the same ranked historical windows shown by Market Memory.</div></div>{loadingMatches && <Loader2 size={15} className="animate-spin text-white/35" />}</div>{historicalMatches.length > 0 ? <div className="mt-3 flex items-center gap-2"><button type="button" onClick={() => setSelectedHistorical((value) => Math.max(0, value - 1))} disabled={selectedHistorical === 0} className="h-9 w-9 rounded-md border border-white/10 text-white/50 disabled:opacity-25">‹</button><select value={selectedHistorical} onChange={(e) => setSelectedHistorical(Number(e.target.value))} className={inputClass + " mt-0 flex-1"}>{historicalMatches.map((match) => <option key={match.index} value={match.index}>#{match.index + 1} · {match.similarity.toFixed(1)}% · {formatDate(match.start)}</option>)}</select><button type="button" onClick={() => setSelectedHistorical((value) => Math.min(historicalMatches.length - 1, value + 1))} disabled={selectedHistorical >= historicalMatches.length - 1} className="h-9 w-9 rounded-md border border-white/10 text-white/50 disabled:opacity-25">›</button></div> : <div className="mt-3 text-xs text-white/30">{loadingMatches ? "Loading historical matches…" : "No historical matches available."}</div>}</div>}

          {named && <div className="mt-3 rounded-md border border-amber-200/10 bg-amber-200/[0.025] p-4"><div className="flex items-center gap-2"><WandSparkles size={14} className="text-amber-200/70" /><div><div className="text-xs font-semibold">Pattern library</div><div className="mt-1 text-[10px] text-white/30">These names are the library catalog. The detector will be connected after the evaluator has real pattern definitions.</div></div></div><div className="mt-3 grid gap-2 md:grid-cols-2">{PATTERN_GROUPS.map((group) => <div key={group.title}><div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25">{group.title}</div><div className="flex flex-wrap gap-1.5">{group.items.map((item) => <button key={item} type="button" onClick={() => toggleNamedPattern(item)} className={`rounded-md border px-2.5 py-1.5 text-[10px] ${namedPatterns.includes(item) ? "border-amber-200/30 bg-amber-200/[0.08] text-amber-100" : "border-white/8 text-white/40 hover:text-white/60"}`}>{item}</button>)}</div></div>)}</div></div>}

          <div className="mt-4 flex flex-col gap-3 border-t border-white/7 pt-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><span className="text-xs text-white/35">Combine sources:</span><button type="button" onClick={() => setMatchMode(matchMode === "any" ? "all" : "any")} className="flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-white/55">{matchMode === "any" ? "ANY source" : "ALL sources"}<ChevronDown size={12} /></button></div><div className="flex flex-wrap gap-2"><button type="button" onClick={enableNotifications} className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-white/55 hover:bg-white/[0.03]">Enable notifications</button><button type="button" disabled={testing || !selectedCount || named} onClick={() => void testAlert()} className="flex items-center justify-center gap-2 rounded-md border border-amber-200/25 bg-amber-200/[0.08] px-4 py-2 text-xs font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-35">{testing && <Loader2 size={13} className="animate-spin" />}Test alert now</button><button type="button" disabled={!canSave} onClick={addRule} className="rounded-md bg-white px-4 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-25">{saved ? "Saved" : "Save alert"}</button></div></div>
        </section>

        {(evaluation || testError) && <section className={`mt-4 rounded-lg border p-4 ${evaluation?.triggered ? "border-amber-200/25 bg-amber-200/[0.045]" : "border-white/8 bg-[#0a0e15]"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Latest evaluation</div><div className="mt-1 flex items-center gap-2 text-lg font-semibold">{evaluation ? (evaluation.triggered ? "Triggered" : "Not triggered") : "Evaluation unavailable"}{evaluation?.triggered && <Zap size={16} className="text-amber-200" />}</div></div>{evaluation && <div className="text-right text-[10px] text-white/30">Evaluated at {formatDate(evaluation.evaluated_at)}<br />Algorithm {evaluation.sources.length ? "similarity_v1" : "—"}</div>}</div>{testError && <div className="mt-3 flex items-start gap-2 rounded-md border border-red-300/10 bg-red-300/[0.035] p-3 text-xs leading-5 text-white/55"><CircleAlert size={14} className="mt-0.5 shrink-0 text-red-200/60" />{testError}</div>}{evaluation && <div className="mt-4 grid gap-2 md:grid-cols-3">{evaluation.sources.map((source) => <div key={source.source} className="rounded-md border border-white/7 bg-white/[0.015] p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold capitalize">{source.source.replace("_", " ")}</span><span className={`text-[10px] font-semibold ${source.matched ? "text-amber-200" : "text-white/30"}`}>{source.matched ? "MATCH" : "NO MATCH"}</span></div>{source.similarity != null && <div className="mt-2 font-mono text-sm">{source.similarity.toFixed(1)}% <span className="font-sans text-[10px] text-white/25">similarity</span></div>}{source.direction_agreement != null && <div className="mt-1 text-[10px] text-white/35">{source.direction_agreement.toFixed(0)}% directional agreement · {source.agreement_sample ?? 0} historical matches</div>}<div className="mt-2 text-[10px] leading-4 text-white/30">{source.reason}</div></div>)}</div>}</section>}

        <section className="mt-4 rounded-lg border border-white/8 bg-[#0a0e15] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Saved alerts</h2><p className="mt-1 text-[11px] text-white/30">Enabled rules are checked every 60 seconds while this page is open.</p></div>{lastPoll && <div className="text-[10px] text-white/25">Last check {formatDate(lastPoll)}</div>}</div>{rules.length === 0 ? <div className="mt-4 rounded-md border border-dashed border-white/8 px-4 py-10 text-center text-xs text-white/30">No alerts saved yet.</div> : <div className="mt-4 space-y-2">{rules.map((rule) => <div key={rule.id} className="flex flex-col gap-3 rounded-md border border-white/7 bg-white/[0.012] p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold">{rule.symbol.replace("USDT", "/USDT")}</span><span className="text-[10px] text-white/25">{rule.timeframe} · {rule.patternLength} candles</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${rule.enabled ? "bg-amber-200/[0.08] text-amber-100" : "bg-white/[0.04] text-white/30"}`}>{rule.enabled ? "LIVE" : "PAUSED"}</span></div><div className="mt-1 truncate text-[10px] text-white/35">{sourceLabel(rule, favorites)} · similarity {rule.similarity}%{rule.sources.current && rule.useHistoricalFilters ? ` · agreement ${rule.agreement}%` : ""}</div></div><div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => toggleRule(rule.id)} className="rounded-md border border-white/10 px-3 py-1.5 text-[10px] font-semibold text-white/45">{rule.enabled ? "Pause" : "Resume"}</button><button type="button" onClick={() => removeRule(rule.id)} className="rounded-md border border-white/8 p-1.5 text-white/25 hover:text-red-200"><Trash2 size={14} /></button></div></div>)}</div>}</section>
      </div></div>
    </div>
  </main>;
}
