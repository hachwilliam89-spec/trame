"""DUREE_HEBDOMADAIRE_MAX : temps effectif sur la semaine (C. trav. art. L3121-20)."""

from dataclasses import dataclass

from trame_engine.solver.scheduling.model import WeekModel
from trame_engine.solver.scheduling.rules.base import Violation
from trame_engine.solver.scheduling.rules.durations import assigned_minutes, total_minutes
from trame_engine.solver.scheduling.week import Schedule, Week, shifts_of


@dataclass(frozen=True, slots=True)
class MaximumWeeklyDuration:
    maximum_minutes: int
    rule_id = "DUREE_HEBDOMADAIRE_MAX"

    def add_to_model(self, week_model: WeekModel) -> None:
        for employee in week_model.week.employees:
            worked = assigned_minutes(week_model, employee.id, week_model.week.shifts)
            week_model.model.add(worked <= self.maximum_minutes)

    def evaluate(self, week: Week, schedule: Schedule) -> list[Violation]:
        violations: list[Violation] = []
        for employee in week.employees:
            held = shifts_of(week, schedule, employee.id)
            if total_minutes(held) > self.maximum_minutes:
                shift_ids = tuple(shift.id for shift in held)
                violations.append(Violation(self.rule_id, employee.id, shift_ids))
        return violations
