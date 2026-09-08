import type { ForwardPath } from "./types";

function formatPct(value: number) { return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`; }
function quantile(values: number[], q: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b); const position = (sorted.length - 1) * q; const lower = Math.floor(position); const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]; return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export default function ForwardPathChart({ paths, selectedMatchIndex = 0 }: { paths?: ForwardPath[]; selectedMatchIndex?: number }) {
  const safePaths = Array.isArray(paths) ? paths.filter((path) => Array.isArray(path?.values) && path.values.length > 0) : [];
  if (!safePaths.length) return null;
  const width = 900; const height = 270; const pad = { top: 22, right: 58, bottom: 32, left: 54 }; const plotWidth = width - pad.left - pad.right; const plotHeight = height - pad.top - pad.bottom;
  const maxSteps = Math.max(...safePaths.map((path) => path.values.length));
  const columns = Array.from({ length: maxSteps }, (_, index) => safePaths.map((path) => path.values[index]).filter((value): value is number => typeof value === "number" && Number.isFinite(value)));
  const allValues = columns.flatMap((values) => values); if (!allValues.length) return null;
  const low = Math.min(-0.02, ...allValues); const high = Math.max(0.02, ...allValues); const range = Math.max(high - low, 0.0001);
  const x = (step: number) => pad.left + (step / Math.max(maxSteps - 1, 1)) * plotWidth; const y = (value: number) => pad.top + ((high - value) / range) * plotHeight;
  const linePoints = (values: number[]) => values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const median = columns.map((values) => quantile(values, 0.5)); const p25 = columns.map((values) => quantile(values, 0.25)); const p75 = columns.map((values) => quantile(values, 0.75));
  const bandPoints = `${p25.map((value, index) => `${x(index)},${y(value)}`).join(" ")} ${p75.map((value, index) => `${x(p75.length - 1 - index)},${y(p75[p75.length - 1 - index])}`).join(" ")}`;
  const ticks = [high, (high + low) / 2, low]; const finalMedian = median.at(-1) ?? 0; const finalUp = safePaths.filter((path) => (path.values.at(-1) ?? 0) >= 0).length;
  const selected = safePaths.find((path) => path.match_index === selectedMatchIndex + 1);

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/7 px-4 py-2.5"><div><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Historical forward paths</div><div className="mt-0.5 text-[8px] text-white/20">All matches normalized to 0% at the match point · next 60 candles</div></div><div className="hidden items-center gap-3 text-[8px] uppercase tracking-[0.1em] text-white/25 sm:flex"><span>25–75% range</span><span>Median path</span><span>{safePaths.length} matches</span>{selected && <span className="text-amber-200/70">Match {String(selected.match_index).padStart(2, "0")} selected</span>}</div></div>
      <div className="px-2 pb-1 pt-1 sm:px-3"><svg viewBox={`0 0 ${width} ${height}`} className="h-[235px] w-full" role="img" aria-label="Normalized historical forward paths">
        {ticks.map((tick) => <g key={tick}><line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="rgba(255,255,255,0.06)" /><text x={pad.left - 8} y={y(tick) + 3} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.3)" fontFamily="monospace">{formatPct(tick)}</text></g>)}
        <line x1={x(0)} x2={x(0)} y1={pad.top} y2={height - pad.bottom} stroke="rgba(245,158,11,0.3)" strokeDasharray="3 3" /><polygon points={bandPoints} fill="rgba(255,255,255,0.07)" />
        {safePaths.map((path) => { const active = path.match_index === selectedMatchIndex + 1; return <polyline key={path.match_index} points={linePoints(path.values)} fill="none" stroke={active ? "rgba(245,158,11,0.95)" : "rgba(255,255,255,0.11)"} strokeWidth={active ? "2.5" : "1"} />; })}
        <polyline points={linePoints(median)} fill="none" stroke="rgba(255,255,255,0.82)" strokeWidth="2" /><text x={x(0) + 5} y={pad.top - 7} fontSize="8" fill="rgba(245,158,11,0.75)" fontFamily="sans-serif">MATCH POINT</text><text x={x(maxSteps - 1)} y={height - 10} textAnchor="end" fontSize="8" fill="rgba(255,255,255,0.25)" fontFamily="sans-serif">+{maxSteps - 1} candles</text><text x={pad.left} y={height - 10} fontSize="8" fill="rgba(255,255,255,0.25)" fontFamily="sans-serif">0</text>
      </svg></div>
      <div className="grid grid-cols-3 border-t border-white/7 text-center"><div className="px-2 py-1.5"><div className="text-[8px] uppercase tracking-[0.12em] text-white/25">Median @ +60</div><div className={`mt-0.5 font-mono text-xs ${finalMedian >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{formatPct(finalMedian)}</div></div><div className="border-x border-white/6 px-2 py-1.5"><div className="text-[8px] uppercase tracking-[0.12em] text-white/25">25th–75th @ +60</div><div className="mt-0.5 font-mono text-xs text-white/55">{formatPct(p25.at(-1) ?? 0)} → {formatPct(p75.at(-1) ?? 0)}</div></div><div className="px-2 py-1.5"><div className="text-[8px] uppercase tracking-[0.12em] text-white/25">Path agreement</div><div className="mt-0.5 font-mono text-xs text-white/55">{finalMedian >= 0 ? `${finalUp}/${safePaths.length} up` : `${safePaths.length - finalUp}/${safePaths.length} down`}</div></div></div>
    </section>
  );
}
