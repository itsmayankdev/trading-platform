export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

// Experimental copy supplied for benchmark-only evaluation.
// The implementation intentionally remains isolated from production/frontend code.
const BASE = "https://api.binance.com";
const MS_PER_BAR: Record<string, number> = {
  "1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000,
  "30m": 1_800_000, "1h": 3_600_000, "2h": 7_200_000, "4h": 14_400_000,
  "6h": 21_600_000, "8h": 28_800_000, "12h": 43_200_000,
  "1d": 86_400_000, "1w": 604_800_000,
};

async function fetchPage(symbol: string, interval: string, limit: number, endTime?: number): Promise<Candle[]> {
  const url = new URL(`${BASE}/api/v3/klines`);
  url.searchParams.set("symbol", symbol); url.searchParams.set("interval", interval); url.searchParams.set("limit", String(limit));
  if (endTime) url.searchParams.set("endTime", String(endTime));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const raw = (await res.json()) as unknown[][];
  return raw.map((r) => ({ time: r[0] as number, open: parseFloat(r[1] as string), high: parseFloat(r[2] as string), low: parseFloat(r[3] as string), close: parseFloat(r[4] as string), volume: parseFloat(r[5] as string) }));
}

export async function fetchKlines(symbol: string, interval: string, limit = 200): Promise<Candle[]> {
  return fetchPage(symbol, interval, limit);
}

export async function fetchKlinesRange(symbol: string, interval: string, startTime: number, endTime: number): Promise<Candle[]> {
  const ms = MS_PER_BAR[interval] ?? 3_600_000;
  const count = Math.min(1000, Math.ceil(Math.max(0, endTime - startTime) / ms) + 2);
  if (count <= 0) return [];
  const page = await fetchPage(symbol, interval, count, endTime);
  return page.filter((c) => c.time >= startTime && c.time <= endTime);
}

export function barIntervalMs(interval: string): number { return MS_PER_BAR[interval] ?? 3_600_000; }

type CachedHistory = { key: string; updatedAt: number; times: Float64Array; open: Float64Array; high: Float64Array; low: Float64Array; close: Float64Array; volume: Float64Array };
const DB_NAME = "tnxs-cache"; const STORE = "history"; const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => { const req = indexedDB.open(DB_NAME, DB_VERSION); req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" }); req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(null); });
}
async function cacheGet(key: string): Promise<CachedHistory | null> {
  const db = await openDb(); if (!db) return null;
  return new Promise((resolve) => { const tx = db.transaction(STORE, "readonly"); const req = tx.objectStore(STORE).get(key); req.onsuccess = () => resolve((req.result as CachedHistory) ?? null); req.onerror = () => resolve(null); });
}
async function cachePut(value: CachedHistory): Promise<void> {
  const db = await openDb(); if (!db) return;
  await new Promise<void>((resolve) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(value); tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); });
}
function packCandles(candles: Candle[]): Omit<CachedHistory, "key" | "updatedAt"> {
  const n = candles.length, times = new Float64Array(n), open = new Float64Array(n), high = new Float64Array(n), low = new Float64Array(n), close = new Float64Array(n), volume = new Float64Array(n);
  for (let i = 0; i < n; i++) { const c = candles[i]; times[i] = c.time; open[i] = c.open; high[i] = c.high; low[i] = c.low; close[i] = c.close; volume[i] = c.volume; }
  return { times, open, high, low, close, volume };
}
function unpackCandles(p: Omit<CachedHistory, "key" | "updatedAt">): Candle[] {
  const out: Candle[] = new Array(p.times.length); for (let i = 0; i < p.times.length; i++) out[i] = { time: p.times[i], open: p.open[i], high: p.high[i], low: p.low[i], close: p.close[i], volume: p.volume[i] }; return out;
}

export async function fetchHistory(symbol: string, interval: string, target = 100_000, onProgress?: (loaded: number, target: number) => void): Promise<Candle[]> {
  const PAGE = 1000, msPerBar = MS_PER_BAR[interval] ?? 3_600_000, cacheKey = `${symbol}:${interval}`, now = Date.now();
  const cached = await cacheGet(cacheKey); let base = cached ? unpackCandles(cached) : [];
  if (cached) onProgress?.(Math.min(base.length, target), target);
  const haveOldest = base.length ? base[0].time : now, need = Math.max(0, target - base.length), backfillPages = Math.ceil(need / PAGE), refreshPages = base.length ? 5 : 0;
  const endTimes: number[] = [];
  for (let i = 0; i < refreshPages; i++) endTimes.push(now - i * PAGE * msPerBar);
  for (let i = 0; i < backfillPages; i++) endTimes.push(haveOldest - i * PAGE * msPerBar);
  let loaded = base.length; const fetched: Candle[][] = new Array(endTimes.length); let cursor = 0; const CONCURRENCY = 12;
  async function worker() { while (cursor < endTimes.length) { const idx = cursor++; try { const page = await fetchPage(symbol, interval, PAGE, endTimes[idx]); fetched[idx] = page; loaded += page.length; onProgress?.(Math.min(loaded, target), target); } catch { fetched[idx] = []; } } }
  if (endTimes.length) await Promise.all(Array.from({ length: Math.min(CONCURRENCY, endTimes.length) }, worker));
  const map = new Map<number, Candle>(); for (const c of base) map.set(c.time, c); for (const page of fetched) if (page) for (const c of page) map.set(c.time, c);
  const trimmed = Array.from(map.values()).sort((a, b) => a.time - b.time).slice(-target);
  void cachePut({ key: cacheKey, updatedAt: now, ...packCandles(trimmed) }); return trimmed;
}

// Candidate's pattern engine is intentionally left as a separate benchmark dependency.
// This file tests the 100k-candle data/cache path without importing production code.
export const CANDIDATE_TARGET_CANDLES = 100_000;
