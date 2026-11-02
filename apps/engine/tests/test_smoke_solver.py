from itertools import permutations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from trame_engine.solver.smoke import SolveStatus, solve_assignment


def test_trouve_l_affectation_optimale_connue() -> None:
    costs = [
        [4, 1, 3],
        [2, 0, 5],
        [3, 2, 2],
    ]

    result = solve_assignment(costs)

    assert result.status is SolveStatus.OPTIMAL
    assert result.cost == 5
    assert result.assignment == (1, 0, 2)


def test_refuse_une_matrice_non_carree() -> None:
    with pytest.raises(ValueError, match="carrée"):
        solve_assignment([[1, 2], [3]])


def _brute_force(costs: list[list[int]]) -> int:
    size = len(costs)
    return min(sum(costs[e][p[e]] for e in range(size)) for p in permutations(range(size)))


@st.composite
def square_costs(draw: st.DrawFn) -> list[list[int]]:
    size = draw(st.integers(min_value=1, max_value=4))
    row = st.lists(st.integers(min_value=0, max_value=20), min_size=size, max_size=size)
    return draw(st.lists(row, min_size=size, max_size=size))


@settings(max_examples=40, deadline=None)
@given(square_costs())
def test_le_cout_optimal_egale_la_recherche_exhaustive(costs: list[list[int]]) -> None:
    result = solve_assignment(costs)

    assert result.status is SolveStatus.OPTIMAL
    assert sorted(result.assignment) == list(range(len(costs)))
    assert result.cost == _brute_force(costs)
