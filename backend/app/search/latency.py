from __future__ import annotations

import os
from threading import BoundedSemaphore, Event, Lock
from typing import Callable, TypeVar

T = TypeVar("T")

_MAX_CONCURRENCY = max(1, int(os.getenv("PATTERN_SEARCH_MAX_CONCURRENCY", "2")))
_SEARCH_SEMAPHORE = BoundedSemaphore(_MAX_CONCURRENCY)
_INFLIGHT: dict[tuple, Event] = {}
_INFLIGHT_RESULTS: dict[tuple, tuple[bool, object]] = {}
_INFLIGHT_LOCK = Lock()


def run_pattern_search(key: tuple, search: Callable[[], T]) -> T:
    """Run one expensive search at a time per key and bound total concurrency.

    This is deliberately outside the pattern engine: it changes request scheduling,
    never the V1 ranking algorithm or its numerical inputs.
    """
    with _INFLIGHT_LOCK:
        event = _INFLIGHT.get(key)
        if event is None:
            event = Event()
            _INFLIGHT[key] = event
            owner = True
        else:
            owner = False

    if not owner:
        event.wait()
        with _INFLIGHT_LOCK:
            succeeded, value = _INFLIGHT_RESULTS.pop(key, (False, RuntimeError("Pattern search did not complete")))
        if succeeded:
            return value  # type: ignore[return-value]
        raise value  # type: ignore[misc]

    try:
        with _SEARCH_SEMAPHORE:
            result = search()
        with _INFLIGHT_LOCK:
            _INFLIGHT_RESULTS[key] = (True, result)
        return result
    except BaseException as exc:
        with _INFLIGHT_LOCK:
            _INFLIGHT_RESULTS[key] = (False, exc)
        raise
    finally:
        with _INFLIGHT_LOCK:
            _INFLIGHT.pop(key, None)
        event.set()
