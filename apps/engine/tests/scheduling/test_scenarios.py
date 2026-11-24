"""Scénarios du jalon 1 (issue #69, « Générer un planning »), joués sur le moteur seul."""

from uuid import UUID

import pytest
from week_builders import (
    AFTERNOON,
    CACES_1A,
    CACES_3,
    MORNING,
    WeekBuilder,
    day_of_week,
)

from trame_engine.solver.scheduling import (
    Assignment,
    InvalidProblemError,
    ScheduleStatus,
    SolveParameters,
    Week,
    evaluate_schedule,
    read_week,
    solve_week,
)

CARISTE = UUID("0190f0a0-0000-7000-8000-000000000041")
PREPARATEUR = UUID("0190f0a0-0000-7000-8000-000000000042")
SECOND_CARISTE = UUID("0190f0a0-0000-7000-8000-000000000043")
PARAMETERS = SolveParameters(time_limit_seconds=10, workers=1, seed=0)


def solved_shift_ids(week: Week, employee_id: UUID) -> set[str]:
    """Shifts tenus par ce salarié dans le planning proposé par le solveur."""
    outcome = solve_week(week, PARAMETERS)
    assert outcome.schedule is not None
    return {
        assignment.shift_id
        for assignment in outcome.schedule
        if assignment.employee_id == employee_id
    }


def assigned_shift_ids(builder: WeekBuilder, employee_id: UUID) -> set[str]:
    return solved_shift_ids(read_week(builder.build()), employee_id)


def test_habilitation_requise_un_preparateur_ne_tient_pas_un_shift_de_cariste() -> None:
    builder = (
        WeekBuilder()
        .shift("lundi-matin", day_of_week(0), MORNING, need=((CACES_3,), 1))
        .employee(PREPARATEUR, qualifications={CACES_1A: None})
    )

    outcome = solve_week(read_week(builder.build()), PARAMETERS)

    assert outcome.status is ScheduleStatus.OPTIMAL
    assert outcome.schedule == frozenset()
    assert [(gap.shift_id, gap.required, gap.assigned) for gap in outcome.shortfalls] == [
        ("lundi-matin", 1, 0)
    ]


def test_habilitation_expiree_mercredi_reste_valable_mercredi_et_plus_jeudi() -> None:
    builder = WeekBuilder().employee(CARISTE, qualifications={CACES_3: day_of_week(2)})
    for index, name in enumerate(["lundi", "mardi", "mercredi", "jeudi", "vendredi"]):
        builder.shift(f"{name}-matin", day_of_week(index), MORNING)

    assigned = assigned_shift_ids(builder, CARISTE)

    assert assigned == {"lundi-matin", "mardi-matin", "mercredi-matin"}


def test_repos_quotidien_pas_de_matin_apres_un_apres_midi_qui_finit_a_20h50() -> None:
    week = read_week(
        WeekBuilder()
        .shift("lundi-apres-midi", day_of_week(0), AFTERNOON)
        .shift("mardi-matin", day_of_week(1), MORNING)
        .employee(CARISTE)
        .build()
    )
    both = frozenset({Assignment("lundi-apres-midi", CARISTE), Assignment("mardi-matin", CARISTE)})

    evaluation = evaluate_schedule(week, both)

    assert evaluation.verdict == "INFEASIBLE"
    assert [violation.rule_id for violation in evaluation.violations] == ["REPOS_QUOTIDIEN_MIN"]
    assert len(solved_shift_ids(week, CARISTE)) == 1


def test_duree_quotidienne_pas_de_matin_et_apres_midi_le_meme_jour() -> None:
    builder = (
        WeekBuilder()
        .shift("lundi-matin", day_of_week(0), MORNING)
        .shift("lundi-apres-midi", day_of_week(0), AFTERNOON)
        .employee(CARISTE)
    )
    builder.rules = [{"id": "DUREE_QUOTIDIENNE_MAX", "maximumMinutes": 600}]

    assigned = assigned_shift_ids(builder, CARISTE)

    assert len(assigned) == 1


def test_volume_contractuel_35h_au_plus_cinq_shifts_de_7h() -> None:
    builder = WeekBuilder().employee(CARISTE, weekly_minutes=(0, 2100))
    for index in range(6):
        builder.shift(f"jour-{index}-matin", day_of_week(index), MORNING)

    assigned = assigned_shift_ids(builder, CARISTE)

    assert len(assigned) == 5


def test_sous_effectif_chiffre_samedi_matin_3_requis_2_affectes() -> None:
    builder = (
        WeekBuilder()
        .shift("samedi-matin", day_of_week(5), MORNING, need=((CACES_3,), 3))
        .employee(CARISTE)
        .employee(SECOND_CARISTE)
        .employee(PREPARATEUR, qualifications={CACES_1A: None})
    )

    outcome = solve_week(read_week(builder.build()), PARAMETERS)

    assert outcome.status is ScheduleStatus.OPTIMAL
    assert [(gap.shift_id, gap.required, gap.assigned) for gap in outcome.shortfalls] == [
        ("samedi-matin", 3, 2)
    ]


def test_aucun_planning_legal_quand_les_minimums_contractuels_sont_impossibles() -> None:
    builder = (
        WeekBuilder()
        .shift("lundi-matin", day_of_week(0), MORNING)
        .employee(CARISTE, weekly_minutes=(2100, 2100))
    )

    outcome = solve_week(read_week(builder.build()), PARAMETERS)

    assert outcome.status is ScheduleStatus.INFEASIBLE
    assert outcome.schedule is None
    assert outcome.shortfalls == ()


def test_le_resultat_liste_les_regles_verifiees_et_la_duree_du_calcul() -> None:
    builder = WeekBuilder().shift("lundi-matin", day_of_week(0), MORNING).employee(CARISTE)

    outcome = solve_week(read_week(builder.build()), PARAMETERS)

    assert outcome.checked_rules == (
        "HABILITATION_REQUISE",
        "UN_SEUL_SHIFT",
        "REPOS_QUOTIDIEN_MIN",
        "DUREE_QUOTIDIENNE_MAX",
        "DUREE_HEBDOMADAIRE_MAX",
        "VOLUME_CONTRACTUEL",
        "INDISPONIBILITE",
    )
    assert outcome.solve_seconds >= 0


@pytest.mark.parametrize(
    "change",
    ["doublon-shift", "contrat-inverse", "shift-inverse", "regle-double"],
)
def test_un_probleme_incoherent_est_refuse(change: str) -> None:
    builder = WeekBuilder().shift("lundi-matin", day_of_week(0), MORNING).employee(CARISTE)
    if change == "doublon-shift":
        builder.shift("lundi-matin", day_of_week(1), MORNING)
    if change == "contrat-inverse":
        builder.employee(SECOND_CARISTE, weekly_minutes=(2100, 420))
    if change == "shift-inverse":
        builder.shifts[0]["endsAt"] = builder.shifts[0]["startsAt"]
    if change == "regle-double":
        builder.rules.append({"id": "UN_SEUL_SHIFT"})

    with pytest.raises(InvalidProblemError):
        read_week(builder.build())


def test_une_habilitation_sans_expiration_reste_valable() -> None:
    builder = (
        WeekBuilder()
        .shift("samedi-matin", day_of_week(5), MORNING)
        .employee(CARISTE, qualifications={CACES_3: None})
    )

    assert assigned_shift_ids(builder, CARISTE) == {"samedi-matin"}
