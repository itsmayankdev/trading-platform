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
from pattern_engine.retrieval.bruteforce import BruteForceRetriever
from pattern_engine.retrieval.numerical_v1 import NumericalV1Retriever
from pattern_engine.retrieval.numerical import build_numerical_store
from pattern_engine.window import CandlePoint
from pattern_engine.window_builder import build_windows


def load_candles(symbol: str, timeframe: str) -> list[CandlePoint]:
    with SessionLocal() as db:
        rows = db.execute(
            select(Candle)
            .where(
                Candle.instrument_id.in_(
                    select(Instrument.id).where(Instrument.symbol == symbol)
                ),
                Candle.timeframe == timeframe,
            )
            .order_by(Candle.timestamp.asc())
        ).scalars().all()
    return [CandlePoint(r.timestamp, r.open, r.high, r.low, r.close, r.volume) for r in rows]


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

    store = build_numerical_store(candles, args.pattern_length)
    _ = store

    t0 = time.perf_counter()
    brute = BruteForceRetriever("similarity_v1").retrieve(current, historical, args.top_k)
    brute_seconds = time.perf_counter() - t0

    t0 = time.perf_counter()
    numerical = NumericalV1Retriever().retrieve(current, historical, args.top_k)
    numerical_seconds = time.perf_counter() - t0

    expected = np.array([m.window.start_time for m in brute], dtype=object)
    actual = np.array([m.window.start_time for m in numerical], dtype=object)
    same_order = np.array_equal(expected, actual)
    max_score_error = max(
        (abs(a.score - b.score) for a, b in zip(brute, numerical)),
        default=0.0,
    )

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

    if not same_order or max_score_error > 1e-12:
        raise SystemExit("FAIL: numerical retrieval does not match brute-force V1")


if __name__ == "__main__":
    main()
