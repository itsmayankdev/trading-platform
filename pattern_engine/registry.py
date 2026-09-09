from __future__ import annotations

from pattern_engine.algorithms.v1 import SimilarityV1
from pattern_engine.algorithms.v2 import SimilarityV2
from pattern_engine.algorithms.v3 import SimilarityV3


_ALGORITHMS = {
    SimilarityV1.version: SimilarityV1,
    SimilarityV2.version: SimilarityV2,
    SimilarityV3.version: SimilarityV3,
}

# Restore the proven pre-V3 production matcher. V2/V3 remain available for
# offline evaluation until their ranking quality and score calibration beat the
# established production baseline on a representative benchmark corpus.
PRODUCTION_ALGORITHM_VERSION = SimilarityV1.version


def get_algorithm(version: str | None = None):
    """Return the centrally selected production matcher or an explicit research version."""
    selected = version or PRODUCTION_ALGORITHM_VERSION
    algorithm_class = _ALGORITHMS.get(selected)
    if algorithm_class is None:
        raise ValueError(f"Unsupported similarity algorithm: {selected}")
    return algorithm_class()


def list_algorithms() -> tuple[str, ...]:
    return tuple(_ALGORITHMS)
