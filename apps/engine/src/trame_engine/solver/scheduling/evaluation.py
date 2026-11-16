"""PE (Procédure d'Évaluation) d'un planning donné : règles enfreintes et manques de couverture.

Au jalon 1, elle sert au test de cohérence avec le solveur (ADR-0020) ; elle évaluera ensuite les
modifications du manager.
"""

from collections import Counter
from dataclasses import dataclass
from typing import Literal

from trame_engine.solver.scheduling.rules.base import Violation
from trame_engine.solver.scheduling.week import Schedule, Week


@dataclass(frozen=True, slots=True)
class Shortfall:
    """Un shift sous-couvert : « 3 requis, 2 affectés »."""

    shift_id: str
    required: int
    assigned: int


@dataclass(frozen=True, slots=True)
class Evaluation:
    verdict: Literal["FEASIBLE", "INFEASIBLE"]
    violations: tuple[Violation, ...]
    shortfalls: tuple[Shortfall, ...]


def shortfalls_of(week: Week, schedule: Schedule) -> tuple[Shortfall, ...]:
    """Chaque shift qui reçoit moins de personnes qu'il n'en demande, dans l'ordre de la semaine."""
    assigned = Counter(assignment.shift_id for assignment in schedule)
    return tuple(
        Shortfall(shift.id, shift.required_count, assigned[shift.id])
        for shift in week.shifts
        if assigned[shift.id] < shift.required_count
    )


def evaluate_schedule(week: Week, schedule: Schedule) -> Evaluation:
    """Conforme si aucune règle n'est enfreinte : un manque de couverture n'est pas une faute."""
    violations: list[Violation] = []
    for rule in week.rules:
        violations.extend(rule.evaluate(week, schedule))
    verdict: Literal["FEASIBLE", "INFEASIBLE"] = "INFEASIBLE" if violations else "FEASIBLE"
    return Evaluation(verdict, tuple(violations), shortfalls_of(week, schedule))
