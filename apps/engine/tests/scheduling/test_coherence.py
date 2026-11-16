"""Cohérence solveur ↔ PE de chaque règle (ADR-0020), sur des semaines tirées au hasard.

1. Toute solution du solveur est jugée conforme par la PE.
2. Un planning tiré au hasard est accepté par le modèle, variables figées, si et seulement si la
   PE le juge conforme.
"""

from datetime import date
from typing import Any
from uuid import UUID

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from ortools.sat.python import cp_model
from week_builders import AFTERNOON, CACES_3, MORNING, WeekBuilder, day_of_week

from trame_engine.solver.scheduling import (
    Assignment,
    Schedule,
    SolveParameters,
    Week,
    evaluate_schedule,
    read_week,
    solve_week,
)
from trame_engine.solver.scheduling.model import build_week_model, fix_schedule

RULE_SETS: dict[str, list[dict[str, Any]]] = {
    "HABILITATION_REQUISE": [{"id": "HABILITATION_REQUISE"}],
    "UN_SEUL_SHIFT": [{"id": "UN_SEUL_SHIFT"}],
    "REPOS_QUOTIDIEN_MIN": [{"id": "REPOS_QUOTIDIEN_MIN", "minimumMinutes": 660}],
    "DUREE_QUOTIDIENNE_MAX": [{"id": "DUREE_QUOTIDIENNE_MAX", "maximumMinutes": 600}],
    "DUREE_HEBDOMADAIRE_MAX": [{"id": "DUREE_HEBDOMADAIRE_MAX", "maximumMinutes": 1260}],
    "VOLUME_CONTRACTUEL": [{"id": "VOLUME_CONTRACTUEL"}],
    "les six règles": [
        {"id": "HABILITATION_REQUISE"},
        {"id": "UN_SEUL_SHIFT"},
        {"id": "REPOS_QUOTIDIEN_MIN", "minimumMinutes": 660},
        {"id": "DUREE_QUOTIDIENNE_MAX", "maximumMinutes": 600},
        {"id": "DUREE_HEBDOMADAIRE_MAX", "maximumMinutes": 1260},
        {"id": "VOLUME_CONTRACTUEL"},
    ],
}
PARAMETERS = SolveParameters(time_limit_seconds=10, workers=1, seed=0)
EXAMPLES = settings(max_examples=40, deadline=None, suppress_health_check=[HealthCheck.too_slow])


@st.composite
def weeks(draw: st.DrawFn, rules: list[dict[str, Any]]) -> Week:
    """De 1 à 3 salariés et de 1 à 6 shifts, matins et après-midis du lundi au samedi."""
    builder = WeekBuilder(rules=list(rules))
    slots = draw(
        st.lists(
            st.tuples(st.integers(0, 5), st.sampled_from(["matin", "apres-midi"])),
            min_size=1,
            max_size=6,
            unique=True,
        )
    )
    for day_index, moment in slots:
        hours = MORNING if moment == "matin" else AFTERNOON
        required = draw(st.integers(1, 2))
        builder.shift(
            f"{day_index}-{moment}", day_of_week(day_index), hours, need=((CACES_3,), required)
        )
    for index in range(draw(st.integers(1, 3))):
        builder.employee(
            UUID(int=index + 1),
            qualifications=draw(qualifications()),
            weekly_minutes=draw(weekly_volumes()),
        )
    return read_week(builder.build())


def qualifications() -> st.SearchStrategy[dict[UUID, date | None]]:
    expiry = st.one_of(st.none(), st.integers(0, 5).map(day_of_week))
    return st.one_of(st.just({}), expiry.map(lambda last_day: {CACES_3: last_day}))


def weekly_volumes() -> st.SearchStrategy[tuple[int, int]]:
    return st.tuples(st.sampled_from([0, 420, 840]), st.sampled_from([840, 1260, 2100]))


@st.composite
def schedules(draw: st.DrawFn, week: Week) -> Schedule:
    """Un planning au hasard, dans le plafond de chaque shift (cadre du modèle, pas une règle)."""
    chosen: set[Assignment] = set()
    for shift in week.shifts:
        candidates = [employee.id for employee in week.employees]
        held = draw(
            st.lists(st.sampled_from(candidates), unique=True, max_size=shift.required_count)
        )
        chosen.update(Assignment(shift.id, employee_id) for employee_id in held)
    return frozenset(chosen)


def model_accepts(week: Week, schedule: Schedule) -> bool:
    week_model = build_week_model(week)
    for rule in week.rules:
        rule.add_to_model(week_model)
    fix_schedule(week_model, schedule)
    status = cp_model.CpSolver().solve(week_model.model)
    return status in {cp_model.OPTIMAL, cp_model.FEASIBLE}


@pytest.mark.parametrize("rule_set", RULE_SETS.keys())
def test_toute_solution_du_solveur_est_conforme_pour_la_pe(rule_set: str) -> None:
    @EXAMPLES
    @given(week=weeks(RULE_SETS[rule_set]))
    def property_holds(week: Week) -> None:
        outcome = solve_week(week, PARAMETERS)
        if outcome.schedule is not None:
            assert evaluate_schedule(week, outcome.schedule).violations == ()

    property_holds()


@pytest.mark.parametrize("rule_set", RULE_SETS.keys())
def test_le_modele_accepte_un_planning_si_et_seulement_si_la_pe_le_juge_conforme(
    rule_set: str,
) -> None:
    @EXAMPLES
    @given(data=st.data(), week=weeks(RULE_SETS[rule_set]))
    def property_holds(data: st.DataObject, week: Week) -> None:
        schedule = data.draw(schedules(week))
        judged_feasible = evaluate_schedule(week, schedule).verdict == "FEASIBLE"
        assert model_accepts(week, schedule) == judged_feasible

    property_holds()
