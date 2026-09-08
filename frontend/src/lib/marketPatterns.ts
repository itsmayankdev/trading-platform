export type MarketPatternDefinition = {
  id: string;
  name: string;
  category: "chart" | "candlestick";
  direction: "bullish" | "bearish" | "neutral";
  description: string;
  whatToLookFor: string;
  detectionStatus: "ready" | "planned";
};

export const MARKET_PATTERNS: MarketPatternDefinition[] = [
  { id: "head-and-shoulders", name: "Head & Shoulders", category: "chart", direction: "bearish", description: "Three peaks where the middle peak is the highest.", whatToLookFor: "Left shoulder → higher head → right shoulder, followed by a neckline break.", detectionStatus: "ready" },
  { id: "inverse-head-and-shoulders", name: "Inverse Head & Shoulders", category: "chart", direction: "bullish", description: "Three troughs where the middle trough is the deepest.", whatToLookFor: "Left low → deeper head → right low, followed by a neckline break.", detectionStatus: "ready" },
  { id: "double-top", name: "Double Top", category: "chart", direction: "bearish", description: "Two similar highs separated by a pullback.", whatToLookFor: "Two peaks at roughly the same level with a clear valley between them.", detectionStatus: "ready" },
  { id: "double-bottom", name: "Double Bottom", category: "chart", direction: "bullish", description: "Two similar lows separated by a rebound.", whatToLookFor: "Two troughs near the same level with a clear peak between them.", detectionStatus: "ready" },
  { id: "triple-top", name: "Triple Top", category: "chart", direction: "bearish", description: "Three failed attempts to break a similar resistance level.", whatToLookFor: "Three comparable peaks with pullbacks between them.", detectionStatus: "ready" },
  { id: "triple-bottom", name: "Triple Bottom", category: "chart", direction: "bullish", description: "Three failed attempts to break a similar support level.", whatToLookFor: "Three comparable lows with rebounds between them.", detectionStatus: "ready" },
  { id: "ascending-triangle", name: "Ascending Triangle", category: "chart", direction: "bullish", description: "Flat resistance with progressively higher lows.", whatToLookFor: "Repeated highs near one level while swing lows rise.", detectionStatus: "ready" },
  { id: "descending-triangle", name: "Descending Triangle", category: "chart", direction: "bearish", description: "Flat support with progressively lower highs.", whatToLookFor: "Repeated lows near one level while swing highs fall.", detectionStatus: "ready" },
  { id: "symmetrical-triangle", name: "Symmetrical Triangle", category: "chart", direction: "neutral", description: "Lower highs and higher lows compress into an apex.", whatToLookFor: "Two converging trendlines with shrinking price swings.", detectionStatus: "ready" },
  { id: "rising-wedge", name: "Rising Wedge", category: "chart", direction: "bearish", description: "Price rises while the trading range narrows.", whatToLookFor: "Both boundaries rise, but the lower and upper lines converge.", detectionStatus: "ready" },
  { id: "falling-wedge", name: "Falling Wedge", category: "chart", direction: "bullish", description: "Price falls while the trading range narrows.", whatToLookFor: "Both boundaries fall while converging toward an apex.", detectionStatus: "ready" },
  { id: "bull-flag", name: "Bull Flag", category: "chart", direction: "bullish", description: "A sharp rise followed by a compact downward or sideways channel.", whatToLookFor: "Strong impulse up → controlled consolidation → upside breakout.", detectionStatus: "ready" },
  { id: "bear-flag", name: "Bear Flag", category: "chart", direction: "bearish", description: "A sharp fall followed by a compact upward or sideways channel.", whatToLookFor: "Strong impulse down → controlled consolidation → downside breakout.", detectionStatus: "ready" },
  { id: "pennant", name: "Pennant", category: "chart", direction: "neutral", description: "A strong impulse followed by a small converging consolidation.", whatToLookFor: "Flagpole → contracting range → breakout in the impulse direction.", detectionStatus: "ready" },
  { id: "rectangle", name: "Rectangle", category: "chart", direction: "neutral", description: "Price oscillates between clear horizontal support and resistance.", whatToLookFor: "Multiple reactions from two approximately parallel horizontal levels.", detectionStatus: "ready" },
  { id: "cup-and-handle", name: "Cup & Handle", category: "chart", direction: "bullish", description: "Rounded recovery followed by a smaller pullback.", whatToLookFor: "Rounded U-shaped base → shallow handle → resistance breakout.", detectionStatus: "ready" },
  { id: "doji", name: "Doji", category: "candlestick", direction: "neutral", description: "Open and close are very close together.", whatToLookFor: "Small real body compared with the candle's total range.", detectionStatus: "ready" },
  { id: "hammer", name: "Hammer", category: "candlestick", direction: "bullish", description: "Small body with a long lower wick after a decline.", whatToLookFor: "Long lower shadow, small body near the upper part of the candle.", detectionStatus: "ready" },
  { id: "shooting-star", name: "Shooting Star", category: "candlestick", direction: "bearish", description: "Small body with a long upper wick after an advance.", whatToLookFor: "Long upper shadow, small body near the lower part of the candle.", detectionStatus: "ready" },
  { id: "bullish-engulfing", name: "Bullish Engulfing", category: "candlestick", direction: "bullish", description: "A bullish candle fully covers the prior bearish body.", whatToLookFor: "Two candles: bearish first, then a larger bullish real body.", detectionStatus: "ready" },
  { id: "bearish-engulfing", name: "Bearish Engulfing", category: "candlestick", direction: "bearish", description: "A bearish candle fully covers the prior bullish body.", whatToLookFor: "Two candles: bullish first, then a larger bearish real body.", detectionStatus: "ready" },
  { id: "morning-star", name: "Morning Star", category: "candlestick", direction: "bullish", description: "A three-candle reversal structure after a decline.", whatToLookFor: "Large bearish candle → small middle candle → strong bullish recovery candle.", detectionStatus: "ready" },
  { id: "evening-star", name: "Evening Star", category: "candlestick", direction: "bearish", description: "A three-candle reversal structure after an advance.", whatToLookFor: "Large bullish candle → small middle candle → strong bearish reversal candle.", detectionStatus: "ready" },
  { id: "three-white-soldiers", name: "Three White Soldiers", category: "candlestick", direction: "bullish", description: "Three consecutive strong bullish candles.", whatToLookFor: "Three rising bullish bodies with closes progressing higher.", detectionStatus: "ready" },
  { id: "three-black-crows", name: "Three Black Crows", category: "candlestick", direction: "bearish", description: "Three consecutive strong bearish candles.", whatToLookFor: "Three falling bearish bodies with closes progressing lower.", detectionStatus: "ready" },
];

export const MARKET_PATTERN_MAP = new Map(MARKET_PATTERNS.map((pattern) => [pattern.id, pattern]));
