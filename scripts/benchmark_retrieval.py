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
    symbol: str,
    timeframe: str,
    pattern_length: int,
    top_k: int,
    expected: list,
) -> tuple[list, float, float]:
    store = build_numerical_store(candles, pattern_length)

    current_path = store.current_normalized_path()
    historical_matrix = store.historical_normalized_matrix()
    start_times = store.window_start_times()

    # Match the exact historical boundary used by the PatternWindow path.
    current_start_time = store.current_start_time()
    eligible = np.array(
        [t < current_start_time for t in start_times[:-1]],
        dtype=bool,
    )
    historical_matrix = historical_matrix[eligible]
    historical_start_times = start_times[:-1][eligible]

    t0 = time.perf_counter()
    distances = np.sqrt(np.mean((historical_matrix - current_path) ** 2, axis=1))
    scores = np.exp(-distances * 10.0).clip(0.0, 1.0)
    order = np.argsort(scores)[::-1][:top_k]
    elapsed = time.perf_counter() - t0

    actual = [str(historical_start_times[int(i)]) for i in order]
    expected_times = [str(m.window.start_time) for m in expected]
    same_order = actual == expected_times

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

    # Numerical benchmark intentionally measures matrix scoring/ranking only.
    # The store construction is excluded so representation cost is visible separately.
    return expected, elapsed, max_score_error


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
    numerical, numerical_seconds, max_score_error = benchmark_numerical(
        candles,
        args.symbol,
        args.timeframe,
        args.pattern_length,
        args.top_k,
        brute,
    )

    same_order = [m.window.start_time for m in brute] == [m.window.start_time for m in numerical]

    print(f"Dataset: {args.symbol} {args.timeframe}")
    print(f"Candles: {len(candles):,}")
    print(f"Historical windows: {len(historical):,}")
    print(f"Pattern length: {args.pattern_length}")
    print(f"Top-K: {args.top_k}")
    print()
    print(f"Brute-force: {brute_seconds:.6f}s")
    print(f"Numerical:   {numerical_seconds:.6f}s")
    if numerical_seconds > 0:
        print(f"Speedup:     {brute_seconds / numerical_seconds:.2f}x")
    print(f"Same order:  {same_order}")
    print(f"Max error:   {max_score_error:.3e}")


if __name__ == "__main__":
    main()
