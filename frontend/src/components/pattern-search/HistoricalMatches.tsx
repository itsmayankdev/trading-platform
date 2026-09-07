import { ArrowDownRight, ArrowUpRight, CalendarDays } from "lucide-react";
import type { Match } from "./types";

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
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

function OutcomeCell({ match }: { match: Match }) {
  const outcome = match.outcomes.find((item) => item.horizon_candles === 30);

  if (!outcome) {
    return <span className="text-sm text-white/25">No data</span>;
  }

  const positive = outcome.forward_return >= 0;
  return (
    <div className={positive ? "metric-positive" : "metric-negative"}>
      {positive ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
      {pct(outcome.forward_return)}
    </div>
  );
}

export default function HistoricalMatches({ matches }: { matches: Match[] }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-end justify-between border-b border-white/8 px-5 py-4">
        <div>
          <div className="eyebrow">Pattern matches</div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">Historical market memory</h2>
          <p className="section-subtitle mt-1">Independent windows ranked by structural similarity.</p>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2 text-right">
          <div className="text-lg font-semibold">{matches.length}</div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/30">Matches shown</div>
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-white/40">No historical matches available for this configuration.</div>
      ) : (
        <div className="divide-y divide-white/6">
          {matches.map((match, index) => (
            <article key={`${match.start_time}-${index}`} className="group px-5 py-4 transition hover:bg-white/[0.018]">
              <div className="grid gap-4 lg:grid-cols-[48px_minmax(0,1fr)_180px_160px] lg:items-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/8 bg-white/[0.025] font-mono text-xs text-white/40">
                  {String(index + 1).padStart(2, "0")}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CalendarDays size={14} className="text-white/30" />
                    {formatDate(match.start_time)} UTC
                  </div>
                  <div className="mt-1 text-xs text-white/30">Ends {formatDate(match.end_time)} UTC</div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.13em] text-white/30">
                    <span>Similarity</span>
                    <span>{match.similarity_score.toFixed(2)}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
                    <div className="h-full rounded-full bg-white/70" style={{ width: `${Math.min(match.similarity_score, 100)}%` }} />
                  </div>
                </div>

                <div className="border-t border-white/6 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                  <div className="text-[10px] uppercase tracking-[0.13em] text-white/30">+30 candles</div>
                  <div className="mt-1"><OutcomeCell match={match} /></div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
