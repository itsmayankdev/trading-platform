from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from pattern_engine.window import PatternWindow


@dataclass(frozen=True)
class CandidateWindow:
    window: PatternWindow
    score: float


class PatternRetriever(ABC):
    """Interface between candidate retrieval and precise similarity scoring."""

    @abstractmethod
    def retrieve(
        self,
        current: PatternWindow,
        historical_windows: list[PatternWindow],
        top_k: int,
    ) -> list[CandidateWindow]:
        raise NotImplementedError
