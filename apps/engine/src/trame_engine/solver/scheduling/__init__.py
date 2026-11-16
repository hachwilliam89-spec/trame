"""Planification d'une semaine (jalon 1, issue #69) : six règles, couverture, résolution et PE."""

from trame_engine.solver.scheduling.evaluation import (
    Evaluation,
    Shortfall,
    evaluate_schedule,
)
from trame_engine.solver.scheduling.reading import read_week
from trame_engine.solver.scheduling.solving import (
    ScheduleOutcome,
    ScheduleStatus,
    SolveParameters,
    solve_week,
)
from trame_engine.solver.scheduling.week import (
    Assignment,
    InvalidProblemError,
    Schedule,
    Week,
)

__all__ = [
    "Assignment",
    "Evaluation",
    "InvalidProblemError",
    "Schedule",
    "ScheduleOutcome",
    "ScheduleStatus",
    "Shortfall",
    "SolveParameters",
    "Week",
    "evaluate_schedule",
    "read_week",
    "solve_week",
]
