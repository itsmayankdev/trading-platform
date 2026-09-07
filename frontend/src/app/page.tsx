"use client";

import MarketChart from "@/components/MarketChart";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Clock3,
  Database,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

type Outcome = {
  horizon_candles: number;
  forward_return: number;
  mfe: number;
  mae: number;
};

type Match = {
  start_time: string;
  end_time: string;
  similarity_score: number;
  outcomes: Outcome[];
};

type Statistic = {
  horizon_candles: number;
  sample_size: number;
  mean_return: number;
  median_return: number;
  win_rate: number;
  mean_mfe: number;
  mean_mae: number;
};

type SearchResponse = {
  symbol: string;
  timeframe: string;
  pattern_length: number;
  algorithm_version: string;
  feature_version: string;
  current_pattern: {
    start_time: string;
    end_time: string;
  };
  matches: Match[];
  statistics: Statistic[];
};

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

export default function Home() {
  const [symbol, setSymbol] = useState("ETHUSDT");
  const [timeframe, setTimeframe] = useState("5m");
  const [patternLength, setPatternLength] = useState("45");

  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function searchPatterns() {
    setLoading(true);
    setError("");
    setData(null);

    try {
      const params = new URLSearchParams({
        symbol,
        timeframe,
        pattern_length: patternLength,
        top_k: "10",
      });

      const response = await fetch(
        `/api/backend/api/v1/pattern-search?${params.toString()}`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        let message = `API returned ${response.status}`;

        try {
          const body = await response.json();

          if (body?.detail) {
            message = body.detail;
          }
        } catch {
          // Ignore invalid error response.
        }

        setError(message);
        return;
      }

      const result: SearchResponse = await response.json();

      setData(result);
    } catch {
      setError(
        "Could not reach the Pattern Engine. Please check that FastAPI is running."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void searchPatterns();
    }, 0);

    return () => window.clearTimeout(timer);

    // Initial search only.
    // User-triggered searches happen through the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-[#080b10] text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0b0f15]/95">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-black">
              <Activity size={20} />
            </div>

            <div>
              <div className="text-sm font-semibold tracking-wide">
                MARKET MEMORY
              </div>

              <div className="text-[11px] text-white/40">
                Historical Pattern Intelligence
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-white/50">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Engine Online
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-6 py-6">
        {/* Controls */}
        <section className="rounded-xl border border-white/10 bg-[#0d1219] p-4">
          <div className="mb-4 flex items-center gap-2">
            <Search size={17} />
            <h1 className="text-sm font-semibold">Pattern Search</h1>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {/* Symbol */}
            <label className="text-xs text-white/50">
              Symbol

              <select
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  setData(null);
                  setError("");
                }}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#080b10] px-3 py-2.5 text-sm text-white outline-none"
              >
                <option value="ETHUSDT">ETHUSDT</option>
                <option value="BTCUSDT">BTCUSDT</option>
                <option value="SOLUSDT">SOLUSDT</option>
              </select>
            </label>

            {/* Timeframe */}
            <label className="text-xs text-white/50">
              Timeframe

              <select
                value={timeframe}
                onChange={(e) => {
                  setTimeframe(e.target.value);
                  setData(null);
                  setError("");
                }}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#080b10] px-3 py-2.5 text-sm text-white outline-none"
              >
                <option value="5m">5m</option>
                <option value="15m">15m</option>
                <option value="1h">1h</option>
              </select>
            </label>

            {/* Pattern Length */}
            <label className="text-xs text-white/50">
              Pattern Length

              <select
                value={patternLength}
                onChange={(e) => {
                  setPatternLength(e.target.value);
                  setData(null);
                  setError("");
                }}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#080b10] px-3 py-2.5 text-sm text-white outline-none"
              >
                <option value="20">20 candles</option>
                <option value="30">30 candles</option>
                <option value="45">45 candles</option>
                <option value="60">60 candles</option>
                <option value="90">90 candles</option>
              </select>
            </label>

            {/* Search Button */}
            <div className="flex items-end">
              <button
                onClick={searchPatterns}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Search size={16} />

                {loading ? "Searching..." : "Search Market Memory"}
              </button>
            </div>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Results */}
        {data && (
          <>
            {/* Summary Cards */}
            <section className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
              <InfoCard
                icon={<BarChart3 size={17} />}
                label="Market"
                value={data.symbol}
                subvalue={data.timeframe}
              />

              <InfoCard
                icon={<Clock3 size={17} />}
                label="Pattern"
                value={`${data.pattern_length} candles`}
                subvalue={data.algorithm_version}
              />

              <InfoCard
                icon={<Database size={17} />}
                label="Historical Matches"
                value={`${data.matches.length}`}
                subvalue="independent matches"
              />

              <InfoCard
                icon={<Activity size={17} />}
                label="Feature Version"
                value={data.feature_version}
                subvalue="server-side engine"
              />
            </section>

            {/* Current Market Chart */}
            <section className="mt-5 rounded-xl border border-white/10 bg-[#0d1219]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold">
                    Current Market
                  </h2>

                  <p className="mt-1 text-xs text-white/40">
                    {data.symbol} · {data.timeframe} ·{" "}
                    {data.pattern_length} candle pattern
                  </p>
                </div>

                <span className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[11px] text-emerald-400">
                  Live Market Data
                </span>
              </div>

              <MarketChart
                symbol={symbol}
                timeframe={timeframe}
                limit={Math.max(
                  200,
                  data.pattern_length + 50
                )}
              />

              <div className="border-t border-white/10 px-5 py-3 text-xs text-white/35">
                Pattern window:{" "}
                {data.current_pattern.start_time} →{" "}
                {data.current_pattern.end_time}
              </div>
            </section>

            {/* Historical Matches */}
            <section className="mt-5 rounded-xl border border-white/10 bg-[#0d1219]">
              <div className="border-b border-white/10 px-5 py-4">
                <h2 className="text-sm font-semibold">
                  Historical Matches
                </h2>

                <p className="mt-1 text-xs text-white/40">
                  Ranked by structural similarity
                </p>
              </div>

              <div className="divide-y divide-white/5">
                {data.matches.map((match, index) => (
                  <div
                    key={`${match.start_time}-${index}`}
                    className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[45px_1fr_150px_150px]"
                  >
                    <div className="text-sm font-medium text-white/40">
                      #{index + 1}
                    </div>

                    <div>
                      <div className="text-sm font-medium">
                        {new Date(
                          match.start_time
                        ).toUTCString()}
                      </div>

                      <div className="mt-1 text-xs text-white/35">
                        →{" "}
                        {new Date(
                          match.end_time
                        ).toUTCString()}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-white/35">
                        Similarity Score
                      </div>

                      <div className="mt-1 text-lg font-semibold">
                        {match.similarity_score.toFixed(2)}%
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-white/35">
                        +30 Outcome
                      </div>

                      {match.outcomes.find(
                        (x) => x.horizon_candles === 30
                      ) ? (
                        <div className="mt-1 flex items-center gap-1 text-sm">
                          {(() => {
                            const outcome =
                              match.outcomes.find(
                                (x) =>
                                  x.horizon_candles === 30
                              )!;

                            return (
                              <>
                                {outcome.forward_return >=
                                0 ? (
                                  <TrendingUp
                                    size={14}
                                    className="text-emerald-400"
                                  />
                                ) : (
                                  <TrendingDown
                                    size={14}
                                    className="text-red-400"
                                  />
                                )}

                                {pct(
                                  outcome.forward_return
                                )}
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="mt-1 text-sm text-white/30">
                          N/A
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Statistics */}
            <section className="mt-5 rounded-xl border border-white/10 bg-[#0d1219]">
              <div className="border-b border-white/10 px-5 py-4">
                <h2 className="text-sm font-semibold">
                  Historical Outcome Statistics
                </h2>

                <p className="mt-1 text-xs text-white/40">
                  Historical observations — not probability or
                  prediction
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="border-b border-white/10 text-[11px] uppercase tracking-wider text-white/35">
                    <tr>
                      <th className="px-5 py-3">Horizon</th>
                      <th className="px-5 py-3">Samples</th>
                      <th className="px-5 py-3">Mean Return</th>
                      <th className="px-5 py-3">
                        Median Return
                      </th>
                      <th className="px-5 py-3">Win Rate</th>
                      <th className="px-5 py-3">Avg MFE</th>
                      <th className="px-5 py-3">Avg MAE</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-white/5">
                    {data.statistics.map((stat) => (
                      <tr key={stat.horizon_candles}>
                        <td className="px-5 py-4 font-medium">
                          +{stat.horizon_candles}
                        </td>

                        <td className="px-5 py-4 text-white/60">
                          {stat.sample_size}
                        </td>

                        <td className="px-5 py-4">
                          {pct(stat.mean_return)}
                        </td>

                        <td className="px-5 py-4">
                          {pct(stat.median_return)}
                        </td>

                        <td className="px-5 py-4">
                          {(stat.win_rate * 100).toFixed(1)}%
                        </td>

                        <td className="px-5 py-4">
                          {pct(stat.mean_mfe)}
                        </td>

                        <td className="px-5 py-4">
                          {pct(stat.mean_mae)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Footer */}
            <div className="mt-5 pb-8 text-center text-[11px] text-white/25">
              Algorithm: {data.algorithm_version} · Features:{" "}
              {data.feature_version} · Historical outcomes do not
              guarantee future performance.
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function InfoCard({
  icon,
  label,
  value,
  subvalue,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  subvalue: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0d1219] p-4">
      <div className="flex items-center gap-2 text-xs text-white/40">
        {icon}
        {label}
      </div>

      <div className="mt-3 text-lg font-semibold">
        {value}
      </div>

      <div className="mt-1 text-[11px] text-white/30">
        {subvalue}
      </div>
    </div>
  );
}