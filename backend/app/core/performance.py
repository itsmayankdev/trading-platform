from __future__ import annotations

import os
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Iterator


@dataclass
class PerformanceTimer:
    """Small server-side timer for measuring hot-path stages without exposing internals."""

    enabled: bool = False
    stages: dict[str, float] = field(default_factory=dict)
    _started: float = field(default_factory=time.perf_counter, init=False, repr=False)

    @classmethod
    def from_env(cls) -> "PerformanceTimer":
        return cls(enabled=os.getenv("PERFORMANCE_DEBUG", "false").lower() == "true")

    @contextmanager
    def stage(self, name: str) -> Iterator[None]:
        if not self.enabled:
            yield
            return
        started = time.perf_counter()
        try:
            yield
        finally:
            self.stages[name] = time.perf_counter() - started

    @property
    def elapsed(self) -> float:
        return time.perf_counter() - self._started

    def emit(self, prefix: str = "PERF") -> None:
        if not self.enabled:
            return
        parts = [f"{name}={duration * 1000:.1f}ms" for name, duration in self.stages.items()]
        print(f"{prefix} total={self.elapsed * 1000:.1f}ms " + " ".join(parts), flush=True)


def performance_debug_enabled() -> bool:
    return os.getenv("PERFORMANCE_DEBUG", "false").lower() == "true"
