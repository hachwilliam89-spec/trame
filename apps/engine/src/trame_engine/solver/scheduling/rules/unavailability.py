"""INDISPONIBILITE : un salarié ne tient aucun shift qui chevauche une de ses absences (US-033)."""

from trame_engine.solver.scheduling.model import WeekModel
from trame_engine.solver.scheduling.rules.base import Violation
from trame_engine.solver.scheduling.week import Schedule, Week


class Unavailability:
    rule_id = "INDISPONIBILITE"

    def add_to_model(self, week_model: WeekModel) -> None:
        for employee in week_model.week.employees:
            for shift in week_model.week.shifts:
                if not employee.is_available_for(shift):
                    week_model.model.add(week_model.assigned(employee.id, shift.id) == 0)

    def evaluate(self, week: Week, schedule: Schedule) -> list[Violation]:
        violations: list[Violation] = []
        for assignment in sorted(schedule, key=lambda item: (item.shift_id, str(item.employee_id))):
            employee = week.employee(assignment.employee_id)
            if not employee.is_available_for(week.shift(assignment.shift_id)):
                violations.append(Violation(self.rule_id, employee.id, (assignment.shift_id,)))
        return violations
