"use client";

import { useEffect, useState } from "react";
import { Activity, BarChart3, Database, ShieldCheck, Sparkles } from "lucide-react";
import MarketChart from "@/components/MarketChart";
import HistoricalMatches from "@/components/pattern-search/HistoricalMatches";
import OutcomeStatistics from "@/components/pattern-search/OutcomeStatistics";
import SearchControls from "@/components/pattern-search/SearchControls";
import type { SearchResponse } from "@/components/pattern-search/types";

function SummaryCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/30">{label}</span>
        <span className="text-white/30">{icon}</span>
      </div>
      <div className="mt-3 text-xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 truncate text-xs text-white/30">{detail}</div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
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
      const response = await fetch(`/api/backend/api/v1/pattern-search?${params.toString()}`, { cache: "no-store" });

      if (!response.ok) {
        let message = `API returned ${response.status}`;
        try {
          const body = await response.json();
          if (body?.detail) message = body.detail;
        } catch {
          // Keep the generic HTTP error.
        }
        setError(message);
        return;
      }

      setData((await response.json()) as SearchResponse);
    } catch {
      setError("Could not reach the Pattern Engine. Check that FastAPI is running.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void searchPatterns(), 0);
    return () => window.clearTimeout(timer);
    // Initial search only. User-triggered searches use the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentPattern = data?.current_pattern;

  return (
    <main className="min-h-screen bg-[#070a0f] text-white">
      <header className="sticky top-0 z-20 border-b border-white/7 bg-[#070a0f]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white text-black shadow-lg shadow-white/5">
              <Activity size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-[0.08em]">MARKET MEMORY</div>
              <div className="hidden text-[10px] uppercase tracking-[0.14em] text-white/30 sm:block">Historical pattern intelligence</div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/5 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Engine online
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8">
        <section className="mb-6 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="eyebrow flex items-center gap-2"><Sparkles size={13} /> Market Memory Engine</div>
            <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Find where today&apos;s market pattern has happened before.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/40">Compare the latest price structure against historical windows and inspect what followed those matches.</p>
          </div>
          <div className="hidden items-center gap-2 text-xs text-white/30 lg:flex"><ShieldCheck size={14} /> Server-side analysis</div>
        </section>

        <SearchControls
          symbol={symbol}
          timeframe={timeframe}
          patternLength={patternLength}
          loading={loading}
          onSymbolChange={(value) => { setSymbol(value); setData(null); setError(""); }}
          onTimeframeChange={(value) => { setTimeframe(value); setData(null); setError(""); }}
          onPatternLengthChange={(value) => { setPatternLength(value); setData(null); setError(""); }}
          onSearch={() => void searchPatterns()}
        />

        {error && <div className="mt-4 rounded-xl border border-red-400/15 bg-red-400/5 px-4 py-3 text-sm text-red-300">{error}</div>}

        {loading && !data && (
          <section className="mt-5 grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((item) => <div key={item} className="panel h-28 animate-pulse bg-white/[0.02]" />)}
          </section>
        )}

        {data && (
          <div className="mt-5 space-y-5">
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryCard label="Market" value={data.symbol} detail={`${data.timeframe} timeframe`} icon={<BarChart3 size={16} />} />
              <SummaryCard label="Pattern" value={`${data.pattern_length} candles`} detail={data.algorithm_version} icon={<Activity size={16} />} />
              <SummaryCard label="Matches" value={String(data.matches.length)} detail="independent historical windows" icon={<Database size={16} />} />
              <SummaryCard label="Features" value={data.feature_version} detail="server-side feature set" icon={<ShieldCheck size={16} />} />
            </section>

            <section className="panel overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-white/8 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="eyebrow">Current market</div>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight">{data.symbol} <span className="text-white/30">·</span> {data.timeframe}</h2>
                  {currentPattern && <p className="mt-1 text-xs text-white/30">Pattern window {formatDate(currentPattern.start_time)} → {formatDate(currentPattern.end_time)} UTC</p>}
                </div>
                <div className="flex items-center gap-2 self-start rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-white/35 sm:self-auto">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live market data
                </div>
              </div>
              <MarketChart symbol={data.symbol} timeframe={data.timeframe} limit={Math.max(200, data.pattern_length + 50)} />
            </section>

            <HistoricalMatches matches={data.matches} />
            <OutcomeStatistics statistics={data.statistics} />

            <footer className="flex flex-col gap-2 border-t border-white/6 py-5 text-[10px] uppercase tracking-[0.12em] text-white/20 sm:flex-row sm:items-center sm:justify-between">
              <span>Algorithm {data.algorithm_version} · Features {data.feature_version}</span>
              <span>Historical outcomes do not guarantee future performance.</span>
            </footer>
          </div>
        )}
      </div>
    </main>
  );
}
