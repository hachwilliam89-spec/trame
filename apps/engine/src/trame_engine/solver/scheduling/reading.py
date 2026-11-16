"""Lecture du contrat `SchedulingProblemV1` : la semaine, ses règles, et ce que le contrat ne
peut pas vérifier seul (identifiants uniques, fin après début, minimum ≤ maximum).
"""

from collections import Counter
from collections.abc import Iterable

from trame_engine import contracts
from trame_engine.solver.scheduling.rules.base import SchedulingRule
from trame_engine.solver.scheduling.rules.contractual_volume import ContractualVolume
from trame_engine.solver.scheduling.rules.maximum_daily_duration import MaximumDailyDuration
from trame_engine.solver.scheduling.rules.maximum_weekly_duration import MaximumWeeklyDuration
from trame_engine.solver.scheduling.rules.minimum_daily_rest import MinimumDailyRest
from trame_engine.solver.scheduling.rules.required_qualification import RequiredQualification
from trame_engine.solver.scheduling.rules.single_shift import SingleShift
from trame_engine.solver.scheduling.week import Employee, InvalidProblemError, Shift, Week

type ContractRule = (
    contracts.RequiredQualificationRuleV1
    | contracts.SingleShiftRuleV1
    | contracts.MinimumDailyRestRuleV1
    | contracts.MaximumDailyDurationRuleV1
    | contracts.MaximumWeeklyDurationRuleV1
    | contracts.ContractualVolumeRuleV1
)


def read_week(problem: contracts.SchedulingProblemV1) -> Week:
    """La semaine prête à résoudre, ou `InvalidProblemError` si le problème est incohérent."""
    shifts = tuple(_read_shift(shift) for shift in problem.shifts)
    employees = tuple(_read_employee(employee) for employee in problem.employees)
    rules = tuple(_read_rule(rule) for rule in problem.rules)
    _ensure_unique("shift", (shift.id for shift in shifts))
    _ensure_unique("salarié", (str(employee.id) for employee in employees))
    _ensure_unique("règle", (rule.rule_id for rule in rules))
    return Week(shifts=shifts, employees=employees, rules=rules)


def _read_shift(shift: contracts.Shift) -> Shift:
    if shift.ends_at <= shift.starts_at:
        msg = f"Le shift {shift.id} finit avant de commencer."
        raise InvalidProblemError(msg)
    return Shift(
        id=shift.id,
        day=shift.date,
        starts_at=shift.starts_at,
        ends_at=shift.ends_at,
        effective_minutes=shift.effective_minutes,
        required_skill_ids=frozenset(skill.root for skill in shift.required_skill_ids),
        required_count=shift.required_count,
    )


def _read_employee(employee: contracts.Employee) -> Employee:
    contract = employee.contract
    if contract.weekly_minutes_min > contract.weekly_minutes_max:
        msg = f"Le contrat du salarié {employee.id} a un minimum supérieur à son maximum."
        raise InvalidProblemError(msg)
    expiry = {
        qualification.skill_id: (
            None if qualification.expires_on is None else qualification.expires_on.root
        )
        for qualification in employee.qualifications
    }
    return Employee(
        id=employee.id,
        qualification_expiry=expiry,
        weekly_minutes_min=contract.weekly_minutes_min,
        weekly_minutes_max=contract.weekly_minutes_max,
    )


def _read_rule(rule: ContractRule) -> SchedulingRule:
    match rule:
        case contracts.RequiredQualificationRuleV1():
            return RequiredQualification()
        case contracts.SingleShiftRuleV1():
            return SingleShift()
        case contracts.MinimumDailyRestRuleV1(minimum_minutes=minutes):
            return MinimumDailyRest(minimum_minutes=minutes)
        case contracts.MaximumDailyDurationRuleV1(maximum_minutes=minutes):
            return MaximumDailyDuration(maximum_minutes=minutes)
        case contracts.MaximumWeeklyDurationRuleV1(maximum_minutes=minutes):
            return MaximumWeeklyDuration(maximum_minutes=minutes)
        case contracts.ContractualVolumeRuleV1():
            return ContractualVolume()


def _ensure_unique(kind: str, identifiers: Iterable[str]) -> None:
    duplicates = sorted(
        identifier for identifier, count in Counter(identifiers).items() if count > 1
    )
    if duplicates:
        msg = f"Identifiant de {kind} en double : {', '.join(duplicates)}."
        raise InvalidProblemError(msg)
