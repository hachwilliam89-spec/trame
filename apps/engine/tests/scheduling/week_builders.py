"""Monteurs de semaines de test, au format du contrat `SchedulingProblemV1` (jalon 1, issue #69).

Une semaine commence le lundi 23 novembre 2026, à Paris. Les créneaux du jeu de démo :
matin de 06:00 à 13:20 et après-midi de 13:30 à 20:50, chacun de 7 h effectives (pause de 20 min).
"""

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from trame_engine import contracts

PARIS = ZoneInfo("Europe/Paris")
MONDAY = date(2026, 11, 23)
CACES_3 = UUID("0190f0a0-0000-7000-8000-000000000031")
CACES_1A = UUID("0190f0a0-0000-7000-8000-000000000032")
SEVEN_HOURS = 420

MORNING = (time(6, 0), time(13, 20))
AFTERNOON = (time(13, 30), time(20, 50))

DEFAULT_RULES: list[dict[str, Any]] = [
    {"id": "HABILITATION_REQUISE"},
    {"id": "UN_SEUL_SHIFT"},
    {"id": "REPOS_QUOTIDIEN_MIN", "minimumMinutes": 660},
    {"id": "DUREE_QUOTIDIENNE_MAX", "maximumMinutes": 600},
    {"id": "DUREE_HEBDOMADAIRE_MAX", "maximumMinutes": 2880},
    {"id": "VOLUME_CONTRACTUEL"},
]


def local_instant(day: date, moment: time) -> str:
    """Instant ISO 8601 avec le décalage de Paris ce jour-là (heure d'été comprise)."""
    return datetime.combine(day, moment, tzinfo=PARIS).isoformat()


@dataclass
class WeekBuilder:
    """Construit un problème de planification, shift par shift et salarié par salarié."""

    shifts: list[dict[str, Any]] = field(default_factory=list)
    employees: list[dict[str, Any]] = field(default_factory=list)
    rules: list[dict[str, Any]] = field(default_factory=lambda: list(DEFAULT_RULES))
    week_starts_on: date = MONDAY

    def shift(
        self,
        shift_id: str,
        day: date,
        hours: tuple[time, time],
        *,
        need: tuple[tuple[UUID, ...], int] = ((CACES_3,), 1),
    ) -> WeekBuilder:
        """Un shift de 7 h effectives ; `need` : compétences exigées et nombre de personnes."""
        skills, required = need
        starts, ends = hours
        end_day = day + timedelta(days=1) if ends <= starts else day
        self.shifts.append(
            {
                "id": shift_id,
                "date": day.isoformat(),
                "shiftTemplateId": str(uuid4()),
                "positionId": str(uuid4()),
                "startsAt": local_instant(day, starts),
                "endsAt": local_instant(end_day, ends),
                "effectiveMinutes": SEVEN_HOURS,
                "requiredSkillIds": [str(skill) for skill in skills],
                "requiredCount": required,
            }
        )
        return self

    def employee(
        self,
        employee_id: UUID,
        qualifications: dict[UUID, date | None] | None = None,
        weekly_minutes: tuple[int, int] = (0, 2100),
    ) -> WeekBuilder:
        held = qualifications if qualifications is not None else {CACES_3: None}
        minimum, maximum = weekly_minutes
        self.employees.append(
            {
                "id": str(employee_id),
                "qualifications": [
                    {"skillId": str(skill), "expiresOn": None if expiry is None else str(expiry)}
                    for skill, expiry in held.items()
                ],
                "contract": {"weeklyMinutesMin": minimum, "weeklyMinutesMax": maximum},
            }
        )
        return self

    def build(self) -> contracts.SchedulingProblemV1:
        return contracts.SchedulingProblemV1.model_validate(
            {
                "weekStartsOn": self.week_starts_on.isoformat(),
                "timeZone": "Europe/Paris",
                "shifts": self.shifts,
                "employees": self.employees,
                "rules": self.rules,
                "objective": {"mode": "STANDARD"},
            }
        )


def day_of_week(index: int) -> date:
    """Jour de la semaine de test : 0 pour lundi, 5 pour samedi."""
    return MONDAY + timedelta(days=index)
