"""Le modèle CP-SAT d'une semaine : une variable par couple (salarié, shift), cadre de couverture.

`is_assigned[employee, shift]` vaut 1 si le salarié tient le shift (x_{e,s} du cadrage, §8).
"""

from dataclasses import dataclass
from uuid import UUID

from ortools.sat.python import cp_model

from trame_engine.solver.scheduling.week import Assignment, Schedule, Week


@dataclass(frozen=True, slots=True)
class WeekModel:
    week: Week
    model: cp_model.CpModel
    is_assigned: dict[tuple[UUID, str], cp_model.IntVar]

    def assigned(self, employee_id: UUID, shift_id: str) -> cp_model.IntVar:
        return self.is_assigned[employee_id, shift_id]


def build_week_model(week: Week) -> WeekModel:
    """Variables d'affectation, et jamais plus de personnes qu'un shift n'en demande."""
    model = cp_model.CpModel()
    is_assigned = {
        (employee.id, shift.id): model.new_bool_var(f"assigned_{employee.id}_{shift.id}")
        for employee in week.employees
        for shift in week.shifts
    }
    for shift in week.shifts:
        model.add(
            sum(is_assigned[employee.id, shift.id] for employee in week.employees)
            <= shift.required_count
        )
    return WeekModel(week=week, model=model, is_assigned=is_assigned)


def add_coverage_objective(week_model: WeekModel) -> None:
    """Mode standard (cadrage §8) : la couverture est un objectif, un manque reste permis.

    Avec le plafond par shift, minimiser le total des places non pourvues revient à maximiser le
    nombre d'affectations : le total requis, moins le total affecté, est un total requis constant
    diminué des affectations.
    """
    week_model.model.maximize(sum(week_model.is_assigned.values()))


def fix_schedule(week_model: WeekModel, schedule: Schedule) -> None:
    """Fige les variables sur un planning donné : le modèle dit alors s'il l'accepte."""
    for (employee_id, shift_id), variable in week_model.is_assigned.items():
        is_in_schedule = Assignment(shift_id, employee_id) in schedule
        week_model.model.add(variable == int(is_in_schedule))
