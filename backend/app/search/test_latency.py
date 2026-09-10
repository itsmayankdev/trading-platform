from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from time import sleep

from backend.app.search.latency import run_pattern_search


def test_single_flight_runs_duplicate_search_once():
    calls = 0
    lock = Lock()

    def search():
        nonlocal calls
        with lock:
            calls += 1
        sleep(0.05)
        return {"ok": True}

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: run_pattern_search((1, "ETHUSDT", "5m", 45, 10), search), range(8)))

    assert calls == 1
    assert all(result == {"ok": True} for result in results)


def test_failed_search_is_shared_with_waiters():
    calls = 0
    lock = Lock()

    def search():
        nonlocal calls
        with lock:
            calls += 1
        sleep(0.05)
        raise ValueError("boom")

    def invoke():
        try:
            run_pattern_search((2, "BTCUSDT", "5m", 45, 10), search)
        except ValueError as exc:
            return str(exc)
        return "unexpected success"

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda _: invoke(), range(6)))

    assert calls == 1
    assert results == ["boom"] * 6
