from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np
from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.db.session import SessionLocal
from backend.app.models.candle import Candle
from backend.app.models.instrument import Instrument
from pattern_engine.retrieval.bruteforce import BruteForceRetriever
from pattern_engine.retrieval.numerical import build_numerical_store
from pattern_engine.window import CandlePoint
from pattern_engine.window_builder import build_windows


def load_candles(symbol: str, timeframe: str) -> list[CandlePoint]:
    with SessionLocal() as db:
        instrument_id = db.execute(
            select(Instrument.id).where(Instrument.symbol == symbol)
        ).scalar_one_or_none()
        if instrument_id is None:
            raise SystemExit(f"Unknown instrument: {symbol}")

        rows = db.execute(
            select(Candle)
            .where(
                Candle.instrument_id == instrument_id,
                Candle.timeframe == timeframe,
            )
            .order_by(Candle.timestamp.asc())
        ).scalars().all()

    return [
        CandlePoint(r.timestamp, r.open, r.high, r.low, r.close, r.volume)
        for r in rows
    ]


def benchmark_bruteforce(current, historical, top_k: int) -> tuple[list, float]:
    retriever = BruteForceRetriever("similarity_v1")
    t0 = time.perf_counter()
    result = retriever.retrieve(current, historical, top_k)
    return result, time.perf_counter() - t0


def benchmark_numerical(
    candles: list[CandlePoint],
    pattern_length: int,
    top_k: int,
    expected: list,
) -> tuple[list, float, float, float]:
    # Build the compact representation once; construction is measured separately.
    t0 = time.perf_counter()
    store = build_numerical_store(candles, pattern_length)
    build_seconds = time.perf_counter() - t0

    # The numerical store exposes one row per sliding window. The last row is
    # the current window; all earlier rows are historical candidates.
    t0 = time.perf_counter()
    matrix = store.normalized_close_matrix()
    current_path = matrix[-1]
    historical_matrix = matrix[:-1]
    start_times = store.window_start_times()[:-1]

    distances = np.sqrt(np.mean((historical_matrix - current_path) ** 2, axis=1))
    scores = np.exp(-distances * 10.0).clip(0.0, 1.0)
    order = np.argsort(scores)[::-1][:top_k]
    scoring_seconds = time.perf_counter() - t0

    actual_times = [str(start_times[int(i)]) for i in order]
    expected_times = [str(m.window.start_time) for m in expected]
    same_order = actual_times == expected_times

    max_score_error = 0.0
    if expected:
        expected_scores = np.array([m.score for m in expected], dtype=np.float64)
        actual_scores = scores[order]
        max_score_error = float(np.max(np.abs(expected_scores - actual_scores)))

    if not same_order or max_score_error > 1e-12:
        raise SystemExit(
            "FAIL: numerical retrieval does not match brute-force V1 "
            f"(same_order={same_order}, max_error={max_score_error:.3e})"
        )

    return expected, build_seconds, scoring_seconds, max_score_error


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark exact V1 retrieval implementations")
    parser.add_argument("--symbol", default="BTCUSDT")
    parser.add_argument("--timeframe", default="15m")
    parser.add_argument("--pattern-length", type=int, default=45)
    parser.add_argument("--top-k", type=int, default=5)
    args = parser.parse_args()

    candles = load_candles(args.symbol, args.timeframe)
    if len(candles) < args.pattern_length + 1:
        raise SystemExit("Not enough candles")

    windows = build_windows(args.symbol, args.timeframe, candles, args.pattern_length)
    current = windows[-1]
    historical = [w for w in windows if w.end_time < current.start_time]

    brute, brute_seconds = benchmark_bruteforce(current, historical, args.top_k)
    numerical, build_seconds, numerical_seconds, max_score_error = benchmark_numerical(
        candles,
        args.pattern_length,
        args.top_k,
        brute,
    )

    same_order = [m.window.start_time for m in brute] == [m.window.start_time for m in numerical]
    total_numerical = build_seconds + numerical_seconds

    print(f"Dataset: {args.symbol} {args.timeframe}")
    print(f"Candles: {len(candles):,}")
    print(f"Historical windows: {len(historical):,}")
    print(f"Pattern length: {args.pattern_length}")
    print(f"Top-K: {args.top_k}")
    print()
    print(f"Brute-force scoring: {brute_seconds:.6f}s")
    print(f"Numerical build:     {build_seconds:.6f}s")
    print(f"Numerical scoring:   {numerical_seconds:.6f}s")
    print(f"Numerical total:     {total_numerical:.6f}s")
    print()
    if numerical_seconds > 0:
        print(f"Scoring speedup:     {brute_seconds / numerical_seconds:.2f}x")
    if total_numerical > 0:
        print(f"End-to-end speedup:  {brute_seconds / total_numerical:.2f}x")
    print(f"Same order:          {same_order}")
    print(f"Max error:           {max_score_error:.3e}")


if __name__ == "__main__":
    main()
