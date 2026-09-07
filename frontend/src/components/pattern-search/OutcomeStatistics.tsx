import { Info } from "lucide-react";
import type { Statistic } from "./types";

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

export default function OutcomeStatistics({ statistics }: { statistics: Statistic[] }) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-white/8 px-5 py-4">
        <div className="eyebrow">Historical outcomes</div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">Outcome statistics</h2>
        <div className="mt-2 flex items-start gap-2 text-xs leading-5 text-white/35">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>These are observations from the displayed historical matches, not probabilities or forecasts.</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-white/7 bg-white/[0.012] text-[10px] uppercase tracking-[0.14em] text-white/30">
            <tr>
              <th className="px-5 py-3 font-medium">Horizon</th>
              <th className="px-5 py-3 font-medium">Samples</th>
              <th className="px-5 py-3 font-medium">Mean return</th>
              <th className="px-5 py-3 font-medium">Median</th>
              <th className="px-5 py-3 font-medium">Win rate</th>
              <th className="px-5 py-3 font-medium">Mean MFE</th>
              <th className="px-5 py-3 font-medium">Mean MAE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/6">
            {statistics.map((stat) => (
              <tr key={stat.horizon_candles} className="transition hover:bg-white/[0.018]">
                <td className="px-5 py-4 font-semibold">+{stat.horizon_candles}</td>
                <td className="px-5 py-4 font-mono text-xs text-white/45">{stat.sample_size}</td>
                <td className={stat.mean_return >= 0 ? "px-5 py-4 text-emerald-400" : "px-5 py-4 text-red-400"}>{pct(stat.mean_return)}</td>
                <td className="px-5 py-4">{pct(stat.median_return)}</td>
                <td className="px-5 py-4">{(stat.win_rate * 100).toFixed(1)}%</td>
                <td className="px-5 py-4 text-white/65">{pct(stat.mean_mfe)}</td>
                <td className="px-5 py-4 text-white/65">{pct(stat.mean_mae)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
