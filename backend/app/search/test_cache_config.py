from backend.app.search import service


def test_search_cache_bounds_are_safe():
    assert service._CACHE_MAX_ENTRIES == 16
    assert service._CACHE_TTL_SECONDS == 60.0
    assert service._RESULT_CACHE_MAX_ENTRIES == 24
    assert service._RESULT_CACHE_TTL_SECONDS == 20.0
