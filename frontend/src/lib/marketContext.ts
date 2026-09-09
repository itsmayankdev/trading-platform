"use client";

export const MARKET_CONTEXT_KEY = "market-memory-global-market-v1";
export const MARKET_CONTEXT_EVENT = "market-memory-global-market-change";

export type GlobalMarket = {
  symbol: string;
  timeframe?: string;
};

export function normalizeMarketSymbol(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function readGlobalMarket(fallback = "ETHUSDT"): GlobalMarket {
  if (typeof window === "undefined") return { symbol: fallback };
  try {
    const raw = localStorage.getItem(MARKET_CONTEXT_KEY);
    if (!raw) return { symbol: fallback };
    const parsed = JSON.parse(raw) as Partial<GlobalMarket>;
    const symbol = normalizeMarketSymbol(String(parsed.symbol || fallback));
    return { symbol: symbol || fallback, timeframe: parsed.timeframe || undefined };
  } catch {
    return { symbol: fallback };
  }
}

export function writeGlobalMarket(symbol: string, timeframe?: string) {
  if (typeof window === "undefined") return;
  const normalized = normalizeMarketSymbol(symbol);
  if (!normalized) return;
  const current = readGlobalMarket();
  const next: GlobalMarket = { symbol: normalized, timeframe: timeframe || current.timeframe };
  localStorage.setItem(MARKET_CONTEXT_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent<GlobalMarket>(MARKET_CONTEXT_EVENT, { detail: next }));
}

export function useGlobalMarket(fallback = "ETHUSDT") {
  const React = require("react") as typeof import("react");
  const [market, setMarket] = React.useState<GlobalMarket>(() => readGlobalMarket(fallback));

  React.useEffect(() => {
    const sync = (event?: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as GlobalMarket : undefined;
      setMarket(detail?.symbol ? detail : readGlobalMarket(fallback));
    };
    window.addEventListener(MARKET_CONTEXT_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MARKET_CONTEXT_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [fallback]);

  const selectMarket = React.useCallback((symbol: string, timeframe?: string) => {
    const normalized = normalizeMarketSymbol(symbol);
    if (!normalized) return;
    writeGlobalMarket(normalized, timeframe);
    setMarket({ symbol: normalized, timeframe: timeframe || market.timeframe });
  }, [market.timeframe]);

  return { market, symbol: market.symbol, timeframe: market.timeframe, selectMarket };
}
