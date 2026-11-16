"""Une semaine à la taille du jeu de démo (issue #69), résolue dans le temps imparti."""

from uuid import UUID

import pytest
from week_builders import AFTERNOON, CACES_1A, CACES_3, MORNING, WeekBuilder, day_of_week

from trame_engine.solver.scheduling import (
    InvalidProblemError,
    ScheduleStatus,
    SolveParameters,
    evaluate_schedule,
    read_week,
    solve_week,
)
from trame_engine.solver.scheduling.solving import status_of

TIME_LIMIT_SECONDS = 10


def demo_week() -> WeekBuilder:
    """Douze salariés à 35 h au plus ; caristes et préparateurs, du lundi au samedi matin."""
    builder = WeekBuilder()
    for index in range(5):
        day = day_of_week(index)
        for moment, hours in (("matin", MORNING), ("apres-midi", AFTERNOON)):
            builder.shift(f"{index}-{moment}-cariste", day, hours, need=((CACES_3,), 2))
            builder.shift(f"{index}-{moment}-preparateur", day, hours, need=((CACES_1A,), 2))
    builder.shift("5-matin-cariste", day_of_week(5), MORNING, need=((CACES_3,), 3))
    builder.shift("5-matin-preparateur", day_of_week(5), MORNING, need=((CACES_1A,), 2))
    for index in range(6):
        builder.employee(UUID(int=index + 1), qualifications={CACES_3: None})
        builder.employee(UUID(int=index + 101), qualifications={CACES_1A: None})
    return builder


def test_la_semaine_de_demo_est_resolue_et_conforme_dans_le_temps_imparti() -> None:
    week = read_week(demo_week().build())

    outcome = solve_week(week, SolveParameters(TIME_LIMIT_SECONDS, workers=1, seed=0))

    assert outcome.status in {ScheduleStatus.OPTIMAL, ScheduleStatus.FEASIBLE}
    assert outcome.schedule is not None
    assert evaluate_schedule(week, outcome.schedule).verdict == "FEASIBLE"
    assert outcome.solve_seconds < TIME_LIMIT_SECONDS


@pytest.mark.parametrize("status", ["OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNKNOWN"])
def test_chaque_issue_du_solveur_est_rendue_telle_quelle(status: str) -> None:
    assert status_of(status) is ScheduleStatus(status)


def test_un_modele_juge_invalide_par_cp_sat_est_une_erreur() -> None:
    with pytest.raises(InvalidProblemError):
        status_of("MODEL_INVALID")
