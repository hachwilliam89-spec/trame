"""La semaine à planifier, telle que le moteur la manipule (jalon 1, issue #69).

Ces types ne dépendent ni du contrat ni de CP-SAT : les règles les lisent pour poser leurs
contraintes et pour juger un planning donné (ADR-0020).
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from trame_engine.solver.scheduling.rules.base import SchedulingRule


class InvalidProblemError(ValueError):
    """Le problème reçu est incohérent : aucun calcul n'est lancé (`INVALID_MODEL`)."""


@dataclass(frozen=True, slots=True)
class Shift:
    """Un besoin à couvrir : un créneau, un poste, un jour."""

    id: str
    day: date
    starts_at: datetime
    ends_at: datetime
    effective_minutes: int
    required_skill_ids: frozenset[UUID]
    required_count: int

    def overlaps(self, other: Shift) -> bool:
        return self.starts_at < other.ends_at and other.starts_at < self.ends_at


@dataclass(frozen=True, slots=True)
class UnavailablePeriod:
    """Une période où le salarié est absent, début inclus, fin exclue (US-033)."""

    starts_at: datetime
    ends_at: datetime

    def overlaps(self, shift: Shift) -> bool:
        return self.starts_at < shift.ends_at and shift.starts_at < self.ends_at


@dataclass(frozen=True, slots=True)
class Employee:
    """Un salarié, désigné par son identifiant seulement."""

    id: UUID
    # Dernier jour de validité de chaque compétence détenue, inclus ; `None` : sans expiration.
    qualification_expiry: Mapping[UUID, date | None]
    weekly_minutes_min: int
    weekly_minutes_max: int
    unavailabilities: tuple[UnavailablePeriod, ...] = ()
    # Minutes d'absence valorisées de la semaine, retranchées du minimum (US-033).
    absence_minutes: int = 0

    @property
    def remaining_minutes_min(self) -> int:
        """Le minimum moins les absences, jamais négatif : convention du modèle, ni paie ni
        décompte légal."""
        return max(0, self.weekly_minutes_min - self.absence_minutes)

    def is_available_for(self, shift: Shift) -> bool:
        return not any(period.overlaps(shift) for period in self.unavailabilities)

    def is_qualified_for(self, shift: Shift) -> bool:
        """Toutes les compétences exigées, chacune encore valide le jour du shift."""
        for skill_id in shift.required_skill_ids:
            if skill_id not in self.qualification_expiry:
                return False
            expiry = self.qualification_expiry[skill_id]
            if expiry is not None and expiry < shift.day:
                return False
        return True


@dataclass(frozen=True, slots=True)
class Assignment:
    """Un salarié affecté à un shift."""

    shift_id: str
    employee_id: UUID


type Schedule = frozenset[Assignment]


@dataclass(frozen=True, slots=True)
class Week:
    """La semaine à planifier et les règles qui s'y appliquent."""

    shifts: tuple[Shift, ...]
    employees: tuple[Employee, ...]
    rules: tuple[SchedulingRule, ...]

    def shift(self, shift_id: str) -> Shift:
        for shift in self.shifts:
            if shift.id == shift_id:
                return shift
        msg = f"Shift inconnu : {shift_id}"
        raise KeyError(msg)

    def employee(self, employee_id: UUID) -> Employee:
        for employee in self.employees:
            if employee.id == employee_id:
                return employee
        msg = f"Salarié inconnu : {employee_id}"
        raise KeyError(msg)


def shifts_of(week: Week, schedule: Schedule, employee_id: UUID) -> list[Shift]:
    """Les shifts tenus par ce salarié dans le planning, par ordre de début."""
    shifts = [
        week.shift(assignment.shift_id)
        for assignment in schedule
        if assignment.employee_id == employee_id
    ]
    return sorted(shifts, key=lambda shift: shift.starts_at)
