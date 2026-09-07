from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime

import numpy as np
from sqlalchemy import select

from backend.app.db.session import SessionLocal
from backend.app.models.candle import Candle
from backend.app.models.instrument import Instrument
from pattern_engine.algorithms.v1 import SimilarityV1
from pattern_engine.algorithms.v2 import SimilarityV2
from pattern_engine.window import CandlePoint, PatternWindow


@dataclass(frozen=True)
class MatchOutcome:
    similarity: float
    returns: dict[int, float]
    mfe: dict[int, float]
    mae: dict[int, float]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Walk-forward V1 vs V2 benchmark")
    parser.add_argument("--symbol", default="BTCUSDT")
    parser.add_argument("--timeframe", default="15m")
    parser.add_argument("--pattern-length", type=int, default=45)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--anchors", type=int, default=10)
    parser.add_argument("--anchor-step", type=int, default=500)
    parser.add_argument("--min-history", type=int, default=1000)
    parser.add_argument("--horizons", default="5,15,30,60")
    return parser.parse_args()


def load_candles(symbol: str, timeframe: str) -> list[Candle]:
    with SessionLocal() as db:
        instrument = db.execute(
            select(Instrument).where(Instrument.symbol == symbol.upper())
        ).scalar_one_or_none()
        if instrument is None:
            raise SystemExit(f"Instrument not found: {symbol.upper()}")

        rows = db.execute(
            select(Candle)
            .where(
                Candle.instrument_id == instrument.id,
                Candle.timeframe == timeframe,
            )
            .order_by(Candle.timestamp.asc())
        ).scalars().all()
        return list(rows)


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


def outcome(
    candles: list[Candle],
    entry_index: int,
    similarity: float,
    horizons: tuple[int, ...],
) -> MatchOutcome | None:
    entry = float(candles[entry_index].close)
    if entry <= 0:
        return None

    returns: dict[int, float] = {}
    mfe: dict[int, float] = {}
    mae: dict[int, float] = {}

    for horizon in horizons:
        end = entry_index + horizon
        if end >= len(candles):
            return None
        future = candles[entry_index + 1 : end + 1]
        if not future:
            return None
        returns[horizon] = float(candles[end].close) / entry - 1.0
        mfe[horizon] = max(float(c.high) for c in future) / entry - 1.0
        mae[horizon] = min(float(c.low) for c in future) / entry - 1.0

    return MatchOutcome(similarity, returns, mfe, mae)


def rank_matches(
    algorithm,
    current: PatternWindow,
    historical_windows: list[PatternWindow],
    top_k: int,
    min_separation: int,
) -> list[tuple[PatternWindow, float]]:
    candidates = [w for w in historical_windows if w.start_time != current.start_time]
    scores = algorithm.score_many(current, candidates)
    indices = np.argsort(scores)[::-1]

    selected: list[tuple[PatternWindow, float]] = []
    for index in indices:
        candidate = candidates[int(index)]
        if any(
            abs(candidate.start_time - selected_window.start_time)
            < (candidate.start_time - candidate.start_time) + (current.end_time - current.start_time + (current.end_time - current.start_time) / max(current.length - 1, 1)) * min_separation
            for selected_window, _ in selected
        ):
            continue
        selected.append((candidate, float(scores[int(index)])))
        if len(selected) >= top_k:
            break
    return selected


def summarize(results: list[MatchOutcome], horizons: tuple[int, ...]) -> dict:
    summary: dict = {"sample_size": len(results)}
    if not results:
        return summary
    for horizon in horizons:
        values = np.array([r.returns[horizon] for r in results], dtype=np.float64)
        summary[str(horizon)] = {
            "mean_return": float(values.mean()),
            "median_return": float(np.median(values)),
            "win_rate": float((values > 0).mean()),
            "mean_mfe": float(np.mean([r.mfe[horizon] for r in results])),
            "mean_mae": float(np.mean([r.mae[horizon] for r in results])),
        }
    summary["mean_similarity"] = float(np.mean([r.similarity for r in results]))
    return summary


def main() -> None:
    args = parse_args()
    if args.pattern_length < 2 or args.top_k < 1 or args.anchors < 1:
        raise SystemExit("pattern-length >= 2, top-k >= 1 and anchors >= 1 are required")

    horizons = tuple(int(x) for x in args.horizons.split(",") if x.strip())
    candles = load_candles(args.symbol, args.timeframe)
    required = args.pattern_length + max(horizons) + args.min_history
    if len(candles) < required:
        raise SystemExit(
            f"Not enough candles: have {len(candles)}, need at least {required}"
        )

    windows = [
        to_window(candles[i : i + args.pattern_length], args.symbol.upper(), args.timeframe)
        for i in range(len(candles) - args.pattern_length + 1)
    ]

    start_anchor = args.min_history + args.pattern_length - 1
    anchor_indices = list(range(start_anchor, len(candles) - max(horizons), args.anchor_step))[-args.anchors :]
    if not anchor_indices:
        raise SystemExit("No valid walk-forward anchors")

    algorithms = {"similarity_v1": SimilarityV1(), "similarity_v2": SimilarityV2()}
    all_results: dict[str, list[MatchOutcome]] = {name: [] for name in algorithms}

    for anchor in anchor_indices:
        current_start = anchor - args.pattern_length + 1
        current = windows[current_start]
        historical = windows[:current_start]

        for name, algorithm in algorithms.items():
            matches = rank_matches(
                algorithm,
                current,
                historical,
                args.top_k,
                args.pattern_length,
            )
            for match, score in matches:
                match_start = next(i for i, c in enumerate(candles) if c.timestamp == match.start_time)
                result = outcome(candles, match_start + args.pattern_length - 1, score, horizons)
                if result is not None:
                    all_results[name].append(result)

    output = {
        "symbol": args.symbol.upper(),
        "timeframe": args.timeframe,
        "pattern_length": args.pattern_length,
        "top_k": args.top_k,
        "anchors_requested": args.anchors,
        "anchors_used": len(anchor_indices),
        "horizons": list(horizons),
        "algorithms": {name: summarize(results, horizons) for name, results in all_results.items()},
    }
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
