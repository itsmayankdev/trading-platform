# Competitive Feature Matrix

_Last reviewed: 2026-09-07_

This is a product-planning reference, not a claim that every competitor feature should be copied. Re-check competitor capabilities before each major release.

| Capability | TradingView | TrendSpider | ChartMill | Market Memory target |
|---|---|---|---|---|
| Professional interactive charts | Strong | Strong | Strong | **Must match baseline** |
| Multi-chart layouts | Strong | Strong | Multi-chart/chart views | **Must match baseline** |
| Watchlists | Strong | Strong / smart watchlists | Strong | **Persistent + grouped** |
| Alerts | Strong, including watchlist alerts | Strong, multi-factor and automated | Available around research workflow | **Pattern-memory alerts + standard alerts** |
| Market scanner | Strong | Strong, multi-factor | Strong technical/fundamental screener | **Pattern scanner as differentiator** |
| Automated chart pattern recognition | Strong | Strong | Strong | **Add beyond named patterns: structural analogs** |
| Multi-timeframe analysis | Strong | Strong | Strong | **Pattern + regime aware** |
| Backtesting | Strong ecosystem | Strong | Strategy/screening tools | **Historical analog evaluation + rigorous backtest layer** |
| AI research assistant | Available ecosystem | Strong AI/agent features | More traditional research | **Eventually: evidence-grounded research copilot** |
| News/fundamental context | Strong | Strong | Strong | **Add by market/asset class** |
| Historical bar replay | Strong | Available workflow | Not core differentiator | **Add research replay around matches** |
| Custom indicators / scripting | Pine Script | JavaScript / AI coding | Custom filters | **Later: safe extension layer** |
| Similar-symbol discovery | Available | Available | Screening workflows | **Pattern-based cross-symbol similarity** |
| Historical pattern analog search | Not the core product | Pattern recognition, not the same workflow | Pattern detection | **Core moat** |
| Forward outcome analysis from matched analogs | Not the core product | Strategy/backtest workflows | Screening/technical reports | **Core moat** |
| Similarity Score with exact algorithm/version | Not the core UX | Not the core UX | Not the core UX | **Core transparency feature** |
| MFE / MAE from historical matches | Not core | Backtest analytics | Risk tools | **Core evidence layer** |
| Match de-duplication / independent windows | Not core UX | Scanner/backtest context | Screening context | **Core statistical integrity** |
| Regime-aware analog search | Limited / ecosystem dependent | ML/automation ecosystem | Technical/fundamental filters | **Major differentiation target** |
| Pattern-memory alerts | Not core | Generic/multi-factor alerts | Screener-oriented | **Major differentiation target** |

## Competitive lessons

### TradingView

The baseline expectation is a highly capable chart workspace: symbol search, indicators, alerts, multiple charts, synchronized layouts, watchlists, screeners, news, calendars, replay, and customizable workspaces. TradingView documents multi-chart layouts and synchronization, including symbol/interval synchronization and chart maximization. citeturn1search0turn1search1turn1search5

**Our response:** do not try to beat TradingView at being a general charting platform on day one. Use charting as the familiar shell and make Market Memory the specialized intelligence layer.

### TrendSpider

TrendSpider currently combines automated technical/fundamental analysis, scanners, pattern recognition, multi-timeframe analysis, strategy testing, custom ML, alerts/bots, and an AI analyst. Its scanner supports multi-factor criteria across price, indicators, candlestick/chart patterns, AI models, fundamentals, relative performance, news and other data. citeturn0search0turn0search7turn0search8

**Our response:** match the automation baseline over time, but make historical analog discovery the central workflow rather than another generic indicator scanner.

### ChartMill

ChartMill emphasizes technical/fundamental screening, watchlists, chart views, support/resistance, pattern detection, technical reports, ratings, risk/position sizing, and market/sector analysis. citeturn0search1turn0search4turn0search5

**Our response:** the future screener must combine normal market filters with pattern-memory filters so users can search for current structures that resemble selected historical setups.

## Two-step-ahead opportunities

1. **Pattern Memory Alerts** — alert when a live instrument reaches a configurable similarity threshold to a saved historical setup.
2. **Cross-Market Analog Search** — search the same structure across BTC, ETH, SOL, equities, FX, commodities, and indices as data coverage expands.
3. **Regime-aware matching** — condition similarity on volatility, trend, liquidity, session, market regime, and macro context rather than treating every historical candle sequence equally.
4. **Outcome distributions, not point predictions** — show distributions, confidence intervals where statistically appropriate, hit rates, MFE/MAE, drawdown paths, and sample size.
5. **Match quality diagnostics** — explain why a match scored highly: path shape, volatility, returns, volume, momentum, range structure, and other enabled features.
6. **Forward-path overlay** — let users compare not only the matched window but the subsequent historical trajectories normalized from the match endpoint.
7. **Pattern clusters** — group many historical matches into recurring structural families instead of showing only a flat top-N list.
8. **Live market-wide scanner** — continuously find the strongest current analogs across the user's universe.
9. **Research replay** — replay a historical analog without exposing future candles until the user advances the clock, enabling unbiased study.
10. **Saved research workspaces** — preserve chart state, filters, watchlists, selected algorithm/version, and bookmarked matches.
11. **Evidence graph** — connect a current pattern to its historical matches, outcomes, regime, news/events, and related instruments.
12. **Evaluation lab** — let advanced users test whether a pattern-memory rule has genuine out-of-sample edge, with strict temporal splits and overlap controls.

## Rule for future feature decisions

A feature should enter the product when it either:

- removes a meaningful manual step for traders/researchers,
- improves analytical correctness,
- improves evidence quality,
- creates a defensible proprietary advantage, or
- makes the product meaningfully easier to use than the leading alternatives.

Avoid feature bloat that only makes the dashboard look busy.
