"""Règles de durée sur une nuit de changement d'heure (AGENTS.md, « Temps » ; ADR-0019).

Le repos se mesure en temps écoulé entre deux instants ; la durée quotidienne se compte par jour
civil local. Paris passe à l'heure d'hiver le 25 octobre 2026 et à l'heure d'été le 29 mars 2026.
"""

from datetime import date, time
from uuid import UUID

from week_builders import WeekBuilder

from trame_engine.solver.scheduling import Assignment, evaluate_schedule, read_week

CARISTE = UUID("0190f0a0-0000-7000-8000-000000000041")
REST_ONLY = [{"id": "REPOS_QUOTIDIEN_MIN", "minimumMinutes": 660}]
DAILY_ONLY = [{"id": "DUREE_QUOTIDIENNE_MAX", "maximumMinutes": 600}]


def verdict_for_both(builder: WeekBuilder, first: str, second: str) -> str:
    week = read_week(builder.build())
    both = frozenset({Assignment(first, CARISTE), Assignment(second, CARISTE)})
    return evaluate_schedule(week, both).verdict


def test_heure_d_hiver_10h30_a_l_horloge_mais_11h30_ecoulees_le_repos_est_respecte() -> None:
    builder = (
        WeekBuilder(week_starts_on=date(2026, 10, 19), rules=list(REST_ONLY))
        .shift("samedi", date(2026, 10, 24), (time(12, 10), time(19, 30)))
        .shift("dimanche", date(2026, 10, 25), (time(6, 0), time(13, 20)))
        .employee(CARISTE)
    )

    assert verdict_for_both(builder, "samedi", "dimanche") == "FEASIBLE"


def test_heure_d_ete_11h30_a_l_horloge_mais_10h30_ecoulees_le_repos_est_insuffisant() -> None:
    builder = (
        WeekBuilder(week_starts_on=date(2026, 3, 23), rules=list(REST_ONLY))
        .shift("samedi", date(2026, 3, 28), (time(11, 10), time(18, 30)))
        .shift("dimanche", date(2026, 3, 29), (time(6, 0), time(13, 20)))
        .employee(CARISTE)
    )

    assert verdict_for_both(builder, "samedi", "dimanche") == "INFEASIBLE"


def test_la_duree_quotidienne_se_compte_sur_le_jour_civil_du_changement_d_heure() -> None:
    builder = (
        WeekBuilder(week_starts_on=date(2026, 10, 19), rules=list(DAILY_ONLY))
        .shift("dimanche-matin", date(2026, 10, 25), (time(6, 0), time(13, 20)))
        .shift("dimanche-apres-midi", date(2026, 10, 25), (time(13, 30), time(20, 50)))
        .employee(CARISTE)
    )

    assert verdict_for_both(builder, "dimanche-matin", "dimanche-apres-midi") == "INFEASIBLE"


def test_une_absence_sur_la_nuit_du_passage_a_l_heure_d_hiver_se_compare_en_instants() -> None:
    """Le 25 octobre 2026, 02:30 (+02:00) précède 02:30 (+01:00) d'une heure : seuls les
    instants comptent, pas l'heure affichée."""
    sunday = date(2026, 10, 25)
    builder = (
        WeekBuilder(week_starts_on=date(2026, 10, 19), rules=[{"id": "INDISPONIBILITE"}])
        .shift("dimanche-tot", sunday, (time(2, 0), time(5, 0)))
        .employee(
            CARISTE,
            unavailabilities=(("2026-10-25T00:00:00+02:00", "2026-10-25T02:00:00+01:00"),),
        )
    )
    week = read_week(builder.build())
    early = frozenset({Assignment("dimanche-tot", CARISTE)})

    # Le shift commence à 02:00 (+02:00), une heure avant la fin de l'absence à 02:00 (+01:00).
    assert evaluate_schedule(week, early).verdict == "INFEASIBLE"
