import { requestJson } from "@/lib/requestManager";

export type CachedCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Entry = { at: number; candles: CachedCandle[] };

const STALE_AFTER_MS = 5_000;
const RETAIN_MS = 5 * 60_000;
const MAX_ENTRIES = 12;
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<CachedCandle[]>>();

function key(symbol: string, timeframe: string) {
  return `${symbol.toUpperCase()}::${timeframe}`;
}

export function getMarketCandles(symbol: string, timeframe: string): CachedCandle[] | null {
  const k = key(symbol, timeframe);
  const entry = cache.get(k);
  if (!entry) return null;
  if (Date.now() - entry.at > RETAIN_MS) {
    cache.delete(k);
    return null;
  }
  return entry.candles;
}

function put(symbol: string, timeframe: string, candles: CachedCandle[]) {
  if (candles.length === 0) return;
  const k = key(symbol, timeframe);
  cache.set(k, { at: Date.now(), candles });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
}

async function fetchMarketCandles(symbol: string, timeframe: string, limit: number, force: boolean): Promise<CachedCandle[]> {
  const normalizedSymbol = symbol.toUpperCase();
  const k = key(normalizedSymbol, timeframe);
  if (!force) {
    const existing = inflight.get(k);
    if (existing) return existing;
  }

  const request = requestJson<{ candles?: CachedCandle[] }>(
    `candles:${k}:${limit}`,
    `/api/backend/api/v1/candles?${new URLSearchParams({ symbol: normalizedSymbol, timeframe, limit: String(limit) })}`,
    { ttlMs: STALE_AFTER_MS, timeoutMs: 12_000, force },
  ).then((result) => {
    const candles = Array.isArray(result.candles) ? result.candles : [];
    put(normalizedSymbol, timeframe, candles);
    return candles;
  });

  inflight.set(k, request);
  try {
    return await request;
  } finally {
    if (inflight.get(k) === request) inflight.delete(k);
  }
}

/** Return immediately when possible; only hit the network when the entry is stale/missing. */
export function prefetchMarketCandles(symbol: string, timeframe: string, limit = 240): Promise<CachedCandle[]> {
  const cached = getMarketCandles(symbol, timeframe);
  if (cached) {
    const entry = cache.get(key(symbol, timeframe));
    if (entry && Date.now() - entry.at <= STALE_AFTER_MS) return Promise.resolve(cached);
    return fetchMarketCandles(symbol, timeframe, limit, false);
  }
  return fetchMarketCandles(symbol, timeframe, limit, false);
}

/** Explicit background refresh used after the chart has already painted cached data. */
export function refreshMarketCandles(symbol: string, timeframe: string, limit = 240): Promise<CachedCandle[]> {
  return fetchMarketCandles(symbol, timeframe, limit, true);
}
