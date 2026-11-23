"""Absences d'US-033 (issue #105) dans le moteur : indisponibilités et minimum restant."""

from datetime import date, time
from uuid import UUID

import pytest
from week_builders import AFTERNOON, MORNING, WeekBuilder, day_of_week, local_instant

from trame_engine.solver.scheduling import (
    Assignment,
    InvalidProblemError,
    ScheduleStatus,
    SolveParameters,
    evaluate_schedule,
    read_week,
    solve_week,
)

CARISTE = UUID("0190f0a0-0000-7000-8000-000000000041")
PARAMETERS = SolveParameters(time_limit_seconds=10, workers=1, seed=0)
UNAVAILABILITY_ONLY = [{"id": "INDISPONIBILITE"}]
VOLUME_ONLY = [{"id": "VOLUME_CONTRACTUEL"}]


def solved_shift_ids(builder: WeekBuilder) -> set[str]:
    outcome = solve_week(read_week(builder.build()), PARAMETERS)
    assert outcome.schedule is not None
    return {assignment.shift_id for assignment in outcome.schedule}


def whole_days(first: date, last: date) -> tuple[str, str]:
    """De `first` à minuit jusqu'à `last` à minuit, fin exclue, à l'heure de Paris."""
    return (local_instant(first, time(0, 0)), local_instant(last, time(0, 0)))


def test_bdd_une_absence_retire_le_salarie_des_creneaux_qu_elle_couvre() -> None:
    builder = WeekBuilder().employee(
        CARISTE,
        unavailabilities=(whole_days(day_of_week(1), day_of_week(3)),),
    )
    for index in range(4):
        builder.shift(f"jour-{index}-matin", day_of_week(index), MORNING)

    assert solved_shift_ids(builder) == {"jour-0-matin", "jour-3-matin"}


def test_bdd_une_absence_partielle_laisse_l_apres_midi_possible() -> None:
    thursday = day_of_week(3)
    builder = (
        WeekBuilder()
        .shift("jeudi-matin", thursday, MORNING)
        .shift("jeudi-apres-midi", thursday, AFTERNOON)
        .employee(
            CARISTE,
            unavailabilities=(
                (local_instant(thursday, time(6, 0)), local_instant(thursday, time(10, 0))),
            ),
        )
    )

    assert solved_shift_ids(builder) == {"jeudi-apres-midi"}


def test_une_absence_qui_finit_au_debut_du_shift_le_laisse_possible() -> None:
    thursday = day_of_week(3)
    builder = (
        WeekBuilder(rules=list(UNAVAILABILITY_ONLY))
        .shift("jeudi-apres-midi", thursday, AFTERNOON)
        .employee(
            CARISTE,
            unavailabilities=(
                (local_instant(thursday, time(6, 0)), local_instant(thursday, time(13, 30))),
            ),
        )
    )

    assert solved_shift_ids(builder) == {"jeudi-apres-midi"}


def test_une_absence_du_lundi_suivant_interdit_le_shift_de_nuit_du_dimanche() -> None:
    sunday = day_of_week(6)
    next_monday = day_of_week(7)
    builder = (
        WeekBuilder(rules=list(UNAVAILABILITY_ONLY))
        .shift("dimanche-nuit", sunday, (time(22, 0), time(6, 0)))
        .employee(
            CARISTE,
            unavailabilities=(
                (local_instant(next_monday, time(0, 0)), local_instant(next_monday, time(23, 59))),
            ),
        )
    )

    assert solved_shift_ids(builder) == set()


def test_la_pe_signale_un_shift_tenu_pendant_une_absence() -> None:
    tuesday = day_of_week(1)
    builder = (
        WeekBuilder(rules=list(UNAVAILABILITY_ONLY))
        .shift("mardi-matin", tuesday, MORNING)
        .employee(CARISTE, unavailabilities=(whole_days(tuesday, day_of_week(2)),))
    )
    week = read_week(builder.build())

    evaluation = evaluate_schedule(week, frozenset({Assignment("mardi-matin", CARISTE)}))

    assert evaluation.verdict == "INFEASIBLE"
    assert [(item.rule_id, item.shift_ids) for item in evaluation.violations] == [
        ("INDISPONIBILITE", ("mardi-matin",))
    ]


def test_bdd_le_minimum_restant_retranche_les_minutes_d_absence() -> None:
    builder = WeekBuilder(rules=list(VOLUME_ONLY)).employee(
        CARISTE, weekly_minutes=(1680, 2100), absence_minutes=420
    )
    for index in range(3):
        builder.shift(f"jour-{index}-matin", day_of_week(index), MORNING)

    outcome = solve_week(read_week(builder.build()), PARAMETERS)

    assert outcome.status is ScheduleStatus.OPTIMAL
    assert outcome.schedule is not None
    assert len(outcome.schedule) == 3


def test_sans_minutes_d_absence_le_meme_minimum_est_irrealisable() -> None:
    builder = WeekBuilder(rules=list(VOLUME_ONLY)).employee(CARISTE, weekly_minutes=(1680, 2100))
    for index in range(3):
        builder.shift(f"jour-{index}-matin", day_of_week(index), MORNING)

    outcome = solve_week(read_week(builder.build()), PARAMETERS)

    assert outcome.status is ScheduleStatus.INFEASIBLE


def test_le_minimum_restant_ne_descend_pas_sous_zero() -> None:
    builder = WeekBuilder(rules=list(VOLUME_ONLY)).employee(
        CARISTE, weekly_minutes=(840, 2100), absence_minutes=2100
    )
    week = read_week(builder.build())

    assert evaluate_schedule(week, frozenset()).verdict == "FEASIBLE"


def test_la_pe_juge_le_volume_sur_le_minimum_restant() -> None:
    builder = (
        WeekBuilder(rules=list(VOLUME_ONLY))
        .shift("lundi-matin", day_of_week(0), MORNING)
        .employee(CARISTE, weekly_minutes=(840, 2100), absence_minutes=420)
    )
    week = read_week(builder.build())

    assert evaluate_schedule(week, frozenset({Assignment("lundi-matin", CARISTE)})).verdict == (
        "FEASIBLE"
    )
    assert evaluate_schedule(week, frozenset()).verdict == "INFEASIBLE"


def test_une_indisponibilite_qui_finit_avant_de_commencer_est_refusee() -> None:
    tuesday = day_of_week(1)
    builder = WeekBuilder().employee(
        CARISTE,
        unavailabilities=(
            (local_instant(tuesday, time(10, 0)), local_instant(tuesday, time(6, 0))),
        ),
    )

    with pytest.raises(InvalidProblemError):
        read_week(builder.build())
