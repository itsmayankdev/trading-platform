import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { SearchResponse } from "./types";

const HORIZON_LABELS: Record<number, { label: string; detail: string }> = {
  5: { label: "+5 candles", detail: "5 candles after the matched pattern" },
  15: { label: "+15 candles", detail: "15 candles after the matched pattern" },
  30: { label: "+30 candles", detail: "30 candles after the matched pattern" },
  60: { label: "+60 candles", detail: "60 candles after the matched pattern" },
};

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
      <div className="flex h-10 items-center justify-between gap-3 border-b border-white/7 px-3.5 sm:px-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/60 sm:text-[11px]">Historical direction after match</div>
          <div className="text-[8px] text-white/28 sm:text-[9px]">Up/down outcomes after similar historical patterns · +5 = next 5 candles</div>
        </div>
        <div className="hidden font-mono text-[8px] uppercase tracking-[0.1em] text-white/25 sm:block">Descriptive · not a forecast</div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-white/7 sm:grid-cols-4">
        {directionRows.map(({ horizon, total, up, down, flat, dominant, dominantPct, consistency }) => {
          const info = HORIZON_LABELS[horizon];
          return (
            <div key={horizon} title={info.detail} className="min-w-0 px-3 py-2.5 sm:px-4">
              <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold tracking-[0.04em] text-white/60 sm:text-[11px]">{info.label}</span><span className="font-mono text-[8px] text-white/25 sm:text-[9px]">N {total}</span></div>
              <div className="mt-1.5 flex items-center gap-4 font-mono text-[14px] font-semibold tabular-nums sm:text-[15px]"><span className="flex items-center gap-1 text-emerald-400"><ArrowUpRight size={14} /> {up}</span><span className="flex items-center gap-1 text-rose-400"><ArrowDownRight size={14} /> {down}</span>{flat > 0 && <span className="text-white/35">· {flat}</span>}</div>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.07em] sm:text-[10px]"><span className={dominant === "UP" ? "text-emerald-300/80" : dominant === "DOWN" ? "text-rose-300/80" : "text-white/40"}>{dominant}</span><span className={consistency === "Strong" ? "text-white/65" : consistency === "Lean" ? "text-white/50" : "text-white/30"}>{consistency} · {dominantPct.toFixed(0)}%</span></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
