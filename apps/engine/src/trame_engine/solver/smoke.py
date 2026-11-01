"""Résolution CP-SAT minimale : vérifie que le solveur est installé et fonctionne.

Affectation de N employés à N créneaux à coût minimal. Sert de test de fumée du socle
(US-002), puis de point de départ au walking skeleton (US-009).
"""

from dataclasses import dataclass
from enum import StrEnum

from ortools.sat.python import cp_model


class SolveStatus(StrEnum):
    """Issues possibles d'une résolution (ADR-0020)."""

    OPTIMAL = "OPTIMAL"
    FEASIBLE = "FEASIBLE"
    INFEASIBLE = "INFEASIBLE"
    UNKNOWN = "UNKNOWN"
    MODEL_INVALID = "MODEL_INVALID"


@dataclass(frozen=True, slots=True)
class AssignmentResult:
    status: SolveStatus
    cost: int | None
    # assignment[employé] = créneau
    assignment: tuple[int, ...]


def solve_assignment(
    costs: list[list[int]], *, workers: int = 1, seed: int = 0, time_limit_s: float = 5.0
) -> AssignmentResult:
    """Affecte chaque employé à exactement un créneau, et chaque créneau à exactement un employé."""
    size = len(costs)
    if size == 0 or any(len(row) != size for row in costs):
        msg = "La matrice de coûts doit être carrée et non vide."
        raise ValueError(msg)

    model = cp_model.CpModel()
    x = {(e, s): model.new_bool_var(f"x_{e}_{s}") for e in range(size) for s in range(size)}
    for e in range(size):
        model.add_exactly_one(x[e, s] for s in range(size))
    for s in range(size):
        model.add_exactly_one(x[e, s] for e in range(size))
    model.minimize(sum(costs[e][s] * x[e, s] for e in range(size) for s in range(size)))

    solver = cp_model.CpSolver()
    solver.parameters.num_workers = workers
    solver.parameters.random_seed = seed
    solver.parameters.max_time_in_seconds = time_limit_s
    status = SolveStatus(solver.status_name(solver.solve(model)))

    if status not in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}:
        return AssignmentResult(status=status, cost=None, assignment=())

    assignment = tuple(
        next(s for s in range(size) if solver.boolean_value(x[e, s])) for e in range(size)
    )
    # Coût recalculé en entiers : `objective_value` est un flottant (ex. 2.9999999999999982 pour 3).
    cost = sum(costs[e][s] for e, s in enumerate(assignment))
    return AssignmentResult(status=status, cost=cost, assignment=assignment)
