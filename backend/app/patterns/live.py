from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from statistics import median


READY_LIVE_PATTERNS = {
    "Head & Shoulders", "Inverse Head & Shoulders", "Double Top", "Double Bottom",
    "Triple Top", "Triple Bottom", "Ascending Triangle", "Descending Triangle",
    "Symmetrical Triangle", "Rising Wedge", "Falling Wedge", "Bull Flag", "Bear Flag",
    "Pennant", "Rectangle", "Cup & Handle", "Doji", "Hammer", "Shooting Star",
    "Bullish Engulfing", "Bearish Engulfing", "Morning Star", "Evening Star",
    "Three White Soldiers", "Three Black Crows",
}


@dataclass(frozen=True)
class LiveMatch:
    name: str
    start_time: datetime
    end_time: datetime
    detected_at: datetime
    candle_count: int
    reason: str

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "matched": True,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "detected_at": self.detected_at,
            "candle_count": self.candle_count,
            "reason": self.reason,
        }


def _body(row):
    return abs(row.close - row.open)


def _range(row):
    return max(row.high - row.low, 0.0)


def _bull(row):
    return row.close > row.open


def _bear(row):
    return row.close < row.open


def _swing_points(rows: list, span: int = 2):
    highs, lows = [], []
    for i in range(span, len(rows) - span):
        high = rows[i].high
        low = rows[i].low
        if all(high >= rows[j].high for j in range(i - span, i + span + 1)):
            highs.append(i)
        if all(low <= rows[j].low for j in range(i - span, i + span + 1)):
            lows.append(i)
    return highs, lows


def _similar(a: float, b: float, tolerance: float) -> bool:
    scale = max(abs(a), abs(b), 1e-12)
    return abs(a - b) / scale <= tolerance


def _trend_slope(values: list[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    x_mean = (n - 1) / 2
    y_mean = sum(values) / n
    denom = sum((i - x_mean) ** 2 for i in range(n))
    return sum((i - x_mean) * (v - y_mean) for i, v in enumerate(values)) / denom if denom else 0.0


def _chart_match(rows: list, name: str):
    if len(rows) < 12:
        return None
    highs, lows = _swing_points(rows)
    if name in {"Head & Shoulders", "Inverse Head & Shoulders"} and len(highs if name == "Head & Shoulders" else lows) >= 3:
        points = (highs if name == "Head & Shoulders" else lows)[-3:]
        vals = [rows[i].high if name == "Head & Shoulders" else rows[i].low for i in points]
        if ((vals[1] > vals[0] * 1.005 and vals[1] > vals[2] * 1.005 and _similar(vals[0], vals[2], .04)) if name == "Head & Shoulders" else (vals[1] < vals[0] * .995 and vals[1] < vals[2] * .995 and _similar(vals[0], vals[2], .04))):
            return points[0], points[-1], "three-swing reversal structure confirmed on the live chart"
    if name in {"Double Top", "Double Bottom", "Triple Top", "Triple Bottom"}:
        is_top = "Top" in name
        points = (highs if is_top else lows)[-(3 if name.startswith("Triple") else 2):]
        if len(points) == (3 if name.startswith("Triple") else 2):
            vals = [rows[i].high if is_top else rows[i].low for i in points]
            if max(vals) > 0 and max(vals) - min(vals) <= median(vals) * .035:
                return points[0], points[-1], "repeated swing level detected on the live chart"
    if name in {"Ascending Triangle", "Descending Triangle", "Symmetrical Triangle", "Rising Wedge", "Falling Wedge"}:
        hp = highs[-4:]
        lp = lows[-4:]
        if len(hp) >= 2 and len(lp) >= 2:
            hv = [rows[i].high for i in hp]
            lv = [rows[i].low for i in lp]
            hs, ls = _trend_slope(hv), _trend_slope(lv)
            if name == "Ascending Triangle" and abs(hs) <= median(hv) * .001 and ls > 0:
                return min(hp[0], lp[0]), max(hp[-1], lp[-1]), "flat resistance with rising swing lows"
            if name == "Descending Triangle" and abs(ls) <= median(lv) * .001 and hs < 0:
                return min(hp[0], lp[0]), max(hp[-1], lp[-1]), "flat support with falling swing highs"
            if name == "Symmetrical Triangle" and hs < 0 and ls > 0:
                return min(hp[0], lp[0]), max(hp[-1], lp[-1]), "converging lower highs and higher lows"
            if name == "Rising Wedge" and hs > 0 and ls > 0 and hs < ls:
                return min(hp[0], lp[0]), max(hp[-1], lp[-1]), "rising boundaries converging on the live chart"
            if name == "Falling Wedge" and hs < 0 and ls < 0 and hs > ls:
                return min(hp[0], lp[0]), max(hp[-1], lp[-1]), "falling boundaries converging on the live chart"
    if name in {"Bull Flag", "Bear Flag", "Pennant"} and len(rows) >= 20:
        impulse = rows[-20:-8]
        consolidation = rows[-8:]
        impulse_change = impulse[-1].close / impulse[0].close - 1
        cons_change = consolidation[-1].close / consolidation[0].close - 1
        cons_range = max(r.high for r in consolidation) / min(r.low for r in consolidation) - 1
        if name == "Bull Flag" and impulse_change > .035 and cons_change <= .01 and cons_range < abs(impulse_change) * .8:
            return len(rows) - 20, len(rows) - 1, "strong upward impulse followed by compact consolidation"
        if name == "Bear Flag" and impulse_change < -.035 and cons_change >= -.01 and cons_range < abs(impulse_change) * .8:
            return len(rows) - 20, len(rows) - 1, "strong downward impulse followed by compact consolidation"
        if name == "Pennant" and abs(impulse_change) > .035 and cons_range < abs(impulse_change) * .55:
            return len(rows) - 20, len(rows) - 1, "impulse followed by contracting consolidation"
    if name == "Rectangle" and len(rows) >= 20:
        window = rows[-20:]
        hi, lo = max(r.high for r in window), min(r.low for r in window)
        touches_hi = sum(abs(r.high - hi) / hi < .01 for r in window)
        touches_lo = sum(abs(r.low - lo) / lo < .01 for r in window)
        if touches_hi >= 2 and touches_lo >= 2:
            return len(rows) - 20, len(rows) - 1, "repeated reactions at live support and resistance"
    if name == "Cup & Handle" and len(rows) >= 30:
        left = rows[-30:-12]
        handle = rows[-12:]
        low_i = min(range(len(left)), key=lambda i: left[i].low)
        if 4 <= low_i <= len(left) - 5:
            left_high, right_high = left[0].high, left[-1].high
            if _similar(left_high, right_high, .08) and max(r.high for r in handle) <= right_high * 1.02 and handle[-1].close >= handle[0].close * .98:
                return len(rows) - 30, len(rows) - 1, "rounded recovery followed by a shallow live handle"
    return None


def _candle_match(rows: list, name: str):
    if not rows:
        return None
    row = rows[-1]
    body, candle_range = _body(row), _range(row)
    upper = row.high - max(row.open, row.close)
    lower = min(row.open, row.close) - row.low
    if name == "Doji" and candle_range > 0 and body / candle_range <= .10:
        return len(rows) - 1, len(rows) - 1, "real body is 10% or less of the candle range"
    if name == "Hammer" and body > 0 and candle_range > 0 and lower >= body * 2 and upper <= body and max(row.open, row.close) >= row.low + candle_range * .60:
        return len(rows) - 1, len(rows) - 1, "small upper-positioned body with a long lower wick"
    if name == "Shooting Star" and body > 0 and candle_range > 0 and upper >= body * 2 and lower <= body and min(row.open, row.close) <= row.low + candle_range * .40:
        return len(rows) - 1, len(rows) - 1, "small lower-positioned body with a long upper wick"
    if len(rows) >= 2:
        previous = rows[-2]
        pb, cb = _body(previous), body
        if name == "Bullish Engulfing" and pb > 0 and cb > pb and _bear(previous) and _bull(row) and row.open <= previous.close and row.close >= previous.open:
            return len(rows) - 2, len(rows) - 1, "bullish real body fully engulfs the prior bearish body"
        if name == "Bearish Engulfing" and pb > 0 and cb > pb and _bull(previous) and _bear(row) and row.open >= previous.close and row.close <= previous.open:
            return len(rows) - 2, len(rows) - 1, "bearish real body fully engulfs the prior bullish body"
        if len(rows) >= 3:
            a, b, c = rows[-3:]
            if name == "Morning Star" and _bear(a) and _body(a) > _range(a) * .5 and _body(b) <= _range(b) * .35 and _bull(c) and c.close >= (a.open + a.close) / 2:
                return len(rows) - 3, len(rows) - 1, "three-candle bullish reversal structure"
            if name == "Evening Star" and _bull(a) and _body(a) > _range(a) * .5 and _body(b) <= _range(b) * .35 and _bear(c) and c.close <= (a.open + a.close) / 2:
                return len(rows) - 3, len(rows) - 1, "three-candle bearish reversal structure"
            if name == "Three White Soldiers" and all(_bull(x) and _body(x) >= _range(x) * .5 for x in (a, b, c)) and a.close < b.close < c.close:
                return len(rows) - 3, len(rows) - 1, "three consecutive strong bullish candles with higher closes"
            if name == "Three Black Crows" and all(_bear(x) and _body(x) >= _range(x) * .5 for x in (a, b, c)) and a.close > b.close > c.close:
                return len(rows) - 3, len(rows) - 1, "three consecutive strong bearish candles with lower closes"
    return None


def detect_live_patterns(rows: list, requested: list[str], max_candles: int) -> list[dict]:
    """Scan only the candles displayed by the live chart; never consult historical analogs."""
    if not rows:
        return []
    chart_rows = rows[-max_candles:]
    results = []
    for name in dict.fromkeys(requested):
        if name not in READY_LIVE_PATTERNS:
            continue
        found = _candle_match(chart_rows, name) if name in {
            "Doji", "Hammer", "Shooting Star", "Bullish Engulfing", "Bearish Engulfing",
            "Morning Star", "Evening Star", "Three White Soldiers", "Three Black Crows",
        } else _chart_match(chart_rows, name)
        if found is None:
            continue
        start_i, end_i, reason = found
        start_i = max(0, min(start_i, len(chart_rows) - 1))
        end_i = max(start_i, min(end_i, len(chart_rows) - 1))
        results.append(LiveMatch(name=name, start_time=chart_rows[start_i].timestamp, end_time=chart_rows[end_i].timestamp, detected_at=chart_rows[end_i].timestamp, candle_count=end_i - start_i + 1, reason=reason).as_dict())
    return results
