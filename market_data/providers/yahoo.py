from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

import yfinance as yf

from market_data.interface import Candle, MarketDataProvider


@dataclass(frozen=True)
class YahooSearchResult:
    symbol: str
    name: str
    exchange: str | None
    quote_type: str | None
    currency: str | None
    score: float


@dataclass(frozen=True)
class YahooQuote:
    symbol: str
    price: float
    change_percent: float | None
    currency: str | None


class YahooFinanceProvider(MarketDataProvider):
    """Isolated Yahoo Finance adapter.

    Yahoo remains a separate provider from Binance. Only explicitly selected
    Yahoo instruments are persisted and warmed; we never mirror the entire
    Yahoo universe into the database.
    """

    INTERVALS = {"1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo"}
    _SEARCH_TTL_SECONDS = 45

    def get_candles(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> list[Candle]:
        interval = self._interval(timeframe)
        if start.tzinfo is None or end.tzinfo is None:
            raise ValueError("start and end must be timezone-aware")
        if start >= end:
            raise ValueError("start must be before end")

        # Yahoo is more reliable for intraday requests when its supported
        # period form is used. We deliberately keep the foreground period
        # small and filter it back to the exact requested UTC range.
        days = (end - start).total_seconds() / 86400.0
        if interval == "1m":
            period = "7d"
        elif interval in {"2m", "5m", "15m", "30m", "60m", "90m", "1h"}:
            period = "60d" if days > 5 else "5d"
        else:
            period = "10y"

        frame = yf.Ticker(symbol.upper()).history(
            period=period,
            interval=interval,
            auto_adjust=False,
            actions=False,
            prepost=False,
            repair=False,
            timeout=12,
        )
        if frame is None or frame.empty:
            return []

        try:
            start_utc = start.astimezone(timezone.utc)
            end_utc = end.astimezone(timezone.utc)
            index = frame.index
            frame = frame[(index >= start_utc) & (index <= end_utc)]
        except (TypeError, ValueError):
            pass

        return self._frame_to_candles(frame)

    def search(self, query: str, limit: int = 12) -> list[YahooSearchResult]:
        normalized = query.strip()
        if not normalized:
            return []
        return list(_cached_search(normalized, max(1, min(limit, 20))))

    def quote(self, symbol: str) -> YahooQuote:
        normalized = symbol.strip().upper()
        ticker = yf.Ticker(normalized)
        try:
            info = ticker.fast_info
            price = float(info.get("lastPrice"))
            previous = info.get("previousClose")
            currency = str(info.get("currency")) if info.get("currency") else None
            change = ((price / float(previous)) - 1.0) * 100.0 if previous not in (None, 0) else None
            if price > 0:
                return YahooQuote(normalized, price, change, currency)
        except Exception:
            pass

        frame = ticker.history(period="2d", interval="1d", auto_adjust=False, actions=False, repair=False, timeout=12)
        if frame is None or frame.empty or "Close" not in frame:
            raise ValueError(f"Yahoo Finance quote unavailable: {normalized}")
        closes = [float(value) for value in frame["Close"].dropna().tolist()]
        if not closes:
            raise ValueError(f"Yahoo Finance quote unavailable: {normalized}")
        price = closes[-1]
        previous = closes[-2] if len(closes) > 1 else None
        change = ((price / previous) - 1.0) * 100.0 if previous else None
        return YahooQuote(normalized, price, change, None)

    @staticmethod
    def _interval(timeframe: str) -> str:
        mapping = {"1m": "1m", "3m": "5m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1h", "1d": "1d"}
        try:
            return mapping[timeframe.lower()]
        except KeyError as exc:
            raise ValueError(f"Yahoo Finance does not support timeframe {timeframe} directly") from exc

    @staticmethod
    def _frame_to_candles(frame: Any) -> list[Candle]:
        if frame is None or frame.empty:
            return []
        result: list[Candle] = []
        for index, row in frame.iterrows():
            try:
                timestamp = index.to_pydatetime() if hasattr(index, "to_pydatetime") else index
                if timestamp.tzinfo is None:
                    timestamp = timestamp.replace(tzinfo=timezone.utc)
                timestamp = timestamp.astimezone(timezone.utc)
                open_price = float(row["Open"])
                high_price = float(row["High"])
                low_price = float(row["Low"])
                close_price = float(row["Close"])
                volume = float(row.get("Volume", 0.0) or 0.0)
                if min(open_price, high_price, low_price, close_price) <= 0 or volume < 0:
                    continue
                if high_price < max(open_price, close_price) or low_price > min(open_price, close_price):
                    continue
                result.append(Candle(timestamp, open_price, high_price, low_price, close_price, volume))
            except (TypeError, ValueError, KeyError):
                continue
        result.sort(key=lambda candle: candle.timestamp)
        deduped: list[Candle] = []
        seen: set[datetime] = set()
        for candle in result:
            if candle.timestamp in seen:
                continue
            seen.add(candle.timestamp)
            deduped.append(candle)
        return deduped


@lru_cache(maxsize=256)
def _cached_search(query: str, limit: int) -> tuple[YahooSearchResult, ...]:
    result = yf.Search(
        query,
        max_results=limit,
        news_count=0,
        lists_count=0,
        include_cb=False,
        include_nav_links=False,
        include_research=False,
        enable_fuzzy_query=True,
        timeout=8,
    )
    quotes = getattr(result, "quotes", None) or []
    normalized_query = query.upper().strip()
    ranked: list[tuple[float, YahooSearchResult]] = []
    for item in quotes:
        symbol = str(item.get("symbol") or "").strip().upper()
        if not symbol:
            continue
        name = str(item.get("shortname") or item.get("longname") or symbol).strip()
        exchange = str(item.get("exchange") or item.get("exchDisp") or "").strip() or None
        quote_type = str(item.get("quoteType") or item.get("typeDisp") or "").strip() or None
        currency = str(item.get("currency") or "").strip() or None
        exact = 100.0 if symbol == normalized_query else 0.0
        prefix = 30.0 if symbol.startswith(normalized_query) else 0.0
        name_match = 10.0 if normalized_query in name.upper() else 0.0
        raw_score = item.get("score")
        try:
            provider_score = float(raw_score)
        except (TypeError, ValueError):
            provider_score = 0.0
        score = exact + prefix + name_match + provider_score
        ranked.append((score, YahooSearchResult(symbol, name, exchange, quote_type, currency, score)))
    ranked.sort(key=lambda item: (-item[0], item[1].symbol))
    return tuple(item[1] for item in ranked[:limit])
