from __future__ import annotations

import os
from dataclasses import dataclass, field
from threading import BoundedSemaphore, Event, Lock
from typing import Callable, TypeVar

T = TypeVar("T")

_MAX_CONCURRENCY = max(1, int(os.getenv("PATTERN_SEARCH_MAX_CONCURRENCY", "2")))
_SEARCH_SEMAPHORE = BoundedSemaphore(_MAX_CONCURRENCY)


@dataclass
class _Flight:
    event: Event = field(default_factory=Event)
    succeeded: bool = False
    value: object = None


_INFLIGHT: dict[tuple, _Flight] = {}
_INFLIGHT_LOCK = Lock()


def run_pattern_search(key: tuple, search: Callable[[], T]) -> T:
    """Run one expensive search at a time per key and bound total concurrency.

    This is deliberately outside the pattern engine: it changes request scheduling,
    never the V1 ranking algorithm or its numerical inputs.
    """
    with _INFLIGHT_LOCK:
        flight = _INFLIGHT.get(key)
        if flight is None:
            flight = _Flight()
            _INFLIGHT[key] = flight
            owner = True
        else:
            owner = False

    if not owner:
        flight.event.wait()
        if flight.succeeded:
            return flight.value  # type: ignore[return-value]
        raise flight.value  # type: ignore[misc]

    try:
        with _SEARCH_SEMAPHORE:
            result = search()
        flight.succeeded = True
        flight.value = result
        return result
    except BaseException as exc:
        flight.value = exc
        raise
    finally:
        flight.event.set()
        with _INFLIGHT_LOCK:
            if _INFLIGHT.get(key) is flight:
                _INFLIGHT.pop(key, None)
