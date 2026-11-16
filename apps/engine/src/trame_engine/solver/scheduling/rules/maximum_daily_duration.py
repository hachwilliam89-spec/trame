"""DUREE_QUOTIDIENNE_MAX : temps effectif par jour (C. trav. art. L3121-18).

Le jour d'un shift est le jour civil local de son début. Cette convention vaut pour les créneaux
de jour du jalon 1 ; elle sera revue avant les nuits, qui chevauchent deux jours.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date

from trame_engine.solver.scheduling.model import WeekModel
from trame_engine.solver.scheduling.rules.base import Violation
from trame_engine.solver.scheduling.rules.durations import assigned_minutes, total_minutes
from trame_engine.solver.scheduling.week import Schedule, Shift, Week, shifts_of


def shifts_by_day(shifts: tuple[Shift, ...] | list[Shift]) -> dict[date, list[Shift]]:
    by_day: dict[date, list[Shift]] = defaultdict(list)
    for shift in shifts:
        by_day[shift.day].append(shift)
    return dict(sorted(by_day.items()))


@dataclass(frozen=True, slots=True)
class MaximumDailyDuration:
    maximum_minutes: int
    rule_id = "DUREE_QUOTIDIENNE_MAX"

    def add_to_model(self, week_model: WeekModel) -> None:
        for employee in week_model.week.employees:
            for day_shifts in shifts_by_day(week_model.week.shifts).values():
                worked = assigned_minutes(week_model, employee.id, day_shifts)
                week_model.model.add(worked <= self.maximum_minutes)

    def evaluate(self, week: Week, schedule: Schedule) -> list[Violation]:
        violations: list[Violation] = []
        for employee in week.employees:
            for day_shifts in shifts_by_day(shifts_of(week, schedule, employee.id)).values():
                if total_minutes(day_shifts) > self.maximum_minutes:
                    shift_ids = tuple(shift.id for shift in day_shifts)
                    violations.append(Violation(self.rule_id, employee.id, shift_ids))
        return violations
