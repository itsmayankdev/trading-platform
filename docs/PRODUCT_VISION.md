# Market Memory — Product Vision

## North Star

Build a world-class market research workstation centered on a proprietary **Market Memory Engine**: given the current market structure, find the closest historical structures, show exactly what followed them, and help the user investigate the evidence without confusing similarity with probability.

The product should feel like a professional research terminal rather than a chart demo or a crypto-themed dashboard.

## Product principles

1. **Evidence first.** Every analytical claim should be traceable to market data and a defined algorithm/version.
2. **Similarity is not probability.** Similarity Score describes structural resemblance. Historical outcomes are shown separately with sample size and distributions.
3. **No look-ahead bias.** Current-pattern matching, candidate eligibility, outcomes, and backtests must preserve temporal causality.
4. **Fast path to insight.** The user should be able to select an instrument and timeframe and understand the current market, closest historical matches, and subsequent outcomes with minimal interaction.
5. **Professional density.** Use screen space for useful information: charts, market context, matches, outcomes, alerts, and research controls. Avoid decorative hero sections and redundant cards.
6. **Server-side proprietary intelligence.** Similarity algorithms, retrieval logic, scoring details, and sensitive business logic stay server-side.
7. **Everything important is versioned.** Algorithm, feature set, data source, and analysis timestamp should be identifiable.
8. **Replaceable architecture.** Retrieval, scoring, data providers, authentication, billing, notifications, and storage remain behind stable interfaces.

## Dashboard north star

The main workstation should eventually support:

- Global instrument search
- Persistent user watchlists and multiple watchlist groups
- Live quote, change, volume, volatility, and market status
- Timeframe and pattern controls with automatic analysis
- Current chart and historical-match chart side by side
- Fixed Highlight/HLT comparison mode
- Exact matched-window highlighting
- Historical continuation after the matched window
- Top-N match navigation and ranking
- Similarity Score plus match metadata
- Historical outcome distributions for multiple horizons
- MFE / MAE and excursion statistics
- Normalized-pattern comparison mode
- Multi-timeframe context
- Market regime/context panel
- Alerts when a new pattern reaches a user's configured similarity threshold
- Saved analyses/workspaces
- Search history and bookmarked matches
- Export/shareable research views
- News/events/context overlays where relevant
- Screener/scanner for finding current symbols whose patterns resemble selected historical structures

## Competitive bar

The product must continuously benchmark itself against professional charting/research platforms such as TradingView, TrendSpider, and ChartMill. We should not blindly copy them; instead, we should match expected baseline functionality and build a differentiated advantage around historical pattern memory, explainability, outcome distributions, and research workflows.

## Differentiation target

The core moat should become:

**Current market → historical analog search → ranked evidence → forward-path analysis → contextual filters → alerting → evaluation.**

The system should eventually answer questions such as:

- What historical structures look most like this one?
- How similar are they?
- What happened next at +5/+15/+30/+60/+N candles?
- How consistent were those outcomes?
- Did the result change by volatility/regime/timeframe/session?
- Which other symbols currently resemble this structure?
- Has this exact setup appeared before and what happened after it?
- When a setup appears again, can the user be alerted automatically?

## Quality bar

Before a major release, validate:

- Real-data correctness
- Look-ahead protection
- Incomplete-candle handling
- Duplicate/overlapping match handling
- Performance under realistic history sizes
- API error handling
- Responsive desktop/tablet/mobile behavior
- Keyboard accessibility for core workflows
- Secure handling of proprietary logic and secrets
- Regression tests for all core analytical behavior
