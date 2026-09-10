from __future__ import annotations

from pattern_engine.algorithms.v1 import SimilarityV1
from pattern_engine.algorithms.v2 import SimilarityV2
from pattern_engine.algorithms.v3 import SimilarityV3
from pattern_engine.algorithms.v4 import SimilarityV4
from pattern_engine.algorithms.v5 import SimilarityV5


_ALGORITHMS = {
    SimilarityV1.version: SimilarityV1,
    SimilarityV2.version: SimilarityV2,
    SimilarityV3.version: SimilarityV3,
    SimilarityV4.version: SimilarityV4,
    SimilarityV5.version: SimilarityV5,
}

# 2nd-update-HFDS: production matcher is the supplied fast 100k reference
# engine port. V1 remains frozen and directly available for rollback/comparison.
PRODUCTION_ALGORITHM_VERSION = SimilarityV5.version


def get_algorithm(version: str | None = None):
    """Return the centrally selected matcher or an explicit algorithm version."""
    selected = version or PRODUCTION_ALGORITHM_VERSION
    algorithm_class = _ALGORITHMS.get(selected)
    if algorithm_class is None:
        raise ValueError(f"Unsupported similarity algorithm: {selected}")
    return algorithm_class()


def list_algorithms() -> tuple[str, ...]:
    return tuple(_ALGORITHMS)
