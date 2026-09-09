/// <reference lib="webworker" />
// Experimental copy supplied for benchmark-only evaluation.

export type ScanRequest = {
  type: "scan";
  historyCloses: Float64Array;
  historyHighs: Float64Array;
  historyLows: Float64Array;
  historyTimes: Float64Array;
  liveCloses: Float64Array;
  window: number;
  follow: number;
  minGap: number;
  distBase: number;
  minSim: number;
  maxResults: number;
};

export type Verdict = "WIN" | "LOSS" | "FLAT" | "NA";
export type ScanProgress = { type: "progress"; done: number; total: number };
export type ScanDone = {
  type: "done";
  results: {
    i: number; sim: number; move: number; date: number; verdict: Verdict;
    predictedDir: 1 | -1 | 0; outcomeDir: 1 | -1 | 0;
    refSim: number; refIndex: number; refDate: number; refMove: number;
    endPrice: number; finalPrice: number; maxUpPct: number; maxDownPct: number;
    barsToMaxUp: number; barsToMaxDown: number;
  }[];
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const FLAT_THRESH = 0.5;
const DOMINANCE_GAP = 0.15;

function normWindow(closes: Float64Array, start: number, len: number, out: Float64Array) {
  let mn = Infinity, mx = -Infinity;
  for (let k = 0; k < len; k++) { const v = closes[start + k]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const inv = 1 / (mx - mn || 1);
  for (let k = 0; k < len; k++) out[k] = (closes[start + k] - mn) * inv;
}

function pathStats(closes: Float64Array, highs: Float64Array, lows: Float64Array, endIdx: number, follow: number) {
  const endP = closes[endIdx];
  let maxUp = 0, maxDown = 0, barsToMaxUp = 0, barsToMaxDown = 0;
  for (let j = 1; j <= follow; j++) {
    const hi = highs[endIdx + j], lo = lows[endIdx + j];
    if (hi === undefined || lo === undefined) break;
    const upPct = ((hi - endP) / endP) * 100, downPct = ((lo - endP) / endP) * 100;
    if (upPct > maxUp) { maxUp = upPct; barsToMaxUp = j; }
    if (downPct < maxDown) { maxDown = downPct; barsToMaxDown = j; }
  }
  const upStrength = maxUp, downStrength = Math.abs(maxDown);
  const finalPct = ((closes[endIdx + follow] - endP) / endP) * 100;
  let pathDir: 1 | -1 | 0 = 0;
  if (upStrength < FLAT_THRESH && downStrength < FLAT_THRESH) pathDir = 0;
  else if (upStrength >= downStrength + DOMINANCE_GAP) pathDir = 1;
  else if (downStrength >= upStrength + DOMINANCE_GAP) pathDir = -1;
  else if (Math.abs(finalPct) >= FLAT_THRESH) pathDir = finalPct > 0 ? 1 : -1;
  return { endP, maxUp, maxDown, barsToMaxUp, barsToMaxDown, pathDir };
}

ctx.onmessage = (e: MessageEvent<ScanRequest>) => {
  const msg = e.data; if (msg.type !== "scan") return;
  const { historyCloses: closes, historyHighs: highs, historyLows: lows, historyTimes: times,
    liveCloses, window: WINDOW, follow: FOLLOW, minGap: MIN_GAP, distBase, minSim, maxResults } = msg;
  const N = closes.length, invDistBase = 1 / distBase;
  const target = new Float64Array(WINDOW); normWindow(liveCloses, 0, WINDOW, target);
  const end = N - FOLLOW - 5;
  const minDq = new Int32Array(N), maxDq = new Int32Array(N);
  let minHead = 0, minTail = 0, maxHead = 0, maxTail = 0;
  const cands: { i: number; sim: number }[] = [];
  for (let i = 0; i < end; i++) {
    const v = closes[i];
    while (minTail > minHead && closes[minDq[minTail - 1]] >= v) minTail--;
    minDq[minTail++] = i;
    while (maxTail > maxHead && closes[maxDq[maxTail - 1]] <= v) maxTail--;
    maxDq[maxTail++] = i;
    const windowStart = i - WINDOW + 1;
    if (minDq[minHead] < windowStart) minHead++;
    if (maxDq[maxHead] < windowStart) maxHead++;
    if (i < WINDOW - 1) continue;
    const mn = closes[minDq[minHead]], mx = closes[maxDq[maxHead]], invRng = 1 / (mx - mn || 1);
    let s = 0;
    for (let k = 0; k < WINDOW; k++) { const d = (closes[windowStart + k] - mn) * invRng - target[k]; s += d * d; }
    const dist = Math.sqrt(s / WINDOW);
    if (dist < distBase) { const sim = (distBase - dist) * invDistBase * 100; if (sim >= minSim && sim < 99.5) cands.push({ i, sim }); }
  }
  cands.sort((a, b) => b.sim - a.sim);
  const used: number[] = [], picked: { i: number; sim: number; move: number; date: number }[] = [];
  for (const c of cands) {
    if (used.some(u => Math.abs(c.i - u) < MIN_GAP)) continue;
    used.push(c.i); const endP = closes[c.i], futureP = closes[c.i + FOLLOW];
    if (futureP === undefined) continue;
    picked.push({ i: c.i, sim: c.sim, move: ((futureP - endP) / endP) * 100, date: times[c.i - WINDOW + 1] });
    if (picked.length >= maxResults) break;
  }
  const refBuf = new Float64Array(WINDOW), results: ScanDone["results"] = [];
  for (const p of picked) {
    const patStart = p.i - WINDOW + 1; normWindow(closes, patStart, WINDOW, refBuf);
    const searchEnd = patStart - MIN_GAP; let lo = 0, hi = 0, lo2 = 0, hi2 = 0, bestDist = Infinity, bestIdx = -1;
    const dqMin = new Int32Array(Math.max(searchEnd + 1, 1)), dqMax = new Int32Array(Math.max(searchEnd + 1, 1));
    for (let j = 0; j < searchEnd; j++) {
      const v = closes[j];
      while (hi > lo && closes[dqMin[hi - 1]] >= v) hi--; dqMin[hi++] = j;
      while (hi2 > lo2 && closes[dqMax[hi2 - 1]] <= v) hi2--; dqMax[hi2++] = j;
      const wStart = j - WINDOW + 1;
      if (dqMin[lo] < wStart) lo++; if (dqMax[lo2] < wStart) lo2++;
      if (j < WINDOW - 1 || j + FOLLOW >= N) continue;
      const mn = closes[dqMin[lo]], mx = closes[dqMax[lo2]], invRng = 1 / (mx - mn || 1); let s = 0;
      for (let k = 0; k < WINDOW; k++) { const d = (closes[wStart + k] - mn) * invRng - refBuf[k]; s += d * d; }
      const dist = Math.sqrt(s / WINDOW); if (dist < bestDist) { bestDist = dist; bestIdx = j; }
    }
    const pstats = pathStats(closes, highs, lows, p.i, FOLLOW);
    let verdict: Verdict = "NA", predictedDir: 1 | -1 | 0 = 0, refSim = 0, refMove = 0;
    if (bestIdx >= 0 && bestDist < distBase) {
      refSim = (distBase - bestDist) * invDistBase * 100;
      const refEnd = closes[bestIdx], refFuture = closes[bestIdx + FOLLOW]; refMove = ((refFuture - refEnd) / refEnd) * 100;
      predictedDir = pathStats(closes, highs, lows, bestIdx, FOLLOW).pathDir;
      verdict = predictedDir === 0 ? "FLAT" : pstats.pathDir === 0 ? "FLAT" : pstats.pathDir === predictedDir ? "WIN" : "LOSS";
    }
    const finalPrice = closes[p.i + FOLLOW];
    results.push({ i: p.i, sim: p.sim, move: p.move, date: p.date, verdict, predictedDir, outcomeDir: pstats.pathDir,
      refSim, refIndex: bestIdx, refDate: bestIdx >= 0 ? times[bestIdx - WINDOW + 1] : 0, refMove,
      endPrice: pstats.endP, finalPrice, maxUpPct: pstats.maxUp, maxDownPct: pstats.maxDown,
      barsToMaxUp: pstats.barsToMaxUp, barsToMaxDown: pstats.barsToMaxDown });
  }
  ctx.postMessage({ type: "done", results } satisfies ScanDone);
};

export {};
