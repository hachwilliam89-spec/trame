"""Une règle de planification : un objet, deux formes (ADR-0020).

`add_to_model` pose la contrainte dans CP-SAT ; `evaluate` juge un planning donné, pour la PE.
Les deux s'appuient sur le même prédicat : une divergence est détectée par le test de cohérence.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from trame_engine.solver.scheduling.model import WeekModel
from trame_engine.solver.scheduling.week import Schedule, Shift, Week, shifts_of


@dataclass(frozen=True, slots=True)
class Violation:
    """Une règle enfreinte : par qui, et sur quels shifts."""

    rule_id: str
    employee_id: UUID
    shift_ids: tuple[str, ...]


class SchedulingRule(Protocol):
    @property
    def rule_id(self) -> str: ...

    def add_to_model(self, week_model: WeekModel) -> None: ...

    def evaluate(self, week: Week, schedule: Schedule) -> list[Violation]: ...


class PairwiseRule(ABC):
    """Règle qui interdit à un même salarié deux shifts en conflit (chevauchement, repos court)."""

    @property
    @abstractmethod
    def rule_id(self) -> str: ...

    @abstractmethod
    def conflicts(self, earlier: Shift, later: Shift) -> bool:
        """`earlier` commence au plus tard quand `later` commence."""

    def add_to_model(self, week_model: WeekModel) -> None:
        for earlier, later in self._conflicting_pairs(week_model.week.shifts):
            for employee in week_model.week.employees:
                week_model.model.add(
                    week_model.assigned(employee.id, earlier.id)
                    + week_model.assigned(employee.id, later.id)
                    <= 1
                )

    def evaluate(self, week: Week, schedule: Schedule) -> list[Violation]:
        violations: list[Violation] = []
        for employee in week.employees:
            held = shifts_of(week, schedule, employee.id)
            for earlier, later in self._conflicting_pairs(held):
                violations.append(Violation(self.rule_id, employee.id, (earlier.id, later.id)))
        return violations

    def _conflicting_pairs(
        self, shifts: tuple[Shift, ...] | list[Shift]
    ) -> list[tuple[Shift, Shift]]:
        ordered = sorted(shifts, key=lambda shift: (shift.starts_at, shift.id))
        pairs: list[tuple[Shift, Shift]] = []
        for index, earlier in enumerate(ordered):
            for later in ordered[index + 1 :]:
                if self.conflicts(earlier, later):
                    pairs.append((earlier, later))
        return pairs
