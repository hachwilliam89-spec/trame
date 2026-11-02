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
    # Pour chaque employé (dans l'ordre), l'indice du créneau qui lui est affecté.
    assignment: tuple[int, ...]


def solve_assignment(
    costs: list[list[int]], *, workers: int = 1, seed: int = 0, time_limit_s: float = 5.0
) -> AssignmentResult:
    """Affecte chaque employé à exactement un créneau, et chaque créneau à exactement un employé.

    `costs[employee][slot]` est le coût d'affecter cet employé à ce créneau.
    """
    size = len(costs)
    if size == 0 or any(len(row) != size for row in costs):
        msg = "La matrice de coûts doit être carrée et non vide."
        raise ValueError(msg)

    employees = range(size)
    slots = range(size)
    model = cp_model.CpModel()

    # is_assigned[employee, slot] vaut 1 si l'employé tient ce créneau (x_{e,s} du cadrage, §8).
    is_assigned = {
        (employee, slot): model.new_bool_var(f"assigned_{employee}_{slot}")
        for employee in employees
        for slot in slots
    }
    for employee in employees:
        model.add_exactly_one(is_assigned[employee, slot] for slot in slots)
    for slot in slots:
        model.add_exactly_one(is_assigned[employee, slot] for employee in employees)

    total_cost = sum(
        costs[employee][slot] * is_assigned[employee, slot]
        for employee in employees
        for slot in slots
    )
    model.minimize(total_cost)

    solver = cp_model.CpSolver()
    solver.parameters.num_workers = workers
    solver.parameters.random_seed = seed
    solver.parameters.max_time_in_seconds = time_limit_s
    status = SolveStatus(solver.status_name(solver.solve(model)))

    if status not in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}:
        return AssignmentResult(status=status, cost=None, assignment=())

    assignment: list[int] = []
    for employee in employees:
        for slot in slots:
            if solver.boolean_value(is_assigned[employee, slot]):
                assignment.append(slot)

    # Coût recalculé en entiers : `objective_value` est un flottant (ex. 2.9999999999999982 pour 3).
    cost = sum(costs[employee][slot] for employee, slot in enumerate(assignment))
    return AssignmentResult(status=status, cost=cost, assignment=tuple(assignment))
