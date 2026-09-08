"use client";

import { useEffect, useState } from "react";
import { Activity, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Search } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import DualReplayChart from "@/components/replay/DualReplayChart";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Match = {
  start_time: string;
  end_time: string;
  similarity_score: number;
};

type ReplaySearchResponse = {
  matches: Match[];
  historical_candles_available: number;
};

const WATCHLIST = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

function isoForInput(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTime(seconds?: number) {
  if (seconds == null) return "—";
  return (
    new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date(seconds * 1000)) + " UTC"
  );
}

function intervalSeconds(value: string) {
  if (value === "5m") return 300;
  if (value === "15m") return 900;
  return 3600;
}

export default function ReplayLab() {
  const [symbol, setSymbol] = useState("ETHUSDT");
  const [timeframe, setTimeframe] = useState("5m");
  const [patternLength, setPatternLength] = useState("45");
  const [topK] = useState("10");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayInput, setReplayInput] = useState("");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("1");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [historyAvailable, setHistoryAvailable] = useState<number | null>(null);
  const [selectedMatch, setSelectedMatch] = useState(0);
  const [historicalCandles, setHistoricalCandles] = useState<Candle[]>([]);
  const [historicalIndex, setHistoricalIndex] = useState(0);
  const [historicalAnchorIndex, setHistoricalAnchorIndex] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  async function loadWindow() {
    setLoading(true);
    setError("");
    setPlaying(false);
    setMatches([]);
    setHistoricalCandles([]);
    setSelectedMatch(0);
    setHistoricalIndex(0);
    setHistoricalAnchorIndex(0);

    try {
      const response = await fetch(
        `/api/backend/api/v1/candles?${new URLSearchParams({
          symbol,
          timeframe,
          limit: "5000",
        })}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error(`Candle API returned ${response.status}`);
      }

      const result = (await response.json()) as { candles: Candle[] };
      const next = result.candles ?? [];
      const length = Number(patternLength);

      if (next.length < length + 1) {
        throw new Error("Not enough candles for this replay configuration.");
      }

      setCandles(next);
      const initial = Math.max(length - 1, next.length - 900);
      setReplayIndex(initial);
      setReplayInput(isoForInput(next[initial].time * 1000));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load replay candles.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWindow();
    // Symbol/timeframe changes are the intended reload triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!playing || !candles.length) return;

    const interval = window.setInterval(() => {
      setReplayIndex((value) => {
        if (value >= candles.length - 1) {
          setPlaying(false);
          return value;
        }
        return value + 1;
      });

      setHistoricalIndex((value) => {
        if (!historicalCandles.length) return value;
        return Math.min(historicalCandles.length - 1, value + 1);
      });
    }, Math.max(60, 1000 / Number(speed)));

    return () => window.clearInterval(interval);
  }, [playing, speed, candles.length, historicalCandles.length]);

  useEffect(() => {
    const candle = candles[replayIndex];
    if (candle) setReplayInput(isoForInput(candle.time * 1000));
  }, [replayIndex, candles]);

  const current = candles[replayIndex];
  const patternReady = replayIndex >= Number(patternLength) - 1;

  function jumpToInput() {
    const target = new Date(replayInput).getTime() / 1000;
    if (!Number.isFinite(target) || !candles.length) return;

    let nearest = 0;
    let distance = Infinity;

    candles.forEach((candle, index) => {
      const d = Math.abs(candle.time - target);
      if (d < distance) {
        distance = d;
        nearest = index;
      }
    });

    setPlaying(false);
    setReplayIndex(Math.max(Number(patternLength) - 1, nearest));
  }

  function resetReplay() {
    setPlaying(false);
    const currentResetIndex = Math.max(Number(patternLength) - 1, 0);
    setReplayIndex(currentResetIndex);

    if (historicalCandles.length) {
      setHistoricalIndex(
        Math.min(historicalCandles.length - 1, historicalAnchorIndex),
      );
    }
  }

  function step(delta: number) {
    setPlaying(false);

    setReplayIndex((value) => {
      const next = Math.max(
        Number(patternLength) - 1,
        Math.min(candles.length - 1, value + delta),
      );
      const actualDelta = next - value;

      if (historicalCandles.length) {
        setHistoricalIndex((historicalValue) =>
          Math.max(
            historicalAnchorIndex,
            Math.min(
              historicalCandles.length - 1,
              historicalValue + actualDelta,
            ),
          ),
        );
      }

      return next;
    });
  }

  async function searchMemory() {
    if (!patternReady || !current) return;

    setSearching(true);
    setError("");
    setPlaying(false);
    setHistoricalCandles([]);
    setHistoricalIndex(0);
    setHistoricalAnchorIndex(0);

    try {
      const params = new URLSearchParams({
        symbol,
        timeframe,
        pattern_length: patternLength,
        top_k: topK,
        replay_time: new Date(current.time * 1000).toISOString(),
      });

      const response = await fetch(
        `/api/backend/api/v1/replay-search?${params.toString()}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.detail ?? `Replay search returned ${response.status}`);
      }

      const result = (await response.json()) as ReplaySearchResponse;
      setMatches(result.matches ?? []);
      setHistoryAvailable(result.historical_candles_available ?? null);
      setSelectedMatch(0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Replay pattern search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function selectMatch(index: number) {
    const match = matches[index];
    if (!match) return;

    setPlaying(false);
    setSelectedMatch(index);
    setHistoricalCandles([]);

    const start = new Date(match.start_time).getTime() / 1000;
    const end = new Date(match.end_time).getTime() / 1000;
    const padding =
      Math.max(Number(patternLength) * 2, 90) * intervalSeconds(timeframe);

    try {
      const params = new URLSearchParams({
        symbol,
        timeframe,
        start_time: new Date((start - padding) * 1000).toISOString(),
        end_time: new Date((end + padding) * 1000).toISOString(),
        limit: "1000",
      });

      const response = await fetch(
        `/api/backend/api/v1/candles?${params.toString()}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error(`Historical chart returned ${response.status}`);
      }

      const result = (await response.json()) as { candles: Candle[] };
      const rows = result.candles ?? [];
      setHistoricalCandles(rows);

      const exactStart = rows.findIndex((row) => row.time === start);
      const anchor = Math.max(
        Number(patternLength) - 1,
        exactStart >= 0
          ? exactStart + Number(patternLength) - 1
          : Number(patternLength) - 1,
      );

      setHistoricalAnchorIndex(anchor);
      setHistoricalIndex(anchor);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load the historical match chart.",
      );
    }
  }

  useEffect(() => {
    if (matches.length) void selectMatch(selectedMatch);
    // Selecting a match is the intended side effect when the result set/index changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, selectedMatch]);

  return (
    <main className="min-h-screen bg-[#070a0f] text-white">
      <header className="sticky top-0 z-40 h-12 border-b border-white/8 bg-[#070a0f]">
        <div className="flex h-full items-center px-4 sm:px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black">
              <Activity size={15} />
            </div>
            <span className="text-xs font-semibold tracking-[0.12em]">
              MARKET MEMORY
            </span>
            <span className="ml-2 text-[9px] uppercase tracking-[0.12em] text-amber-200/55">
              Replay Lab
            </span>
          </div>
        </div>
      </header>

      <div className="flex">
        <Sidebar
          symbol={symbol}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          onSymbolSelect={setSymbol}
          selectedSymbols={WATCHLIST}
          onWatchlistToggle={() => undefined}
        />

        <div className="min-w-0 flex-1">
          <div className="border-b border-white/7 bg-[#080c12] px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-end gap-2.5">
              <label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">
                Symbol
                <select
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value)}
                  className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75"
                >
                  <option>BTCUSDT</option>
                  <option>ETHUSDT</option>
                  <option>SOLUSDT</option>
                </select>
              </label>

              <label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">
                Timeframe
                <select
                  value={timeframe}
                  onChange={(event) => setTimeframe(event.target.value)}
                  className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75"
                >
                  <option>5m</option>
                  <option>15m</option>
                  <option>1h</option>
                </select>
              </label>

              <label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">
                Pattern
                <select
                  value={patternLength}
                  onChange={(event) => setPatternLength(event.target.value)}
                  className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75"
                >
                  <option>30</option>
                  <option>45</option>
                  <option>60</option>
                  <option>100</option>
                </select>
              </label>

              <label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">
                Replay time
                <input
                  type="datetime-local"
                  value={replayInput}
                  onChange={(event) => setReplayInput(event.target.value)}
                  className="mt-1 block h-8 rounded border border-white/10 bg-[#0d1219] px-2 text-[11px] text-white/75"
                />
              </label>

              <button
                type="button"
                onClick={jumpToInput}
                className="h-8 rounded border border-white/10 bg-white/[0.04] px-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/60"
              >
                Go
              </button>

              <button
                type="button"
                onClick={() => void searchMemory()}
                disabled={!patternReady || searching || loading}
                className="flex h-8 items-center gap-1.5 rounded bg-amber-300 px-3 text-[9px] font-bold uppercase tracking-[0.1em] text-black disabled:opacity-40"
              >
                <Search size={12} />
                {searching ? "Searching…" : "Search Memory"}
              </button>
            </div>
          </div>

          <div className="mx-auto max-w-[1800px] space-y-3 px-3 py-3 sm:px-4 lg:px-5">
            {error && (
              <div className="rounded-md border border-red-400/15 bg-red-400/5 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}

            {!matches.length && (
              <section className="panel overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-3.5 py-3">
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">
                      Historical market replay
                    </div>
                    <div className="mt-1 text-sm font-semibold">
                      {symbol.replace("USDT", "/USDT")} · {timeframe}
                    </div>
                  </div>
                  <div className="font-mono text-[10px] text-white/45">
                    Replay {formatTime(current?.time)} · Close {current?.close?.toFixed(4) ?? "—"}
                  </div>
                </div>
                <div className="p-3">
                  <DualReplayChart
                    currentCandles={candles}
                    currentIndex={replayIndex}
                    patternLength={Number(patternLength)}
                    match={null}
                    historicalCandles={[]}
                    historicalIndex={0}
                  />
                </div>
              </section>
            )}

            {matches.length > 0 && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2">
                  <div>
                    <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-200">
                      Memory found
                    </span>
                    <span className="ml-2 text-[10px] text-white/45">
                      {matches.length} historical analogs · {historyAvailable?.toLocaleString() ?? "—"} candles before replay point
                    </span>
                  </div>
                  <div className="font-mono text-[9px] text-white/35">
                    Replay {formatTime(current?.time)}
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div>
                    <DualReplayChart
                      currentCandles={candles}
                      currentIndex={replayIndex}
                      patternLength={Number(patternLength)}
                      match={matches[selectedMatch] ?? null}
                      historicalCandles={historicalCandles}
                      historicalIndex={historicalIndex}
                    />
                  </div>

                  <aside className="panel max-h-[770px] overflow-auto p-3">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">
                      Memory matches
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {matches.map((match, index) => (
                        <button
                          type="button"
                          key={`${match.start_time}-${index}`}
                          onClick={() => void selectMatch(index)}
                          className={`w-full rounded border px-2.5 py-2 text-left ${
                            index === selectedMatch
                              ? "border-amber-300/35 bg-amber-300/[0.06]"
                              : "border-white/8 bg-white/[0.015]"
                          }`}
                        >
                          <div className="flex items-center justify-between font-mono text-[9px]">
                            <span className="text-white/65">
                              #{index + 1} · {match.similarity_score.toFixed(2)}%
                            </span>
                            <span className="text-white/20">similarity</span>
                          </div>
                          <div className="mt-1 text-[8px] text-white/35">
                            {formatTime(new Date(match.end_time).getTime() / 1000)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </aside>
                </div>

                <div className="panel flex flex-wrap items-center justify-between gap-3 p-3">
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-white/30">
                      Synchronized replay
                    </div>
                    <div className="mt-1 text-[10px] text-white/50">
                      Both charts advance together. Pause stops both. The historical side reveals its post-match candles only as replay advances.
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => step(-10)}
                      className="flex h-9 w-10 items-center justify-center rounded border border-white/10 text-white/55"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlaying((value) => !value)}
                      className="flex h-9 w-12 items-center justify-center rounded bg-white text-black"
                    >
                      {playing ? <Pause size={15} /> : <Play size={15} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => step(1)}
                      className="flex h-9 w-10 items-center justify-center rounded border border-white/10 text-white/55"
                    >
                      <ChevronRight size={15} />
                    </button>
                    <select
                      value={speed}
                      onChange={(event) => setSpeed(event.target.value)}
                      className="h-9 rounded border border-white/10 bg-[#0d1219] px-2 text-[9px] text-white/65"
                    >
                      <option value="0.5">0.5×</option>
                      <option value="1">1×</option>
                      <option value="2">2×</option>
                      <option value="5">5×</option>
                      <option value="10">10×</option>
                    </select>
                    <button
                      type="button"
                      onClick={resetReplay}
                      className="flex h-9 items-center gap-1 rounded border border-white/8 px-2 text-[8px] uppercase tracking-[0.08em] text-white/35"
                    >
                      <RotateCcw size={11} /> Reset
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
