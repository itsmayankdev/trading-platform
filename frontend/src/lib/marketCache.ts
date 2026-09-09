export type CachedCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Entry = { at: number; candles: CachedCandle[] };

const TTL_MS = 30_000;
const MAX_ENTRIES = 12;
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<CachedCandle[]>>();

function key(symbol: string, timeframe: string) {
  return `${symbol.toUpperCase()}::${timeframe}`;
}

export function getMarketCandles(symbol: string, timeframe: string): CachedCandle[] | null {
  const entry = cache.get(key(symbol, timeframe));
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    cache.delete(key(symbol, timeframe));
    return null;
  }
  return entry.candles;
}

function put(symbol: string, timeframe: string, candles: CachedCandle[]) {
  const k = key(symbol, timeframe);
  cache.set(k, { at: Date.now(), candles });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
}

export function prefetchMarketCandles(symbol: string, timeframe: string, limit = 240): Promise<CachedCandle[]> {
  const k = key(symbol, timeframe);
  const cached = getMarketCandles(symbol, timeframe);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(k);
  if (existing) return existing;

  const request = fetch(
    `/api/backend/api/v1/candles?${new URLSearchParams({ symbol: symbol.toUpperCase(), timeframe, limit: String(limit) })}`,
    { credentials: "include", cache: "no-store" },
  )
    .then(async (response) => {
      if (!response.ok) throw new Error(`Candle API returned ${response.status}`);
      const result = (await response.json()) as { candles?: CachedCandle[] };
      const candles = Array.isArray(result.candles) ? result.candles : [];
      put(symbol, timeframe, candles);
      return candles;
    })
    .finally(() => inflight.delete(k));

  inflight.set(k, request);
  return request;
}
