import { ArrowDownRight, ArrowUpRight, BarChart3, Clock3, Database, Gauge } from "lucide-react";
import type { SearchResponse } from "./types";

function pct(value: number) { return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(value)); }

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

  const directionRows = [5, 15, 30, 60].map((horizon) => {
    const outcomes = data.matches.flatMap((match) => match.outcomes.filter((outcome) => outcome.horizon_candles === horizon));
    const up = outcomes.filter((outcome) => outcome.forward_return > 0).length;
    const down = outcomes.filter((outcome) => outcome.forward_return < 0).length;
    const flat = outcomes.length - up - down;
    const dominantCount = Math.max(up, down, flat);
    const dominant = dominantCount === 0 ? "No data" : dominantCount === up ? "UP" : dominantCount === down ? "DOWN" : "FLAT";
    const dominantPct = outcomes.length ? (dominantCount / outcomes.length) * 100 : 0;
    const consistency = dominantPct >= 70 ? "Strong" : dominantPct >= 55 ? "Lean" : "Mixed";
    return { horizon, total: outcomes.length, up, down, flat, dominant, dominantPct, consistency };
  });

  return (
    <section className="panel overflow-hidden">
      <div className="grid grid-cols-2 divide-x divide-white/7 lg:grid-cols-4 lg:divide-y-0">
        {items.map(({ icon: Icon, label, value, detail }) => (
          <div key={label} className="min-w-0 px-3 py-2.5 lg:px-4">
            <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-white/30"><Icon size={10} /> {label}</div>
            <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-white/85">{value}</div>
            <div className="truncate text-[8px] text-white/25">{detail}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-white/7 px-3 py-2 lg:px-4">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-white/35">Historical direction after match</div>
          <div className="hidden font-mono text-[8px] uppercase tracking-[0.1em] text-white/20 sm:block">Descriptive · not a forecast</div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 xl:grid-cols-4">
          {directionRows.map(({ horizon, total, up, down, flat, dominant, dominantPct, consistency }) => (
            <div key={horizon} className="rounded border border-white/7 bg-white/[0.015] px-2.5 py-1.5">
              <div className="flex items-center justify-between"><span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-white/30">+{horizon}</span><span className="font-mono text-[8px] text-white/20">N {total}</span></div>
              <div className="mt-1 flex items-center gap-3 font-mono text-[10px] tabular-nums"><span className="flex items-center gap-1 text-emerald-400"><ArrowUpRight size={10} /> {up}</span><span className="flex items-center gap-1 text-rose-400"><ArrowDownRight size={10} /> {down}</span>{flat > 0 && <span className="text-white/30">• {flat}</span>}</div>
              <div className="mt-1 flex items-center justify-between border-t border-white/6 pt-1 text-[7px] uppercase tracking-[0.08em]"><span className="text-white/20">{dominant}</span><span className={consistency === "Strong" ? "text-white/55" : consistency === "Lean" ? "text-white/40" : "text-white/25"}>{consistency} · {dominantPct.toFixed(0)}%</span></div>
            </div>
          ))}
        </div>
      </div>
      {topMatch && bestStatistic && <div className="border-t border-white/7 px-3 py-1.5 text-[8px] text-white/22 lg:px-4">Top analogue <span className="font-mono text-white/45">{topMatch.similarity_score.toFixed(2)}%</span> · +{bestStatistic.horizon_candles} median <span className={bestStatistic.median_return >= 0 ? "text-emerald-400/70" : "text-rose-400/70"}>{pct(bestStatistic.median_return)}</span> · historical evidence only.</div>}
    </section>
  );
}
