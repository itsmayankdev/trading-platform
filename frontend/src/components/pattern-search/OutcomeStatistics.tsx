import { Info } from "lucide-react";
import type { Statistic } from "./types";

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

function directionLabel(value: number) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

export default function OutcomeStatistics({ statistics }: { statistics: Statistic[] }) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-white/8 px-4 py-4 sm:px-5">
        <div className="eyebrow">What happened after similar patterns</div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">Historical outcomes</h2>
        <div className="mt-2 max-w-4xl text-xs leading-5 text-white/45">
          Read this as a simple historical guide: <span className="text-white/70">what was the average move, how often did price finish higher, and how much did price move against or in favor of the trade before the horizon?</span>
        </div>
      </div>

      <div className="grid gap-px border-b border-white/7 bg-white/[0.045] sm:grid-cols-3">
        <div className="bg-[#070a0f] px-4 py-3 sm:px-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Average outcome</div>
          <p className="mt-1 text-xs leading-5 text-white/35">The average price change when the same horizon was reached.</p>
        </div>
        <div className="bg-[#070a0f] px-4 py-3 sm:px-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Average best move</div>
          <p className="mt-1 text-xs leading-5 text-white/35">How far price moved in the favorable direction on average before the horizon. This is MFE.</p>
        </div>
        <div className="bg-[#070a0f] px-4 py-3 sm:px-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Average worst move</div>
          <p className="mt-1 text-xs leading-5 text-white/35">How far price moved against the entry on average before the horizon. This is MAE.</p>
        </div>
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
                <td className="px-4 py-3.5 font-semibold sm:px-5">+{stat.horizon_candles} candles</td>
                <td className="px-4 py-3.5 font-mono text-xs text-white/55 sm:px-5">{stat.sample_size}</td>
                <td className="px-4 py-3.5 sm:px-5">
                  <span className={stat.mean_return >= 0 ? "font-semibold text-emerald-400" : "font-semibold text-red-400"}>{pct(stat.mean_return)}</span>
                  <span className="ml-2 text-[10px] text-white/30">avg</span>
                </td>
                <td className="px-4 py-3.5 sm:px-5">
                  <span className="font-medium">{pct(stat.median_return)}</span>
                  <span className="ml-2 text-[10px] text-white/30">typical</span>
                </td>
                <td className="px-4 py-3.5 sm:px-5">
                  <span className="font-semibold">{(stat.win_rate * 100).toFixed(1)}%</span>
                  <span className="ml-2 text-[10px] text-white/30">up</span>
                </td>
                <td className="px-4 py-3.5 text-white/70 sm:px-5">
                  <span className="font-medium">{pct(stat.mean_mfe)}</span>
                  <span className="ml-2 text-[10px] text-white/30">favorable</span>
                </td>
                <td className="px-4 py-3.5 text-white/70 sm:px-5">
                  <span className="font-medium">{pct(stat.mean_mae)}</span>
                  <span className="ml-2 text-[10px] text-white/30">against</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-start gap-2 border-t border-white/7 px-4 py-3 text-[11px] leading-5 text-white/30 sm:px-5">
        <Info size={14} className="mt-0.5 shrink-0 text-white/35" />
        <span><strong className="font-medium text-white/50">How to use it:</strong> Average outcome tells you the typical result. Finished higher tells you how often the match ended above its entry price. Average best move shows the opportunity that appeared along the way; average worst move shows the adverse move you would have had to withstand. These are historical observations, not a forecast.</span>
      </div>
    </section>
  );
}
