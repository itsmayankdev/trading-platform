from __future__ import annotations

from pattern_engine.algorithms.v1 import SimilarityV1
from pattern_engine.algorithms.v2 import SimilarityV2


_ALGORITHMS = {
    SimilarityV1.version: SimilarityV1,
    SimilarityV2.version: SimilarityV2,
}

PRODUCTION_ALGORITHM_VERSION = SimilarityV1.version


def get_algorithm(version: str | None = None):
    """Return a registered similarity implementation.

    Production callers should omit ``version`` so the centrally controlled
    production version is used. Explicit versions remain available for
    offline evaluation and research.
    """
    selected = version or PRODUCTION_ALGORITHM_VERSION
    algorithm_class = _ALGORITHMS.get(selected)
    if algorithm_class is None:
        raise ValueError(f"Unsupported similarity algorithm: {selected}")
    return algorithm_class()


def list_algorithms() -> tuple[str, ...]:
    return tuple(_ALGORITHMS)
