import { BarChart3, Clock3, Database, Gauge } from "lucide-react";
import type { SearchResponse } from "./types";

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(value));
}

export default function PatternSummary({ data }: { data: SearchResponse }) {
  const topMatch = data.matches[0];
  const bestStatistic = data.statistics.find((item) => item.horizon_candles === 15) ?? data.statistics[0];
  const similarityValues = data.matches.map((match) => match.similarity_score);
  const averageSimilarity = similarityValues.length ? similarityValues.reduce((sum, value) => sum + value, 0) / similarityValues.length : 0;
  const sampleSize = bestStatistic?.sample_size ?? 0;

  const items = [
    { icon: Gauge, label: "Top match", value: topMatch ? `${topMatch.similarity_score.toFixed(2)}%` : "—", detail: "similarity" },
    { icon: BarChart3, label: "Match set", value: String(data.matches.length), detail: `avg ${averageSimilarity.toFixed(2)}% similarity` },
    { icon: Database, label: "Evidence", value: sampleSize ? sampleSize.toLocaleString("en-US") : "—", detail: bestStatistic ? `observations at +${bestStatistic.horizon_candles}` : "historical outcomes" },
    { icon: Clock3, label: "Current window", value: data.current_pattern.end_time ? formatDate(data.current_pattern.end_time) : "—", detail: `${data.pattern_length} candles · ${data.timeframe}` },
  ];

  return (
    <section className="panel overflow-hidden">
      <div className="grid grid-cols-2 divide-x divide-y divide-white/7 lg:grid-cols-4 lg:divide-y-0">
        {items.map(({ icon: Icon, label, value, detail }) => (
          <div key={label} className="min-w-0 px-4 py-3">
            <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30"><Icon size={11} /> {label}</div>
            <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-white/85">{value}</div>
            <div className="mt-0.5 truncate text-[9px] text-white/25">{detail}</div>
          </div>
        ))}
      </div>
      {topMatch && bestStatistic && <div className="border-t border-white/7 px-4 py-2 text-[9px] text-white/25">
        Strongest historical analogue currently ranks at <span className="font-mono text-white/45">{topMatch.similarity_score.toFixed(2)}%</span> similarity. The displayed evidence is descriptive historical data; it is not a probability or forecast. At +{bestStatistic.horizon_candles} candles, the sample shows a median return of <span className={bestStatistic.median_return >= 0 ? "text-emerald-400/70" : "text-rose-400/70"}>{pct(bestStatistic.median_return)}</span>.
      </div>}
    </section>
  );
}
