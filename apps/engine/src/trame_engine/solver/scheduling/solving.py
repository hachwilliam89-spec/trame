"""Résolution d'une semaine par CP-SAT : règles en contraintes dures, couverture en objectif."""

from dataclasses import dataclass
from enum import StrEnum

from ortools.sat.python import cp_model

from trame_engine.solver.scheduling.evaluation import Shortfall, shortfalls_of
from trame_engine.solver.scheduling.model import (
    WeekModel,
    add_coverage_objective,
    build_week_model,
)
from trame_engine.solver.scheduling.week import Assignment, InvalidProblemError, Schedule, Week


class ScheduleStatus(StrEnum):
    """Issues d'une résolution (ADR-0020). `CANCELLED` vient du worker, qui interrompt le calcul."""

    OPTIMAL = "OPTIMAL"
    FEASIBLE = "FEASIBLE"
    INFEASIBLE = "INFEASIBLE"
    UNKNOWN = "UNKNOWN"


@dataclass(frozen=True, slots=True)
class SolveParameters:
    time_limit_seconds: int
    workers: int
    seed: int


@dataclass(frozen=True, slots=True)
class ScheduleOutcome:
    status: ScheduleStatus
    # `None` quand aucun planning n'est trouvé : INFEASIBLE ou UNKNOWN.
    schedule: Schedule | None
    shortfalls: tuple[Shortfall, ...]
    checked_rules: tuple[str, ...]
    solve_seconds: float


def solve_week(week: Week, parameters: SolveParameters) -> ScheduleOutcome:
    week_model = build_week_model(week)
    for rule in week.rules:
        rule.add_to_model(week_model)
    add_coverage_objective(week_model)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = parameters.time_limit_seconds
    solver.parameters.num_workers = parameters.workers
    solver.parameters.random_seed = parameters.seed
    status = status_of(solver.status_name(solver.solve(week_model.model)))
    checked_rules = tuple(rule.rule_id for rule in week.rules)

    if status not in {ScheduleStatus.OPTIMAL, ScheduleStatus.FEASIBLE}:
        return ScheduleOutcome(status, None, (), checked_rules, solver.wall_time)
    schedule = read_schedule(week_model, solver)
    return ScheduleOutcome(
        status, schedule, shortfalls_of(week, schedule), checked_rules, solver.wall_time
    )


def status_of(solver_status: str) -> ScheduleStatus:
    """Issue du solveur. `MODEL_INVALID` trahit un modèle mal construit : c'est une erreur."""
    if solver_status == "MODEL_INVALID":
        msg = "CP-SAT juge le modèle invalide."
        raise InvalidProblemError(msg)
    return ScheduleStatus(solver_status)


def read_schedule(week_model: WeekModel, solver: cp_model.CpSolver) -> Schedule:
    return frozenset(
        Assignment(shift_id, employee_id)
        for (employee_id, shift_id), variable in week_model.is_assigned.items()
        if solver.boolean_value(variable)
    )
