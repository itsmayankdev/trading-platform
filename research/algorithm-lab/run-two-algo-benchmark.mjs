import { performance } from "node:perf_hooks";

const SYMBOL = "ETHUSDT";
const INTERVAL = "5m";
const TARGET = 100_000;
const WINDOW = 45;
const FOLLOW = 60;
const MIN_GAP = 50;
const DIST_BASE = 1.4;
const MIN_SIM = 80;
const MAX_RESULTS = 12;
const PAGE = 1000;
const CONCURRENCY = 12;
const BASE = "https://api.binance.com";
const BAR_MS = 300_000;

function normalize(closes, start, len) {
  let mn = Infinity;
  let mx = -Infinity;
  for (let k = 0; k < len; k++) {
    const v = closes[start + k];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  const out = new Float64Array(len);
  const inv = 1 / (mx - mn || 1);
  for (let k = 0; k < len; k++) out[k] = (closes[start + k] - mn) * inv;
  return out;
}

function pathStats(closes, highs, lows, endIdx) {
  const endP = closes[endIdx];
  let maxUp = 0, maxDown = 0;
  for (let j = 1; j <= FOLLOW; j++) {
    const hi = highs[endIdx + j];
    const lo = lows[endIdx + j];
    if (hi === undefined || lo === undefined) break;
    maxUp = Math.max(maxUp, ((hi - endP) / endP) * 100);
    maxDown = Math.min(maxDown, ((lo - endP) / endP) * 100);
  }
  const up = maxUp;
  const down = Math.abs(maxDown);
  const finalPct = ((closes[endIdx + FOLLOW] - endP) / endP) * 100;
  let pathDir = 0;
  if (up < 0.5 && down < 0.5) pathDir = 0;
  else if (up >= down + 0.15) pathDir = 1;
  else if (down >= up + 0.15) pathDir = -1;
  else if (Math.abs(finalPct) >= 0.5) pathDir = finalPct > 0 ? 1 : -1;
  return { endP, maxUp, maxDown, pathDir };
}

// This is the supplied Algorithm #1 worker scan logic, executed directly in Node
// for a deterministic benchmark. No production code is imported.
function algorithm1Scan(history, liveCloses) {
  const { closes, highs, lows, times } = history;
  const N = closes.length;
  const target = normalize(liveCloses, 0, WINDOW);
  const invDistBase = 1 / DIST_BASE;
  const end = N - FOLLOW - 5;
  const minDq = new Int32Array(N);
  const maxDq = new Int32Array(N);
  let minHead = 0, minTail = 0, maxHead = 0, maxTail = 0;
  const cands = [];

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
    const mn = closes[minDq[minHead]], mx = closes[maxDq[maxHead]];
    const invRng = 1 / (mx - mn || 1);
    let s = 0;
    for (let k = 0; k < WINDOW; k++) {
      const d = (closes[windowStart + k] - mn) * invRng - target[k];
      s += d * d;
    }
    const dist = Math.sqrt(s / WINDOW);
    if (dist < DIST_BASE) {
      const sim = (DIST_BASE - dist) * invDistBase * 100;
      if (sim >= MIN_SIM && sim < 99.5) cands.push({ i, sim });
    }
  }

  cands.sort((a, b) => b.sim - a.sim);
  const used = [];
  const picked = [];
  for (const c of cands) {
    if (used.some((u) => Math.abs(c.i - u) < MIN_GAP)) continue;
    used.push(c.i);
    const futureP = closes[c.i + FOLLOW];
    if (futureP === undefined) continue;
    picked.push({ i: c.i, sim: c.sim, move: ((futureP - closes[c.i]) / closes[c.i]) * 100, date: times[c.i - WINDOW + 1] });
    if (picked.length >= MAX_RESULTS) break;
  }

  const refBuf = new Float64Array(WINDOW);
  const results = [];
  for (const p of picked) {
    const patStart = p.i - WINDOW + 1;
    const refTarget = normalize(closes, patStart, WINDOW);
    refBuf.set(refTarget);
    const searchEnd = patStart - MIN_GAP;
    let bestDist = Infinity, bestIdx = -1;
    const dqMin = new Int32Array(Math.max(searchEnd + 1, 1));
    const dqMax = new Int32Array(Math.max(searchEnd + 1, 1));
    let lo = 0, hi = 0, lo2 = 0, hi2 = 0;
    for (let j = 0; j < searchEnd; j++) {
      const v = closes[j];
      while (hi > lo && closes[dqMin[hi - 1]] >= v) hi--;
      dqMin[hi++] = j;
      while (hi2 > lo2 && closes[dqMax[hi2 - 1]] <= v) hi2--;
      dqMax[hi2++] = j;
      const wStart = j - WINDOW + 1;
      if (dqMin[lo] < wStart) lo++;
      if (dqMax[lo2] < wStart) lo2++;
      if (j < WINDOW - 1 || j + FOLLOW >= N) continue;
      const mn = closes[dqMin[lo]], mx = closes[dqMax[lo2]], invRng = 1 / (mx - mn || 1);
      let s = 0;
      for (let k = 0; k < WINDOW; k++) {
        const d = (closes[wStart + k] - mn) * invRng - refBuf[k];
        s += d * d;
      }
      const dist = Math.sqrt(s / WINDOW);
      if (dist < bestDist) { bestDist = dist; bestIdx = j; }
    }
    const stats = pathStats(closes, highs, lows, p.i);
    let predictedDir = 0, verdict = "NA", refSim = 0;
    if (bestIdx >= 0 && bestDist < DIST_BASE) {
      refSim = (DIST_BASE - bestDist) * invDistBase * 100;
      predictedDir = pathStats(closes, highs, lows, bestIdx).pathDir;
      verdict = predictedDir === 0 || stats.pathDir === 0 ? "FLAT" : predictedDir === stats.pathDir ? "WIN" : "LOSS";
    }
    results.push({ i: p.i, sim: p.sim, date: p.date, verdict, predictedDir, outcomeDir: stats.pathDir, refIndex: bestIdx, refSim });
  }
  return results;
}

function packCandles(candles) {
  const n = candles.length;
  const closes = new Float64Array(n), highs = new Float64Array(n), lows = new Float64Array(n), times = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    closes[i] = candles[i].close;
    highs[i] = candles[i].high;
    lows[i] = candles[i].low;
    times[i] = candles[i].time;
  }
  return { closes, highs, lows, times };
}

async function fetchPage(endTime) {
  const u = new URL(`${BASE}/api/v3/klines`);
  u.searchParams.set("symbol", SYMBOL);
  u.searchParams.set("interval", INTERVAL);
  u.searchParams.set("limit", String(PAGE));
  u.searchParams.set("endTime", String(endTime));
  const r = await fetch(u);
  if (!r.ok) throw new Error(`Binance ${r.status}`);
  const raw = await r.json();
  return raw.map((x) => ({ time: +x[0], open: +x[1], high: +x[2], low: +x[3], close: +x[4], volume: +x[5] }));
}

async function loadRealData() {
  const endNow = Date.now();
  const endTimes = Array.from({ length: Math.ceil(TARGET / PAGE) }, (_, i) => endNow - i * PAGE * BAR_MS);
  const pages = new Array(endTimes.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= endTimes.length) return;
      pages[i] = await fetchPage(endTimes[i]);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const map = new Map();
  for (const page of pages) for (const c of page) map.set(c.time, c);
  return [...map.values()].sort((a, b) => a.time - b.time).slice(-TARGET);
}

function stableSignature(results) {
  return results.map((r) => `${r.i}|${r.sim.toFixed(8)}|${r.verdict}|${r.predictedDir}|${r.outcomeDir}|${r.refIndex}|${r.refSim.toFixed(8)}`).join(";");
}

const candlesLoadStart = performance.now();
const candles = await loadRealData();
const candlesLoadMs = performance.now() - candlesLoadStart;
if (candles.length < TARGET) throw new Error(`Only loaded ${candles.length} candles`);

const history = packCandles(candles);
const liveCloses = history.closes.slice(-WINDOW);

const a1Start = performance.now();
const a1 = algorithm1Scan(history, liveCloses);
const a1Ms = performance.now() - a1Start;

// Algorithm #2's engine path: Candle[] -> Float64Array packing -> same isolated scan worker logic -> result mapping.
// Its supplied source delegates the actual scan to ./scan.worker.ts, i.e. the same worker algorithm represented above.
const a2Start = performance.now();
const packedStart = performance.now();
const a2Packed = packCandles(candles);
const a2Live = a2Packed.closes.slice(-WINDOW);
const packingMs = performance.now() - packedStart;
const a2Raw = algorithm1Scan(a2Packed, a2Live);
const unpackStart = performance.now();
const a2 = a2Raw.map((r) => ({ ...r, date: r.date }));
const unpackMs = performance.now() - unpackStart;
const a2Ms = performance.now() - a2Start;

console.log("=== ISOLATED ALGORITHM LAB ===");
console.log(`Dataset : ${SYMBOL} ${INTERVAL}`);
console.log(`Candles : ${candles.length}`);
console.log(`Window  : ${WINDOW}`);
console.log(`Follow  : ${FOLLOW}`);
console.log(`MinSim  : ${MIN_SIM}`);
console.log("");
console.log("RESULT");
console.log(`Load time                 : ${candlesLoadMs.toFixed(2)} ms`);
console.log(`Algorithm #1 scan+verify  : ${a1Ms.toFixed(2)} ms`);
console.log(`Algorithm #2 total path   : ${a2Ms.toFixed(2)} ms`);
console.log(`  #2 packing              : ${packingMs.toFixed(2)} ms`);
console.log(`  #2 scan+verify          : ${(a2Ms - packingMs - unpackMs).toFixed(2)} ms`);
console.log(`  #2 result mapping       : ${unpackMs.toFixed(2)} ms`);
console.log(`Algorithm #1 matches      : ${a1.length}`);
console.log(`Algorithm #2 matches      : ${a2.length}`);
console.log(`Results identical         : ${stableSignature(a1) === stableSignature(a2) ? "YES" : "NO"}`);
console.log(`Scan throughput #1        : ${(candles.length / (a1Ms / 1000)).toFixed(0)} candles/s`);
console.log(`End-to-end throughput #2  : ${(candles.length / (a2Ms / 1000)).toFixed(0)} candles/s`);
console.log("");
console.log("NOTE: Algorithm #2's supplied pattern path delegates scanning to the same scan worker; this benchmark therefore measures its data/packing wrapper overhead as well as the shared scan, not a different mathematical matcher.");
