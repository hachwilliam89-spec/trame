"""Sommes de temps effectif, partagées par les règles de durée et de volume."""

from collections.abc import Iterable
from uuid import UUID

from ortools.sat.python import cp_model

from trame_engine.solver.scheduling.model import WeekModel
from trame_engine.solver.scheduling.week import Shift


def assigned_minutes(
    week_model: WeekModel, employee_id: UUID, shifts: Iterable[Shift]
) -> cp_model.LinearExpr:
    """Temps effectif tenu par ce salarié sur ces shifts, comme expression du modèle."""
    listed = list(shifts)
    return cp_model.LinearExpr.weighted_sum(
        [week_model.assigned(employee_id, shift.id) for shift in listed],
        [shift.effective_minutes for shift in listed],
    )


def total_minutes(shifts: Iterable[Shift]) -> int:
    return sum(shift.effective_minutes for shift in shifts)
