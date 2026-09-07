from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

# Make the repository root importable when this file is executed directly.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np
from sqlalchemy import select

from backend.app.db.session import SessionLocal
from backend.app.models.candle import Candle
from backend.app.models.instrument import Instrument
from pattern_engine.algorithms.v1 import SimilarityV1
from pattern_engine.algorithms.v2 import SimilarityV2
from pattern_engine.window import CandlePoint, PatternWindow


@dataclass(frozen=True)
class MatchResult:
    similarity: float
    returns: dict[int, float]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Cross-market walk-forward V1 vs V2 benchmark")
    parser.add_argument("--symbols", default="BTCUSDT,ETHUSDT,SOLUSDT")
    parser.add_argument("--timeframes", default="5m,15m,1h")
    parser.add_argument("--pattern-length", type=int, default=45)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--anchors", type=int, default=20)
    parser.add_argument("--anchor-step", type=int, default=250)
    parser.add_argument("--min-history", type=int, default=1000)
    parser.add_argument("--horizons", default="5,15,30,60")
    return parser.parse_args()


def load_candles(symbol: str, timeframe: str) -> list[Candle]:
    with SessionLocal() as db:
        instrument = db.execute(
            select(Instrument).where(Instrument.symbol == symbol.upper())
        ).scalar_one_or_none()
        if instrument is None:
            return []
        return list(
            db.execute(
                select(Candle)
                .where(Candle.instrument_id == instrument.id, Candle.timeframe == timeframe)
                .order_by(Candle.timestamp.asc())
            ).scalars().all()
        )


def to_window(candles: list[Candle], symbol: str, timeframe: str) -> PatternWindow:
    points = tuple(
        CandlePoint(
            timestamp=c.timestamp,
            open=float(c.open),
            high=float(c.high),
            low=float(c.low),
            close=float(c.close),
            volume=float(c.volume),
        )
        for c in candles
    )
    return PatternWindow(
        symbol=symbol,
        timeframe=timeframe,
        start_time=points[0].timestamp,
        end_time=points[-1].timestamp,
        candles=points,
    )


def candle_spacing(candles: list[Candle]):
    if len(candles) < 2:
        return None
    return candles[1].timestamp - candles[0].timestamp


def rank_matches(algorithm, current, historical, top_k, min_separation_candles, spacing):
    if not historical:
        return []
    scores = algorithm.score_many(current, historical)
    order = np.argsort(scores)[::-1]
    minimum_separation = spacing * min_separation_candles if spacing else None
    selected = []
    for raw_index in order:
        index = int(raw_index)
        candidate = historical[index]
        if minimum_separation is not None and any(
            abs(candidate.start_time - selected_candidate.start_time) < minimum_separation
            for selected_candidate, _ in selected
        ):
            continue
        selected.append((candidate, float(scores[index])))
        if len(selected) >= top_k:
            break
    return selected


def outcome(candles, entry_index, similarity, horizons):
    entry = float(candles[entry_index].close)
    if entry <= 0 or entry_index + max(horizons) >= len(candles):
        return None
    returns = {
        horizon: float(candles[entry_index + horizon].close) / entry - 1.0
        for horizon in horizons
    }
    return MatchResult(similarity, returns)


def summarize(results, horizons):
    if not results:
        return {"sample_size": 0}
    output = {
        "sample_size": len(results),
        "mean_similarity": float(np.mean([r.similarity for r in results])),
    }
    for horizon in horizons:
        values = np.array([r.returns[horizon] for r in results], dtype=np.float64)
        output[str(horizon)] = {
            "mean_return": float(values.mean()),
            "median_return": float(np.median(values)),
            "win_rate": float((values > 0).mean()),
        }
    return output


def benchmark(symbol, timeframe, args, horizons):
    candles = load_candles(symbol, timeframe)
    required = args.min_history + args.pattern_length + max(horizons)
    if len(candles) < required:
        return {"status": "insufficient_data", "candles": len(candles), "required": required}

    spacing = candle_spacing(candles)
    windows = [
        to_window(candles[i : i + args.pattern_length], symbol, timeframe)
        for i in range(len(candles) - args.pattern_length + 1)
    ]
    start_anchor = args.min_history + args.pattern_length - 1
    anchors = list(range(start_anchor, len(candles) - max(horizons), args.anchor_step))[-args.anchors :]
    algorithms = {"similarity_v1": SimilarityV1(), "similarity_v2": SimilarityV2()}
    results = {name: [] for name in algorithms}

    timestamp_to_index = {c.timestamp: i for i, c in enumerate(candles)}
    for anchor in anchors:
        current_index = anchor - args.pattern_length + 1
        current = windows[current_index]
        historical = windows[:current_index]
        for name, algorithm in algorithms.items():
            matches = rank_matches(algorithm, current, historical, args.top_k, args.pattern_length, spacing)
            for match, score in matches:
                match_index = timestamp_to_index[match.start_time]
                result = outcome(candles, match_index + args.pattern_length - 1, score, horizons)
                if result is not None:
                    results[name].append(result)

    return {
        "status": "ok",
        "candles": len(candles),
        "anchors_used": len(anchors),
        "algorithms": {name: summarize(values, horizons) for name, values in results.items()},
    }


def main():
    args = parse_args()
    horizons = tuple(int(x.strip()) for x in args.horizons.split(",") if x.strip())
    if args.pattern_length < 2 or args.top_k < 1 or args.anchors < 1:
        raise SystemExit("pattern-length >= 2, top-k >= 1 and anchors >= 1 are required")

    symbols = [x.strip().upper() for x in args.symbols.split(",") if x.strip()]
    timeframes = [x.strip() for x in args.timeframes.split(",") if x.strip()]
    matrix = {}
    for symbol in symbols:
        matrix[symbol] = {}
        for timeframe in timeframes:
            matrix[symbol][timeframe] = benchmark(symbol, timeframe, args, horizons)

    print(json.dumps({
        "pattern_length": args.pattern_length,
        "top_k": args.top_k,
        "anchors_requested": args.anchors,
        "anchor_step": args.anchor_step,
        "min_history": args.min_history,
        "horizons": list(horizons),
        "matrix": matrix,
    }, indent=2))


if __name__ == "__main__":
    main()
