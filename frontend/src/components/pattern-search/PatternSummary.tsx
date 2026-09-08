import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { SearchResponse } from "./types";

export default function PatternSummary({ data }: { data: SearchResponse }) {
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
      <div className="flex items-center justify-between gap-4 border-b border-white/8 px-4 py-3 sm:px-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55 sm:text-[11px]">Historical direction after match</div>
        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/25 sm:text-[10px]">Descriptive · not a forecast</div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 sm:gap-3 sm:p-4">
        {directionRows.map(({ horizon, total, up, down, flat, dominant, dominantPct, consistency }) => (
          <div key={horizon} className="rounded-md border border-white/8 bg-white/[0.015] px-3 py-3 sm:px-4 sm:py-3.5">
            <div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45 sm:text-[11px]">+{horizon}</span><span className="font-mono text-[9px] text-white/25 sm:text-[10px]">N {total}</span></div>
            <div className="mt-2 flex items-center gap-4 font-mono text-[12px] font-semibold tabular-nums sm:text-[13px]"><span className="flex items-center gap-1.5 text-emerald-400"><ArrowUpRight size={13} /> {up}</span><span className="flex items-center gap-1.5 text-rose-400"><ArrowDownRight size={13} /> {down}</span>{flat > 0 && <span className="text-white/35">• {flat}</span>}</div>
            <div className="mt-2 flex items-center justify-between border-t border-white/6 pt-2 text-[9px] uppercase tracking-[0.08em] sm:text-[10px]"><span className="text-white/35">{dominant}</span><span className={consistency === "Strong" ? "text-white/65" : consistency === "Lean" ? "text-white/50" : "text-white/30"}>{consistency} · {dominantPct.toFixed(0)}%</span></div>
          </div>
        ))}
      </div>
    </section>
  );
}
