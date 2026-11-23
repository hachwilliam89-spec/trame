"""VOLUME_CONTRACTUEL : temps effectif de la semaine entre le minimum restant et le maximum du
contrat. Le minimum restant retranche les minutes d'absence valorisées (US-033)."""

from trame_engine.solver.scheduling.model import WeekModel
from trame_engine.solver.scheduling.rules.base import Violation
from trame_engine.solver.scheduling.rules.durations import assigned_minutes, total_minutes
from trame_engine.solver.scheduling.week import Schedule, Week, shifts_of


class ContractualVolume:
    rule_id = "VOLUME_CONTRACTUEL"

    def add_to_model(self, week_model: WeekModel) -> None:
        for employee in week_model.week.employees:
            worked = assigned_minutes(week_model, employee.id, week_model.week.shifts)
            week_model.model.add(worked >= employee.remaining_minutes_min)
            week_model.model.add(worked <= employee.weekly_minutes_max)

    def evaluate(self, week: Week, schedule: Schedule) -> list[Violation]:
        violations: list[Violation] = []
        for employee in week.employees:
            held = shifts_of(week, schedule, employee.id)
            worked = total_minutes(held)
            if not employee.remaining_minutes_min <= worked <= employee.weekly_minutes_max:
                shift_ids = tuple(shift.id for shift in held)
                violations.append(Violation(self.rule_id, employee.id, shift_ids))
        return violations
