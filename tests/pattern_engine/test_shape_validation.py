from pattern_engine.shape_validation import (
    calibrated_similarity,
    directional_agreement,
    path_shape_similarity,
    passes_shape_validation,
)


def test_directional_agreement_rejects_opposite_moves():
    assert directional_agreement([1, 2, 3, 2], [1, 2, 1, 0]) < 0.65


def test_path_shape_similarity_rewards_same_turning_points():
    current = [10, 12, 11, 15, 14, 18]
    same_shape = [100, 120, 110, 150, 140, 180]
    different_shape = [100, 110, 120, 115, 130, 125]

    assert path_shape_similarity(current, same_shape) > 0.95
    assert path_shape_similarity(current, different_shape) < path_shape_similarity(current, same_shape)


def test_shape_validation_requires_both_checks():
    assert passes_shape_validation(0.80, 0.80)
    assert not passes_shape_validation(0.64, 0.95)
    assert not passes_shape_validation(0.95, 0.64)


def test_calibrated_similarity_cannot_exceed_perfect_score():
    assert calibrated_similarity(0.99, 1.0, 1.0) <= 1.0
