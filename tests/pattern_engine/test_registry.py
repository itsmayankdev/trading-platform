import pytest

from pattern_engine.algorithms.v1 import SimilarityV1
from pattern_engine.algorithms.v2 import SimilarityV2
from pattern_engine.registry import PRODUCTION_ALGORITHM_VERSION, get_algorithm, list_algorithms


def test_production_algorithm_is_v1():
    algorithm = get_algorithm()
    assert PRODUCTION_ALGORITHM_VERSION == "similarity_v1"
    assert isinstance(algorithm, SimilarityV1)


def test_research_versions_are_explicitly_selectable():
    assert isinstance(get_algorithm("similarity_v1"), SimilarityV1)
    assert isinstance(get_algorithm("similarity_v2"), SimilarityV2)
    assert set(list_algorithms()) == {"similarity_v1", "similarity_v2"}


def test_unknown_algorithm_is_rejected():
    with pytest.raises(ValueError, match="Unsupported similarity algorithm"):
        get_algorithm("does_not_exist")
