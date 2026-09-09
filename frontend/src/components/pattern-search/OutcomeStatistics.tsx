import { Info } from "lucide-react";
import type { Statistic } from "./types";

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

function horizonTime(candles: number, timeframe: string) {
  const match = timeframe.match(/^(\d+)(m|h|d)$/i);
  if (!match) return `${candles} candles`;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const minutes = candles * amount * (unit === "h" ? 60 : unit === "d" ? 1440 : 1);
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(minutes % 60 ? 1 : 0)} hr`;
  return `${(minutes / 1440).toFixed(minutes % 1440 ? 1 : 0)} day`;
}

export default function OutcomeStatistics({ statistics, timeframe = "5m" }: { statistics: Statistic[]; timeframe?: string }) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-white/8 px-4 py-4 sm:px-5">
        <div className="eyebrow">What happened after similar patterns</div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">Historical outcomes</h2>
        <div className="mt-2 max-w-4xl text-xs leading-5 text-white/45">
          Each <strong className="font-medium text-white/65">+5, +15, +30 or +60</strong> means how many candles after the matched pattern we measure the result. The actual time depends on your selected timeframe.
        </div>
      </div>

      <div className="grid gap-px border-b border-white/7 bg-white/[0.045] sm:grid-cols-3">
        <div className="bg-[#070a0f] px-4 py-3 sm:px-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Average outcome</div>
          <p className="mt-1 text-xs leading-5 text-white/35">The average price change at the selected time after the match.</p>
        </div>
        <div className="bg-[#070a0f] px-4 py-3 sm:px-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Average best move</div>
          <p className="mt-1 text-xs leading-5 text-white/35">How far price moved favorably at any point before that horizon. Also called MFE.</p>
        </div>
        <div className="bg-[#070a0f] px-4 py-3 sm:px-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Average worst move</div>
          <p className="mt-1 text-xs leading-5 text-white/35">How far price moved against the entry at any point before that horizon. Also called MAE.</p>
        </div>
      </div>

      <div className="mx-4 my-3 rounded-lg border border-amber-300/10 bg-amber-300/[0.025] px-3 py-2.5 text-xs leading-5 text-white/45 sm:mx-5">
        <strong className="font-medium text-amber-200/80">Example:</strong> on a <strong className="font-medium text-white/70">5-minute chart</strong>, +5 = 25 minutes later, +15 = 75 minutes later, +30 = 2.5 hours later and +60 = 5 hours later. On a 15-minute chart, the same +60 means 15 hours.
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-white/7 bg-white/[0.012] text-[10px] uppercase tracking-[0.12em] text-white/35">
            <tr>
              <th className="px-4 py-3 font-medium sm:px-5">After</th>
              <th className="px-4 py-3 font-medium sm:px-5">Matches</th>
              <th className="px-4 py-3 font-medium sm:px-5">Average outcome</th>
              <th className="px-4 py-3 font-medium sm:px-5">Median outcome</th>
              <th className="px-4 py-3 font-medium sm:px-5">Finished higher</th>
              <th className="px-4 py-3 font-medium sm:px-5">Average best move</th>
              <th className="px-4 py-3 font-medium sm:px-5">Average worst move</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/6">
            {statistics.map((stat) => (
              <tr key={stat.horizon_candles} className="transition hover:bg-white/[0.018]">
                <td className="px-4 py-3.5 sm:px-5"><div className="font-semibold">+{stat.horizon_candles} candles</div><div className="mt-0.5 text-[10px] text-white/30">{horizonTime(stat.horizon_candles, timeframe)} later</div></td>
                <td className="px-4 py-3.5 font-mono text-xs text-white/55 sm:px-5">{stat.sample_size}</td>
                <td className="px-4 py-3.5 sm:px-5"><span className={stat.mean_return >= 0 ? "font-semibold text-emerald-400" : "font-semibold text-red-400"}>{pct(stat.mean_return)}</span><span className="ml-2 text-[10px] text-white/30">average</span></td>
                <td className="px-4 py-3.5 sm:px-5"><span className="font-medium">{pct(stat.median_return)}</span><span className="ml-2 text-[10px] text-white/30">typical</span></td>
                <td className="px-4 py-3.5 sm:px-5"><span className="font-semibold">{(stat.win_rate * 100).toFixed(1)}%</span><span className="ml-2 text-[10px] text-white/30">ended up</span></td>
                <td className="px-4 py-3.5 text-white/70 sm:px-5"><span className="font-medium">{pct(stat.mean_mfe)}</span><span className="ml-2 text-[10px] text-white/30">best</span></td>
                <td className="px-4 py-3.5 text-white/70 sm:px-5"><span className="font-medium">{pct(stat.mean_mae)}</span><span className="ml-2 text-[10px] text-white/30">worst</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-start gap-2 border-t border-white/7 px-4 py-3 text-[11px] leading-5 text-white/30 sm:px-5">
        <Info size={14} className="mt-0.5 shrink-0 text-white/35" />
        <span><strong className="font-medium text-white/50">How to use it:</strong> First look at the average outcome and “ended up” percentage. Then use the best/worst move to understand the range of movement that occurred before the horizon. These are historical observations, not a forecast.</span>
      </div>
    </section>
  );
}
