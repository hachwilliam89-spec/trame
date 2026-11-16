# GÉNÉRÉ par `pnpm nx run contracts:generate` (ADR-0018). Ne pas éditer.

from datetime import date as date_aliased
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, RootModel


class TrameEngineContracts(RootModel[Any]):
    root: Annotated[Any, Field(title="TrameEngineContracts")]


class ContractualVolumeRuleV1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    id: Literal["VOLUME_CONTRACTUEL"]


class Report(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    kind: Literal["STARTED"]


class AssignmentItem(RootModel[int]):
    root: Annotated[int, Field(ge=0, le=2)]


class Solution(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    cost: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]
    assignment: Annotated[list[AssignmentItem], Field(max_length=3, min_length=3)]


class Result(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    status: Literal["OPTIMAL"]
    solution: Solution


class Solution1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    cost: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]
    assignment: Annotated[list[AssignmentItem], Field(max_length=3, min_length=3)]


class Result1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    status: Literal["FEASIBLE"]
    solution: Solution1


class Result2(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    status: Literal["INFEASIBLE"]
    solution: None


class Result3(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    status: Literal["UNKNOWN"]
    solution: None


class Solution2(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    cost: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]
    assignment: Annotated[list[AssignmentItem], Field(max_length=3, min_length=3)]


class Result4(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    status: Literal["CANCELLED"]
    solution: Solution2 | None


class CostItem(RootModel[int]):
    root: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]


class Cost(RootModel[list[CostItem]]):
    root: Annotated[list[CostItem], Field(max_length=3, min_length=3)]


class Problem(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    name: Literal["assignment-smoke-v1"]
    costs: Annotated[list[Cost], Field(max_length=3, min_length=3)]


class Parameters(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    workers: Literal[1]
    seed: Literal[0]
    time_limit_seconds: Annotated[Literal[5], Field(alias="timeLimitSeconds")]


class Outcome(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    result: Result | Result1 | Result2 | Result3 | Result4
    problem: Problem
    parameters: Parameters


class Report1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    kind: Literal["RESULT"]
    outcome: Outcome


class Report2(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    kind: Literal["FAILED"]
    code: Literal["INVALID_MODEL", "PROCESSING_FAILED", "RETRIES_EXHAUSTED"]


class Payload(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    run_id: Annotated[UUID, Field(alias="runId")]
    request_id: Annotated[UUID, Field(alias="requestId")]
    report: Report | Report1 | Report2


class DiagnosticReportedV1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    id: UUID
    organization_id: Annotated[UUID, Field(alias="organizationId")]
    type: Literal["scheduling.diagnostic-reported.v1"]
    occurred_at: Annotated[AwareDatetime, Field(alias="occurredAt")]
    payload: Payload


class Payload1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    run_id: Annotated[UUID, Field(alias="runId")]
    problem: Literal["assignment-smoke-v1"]


class DiagnosticRequestedV1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    id: UUID
    organization_id: Annotated[UUID, Field(alias="organizationId")]
    type: Literal["scheduling.diagnostic-requested.v1"]
    occurred_at: Annotated[AwareDatetime, Field(alias="occurredAt")]
    payload: Payload1


class Arguments(RootModel[int]):
    root: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]


class Requests(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    name: Annotated[str, Field(min_length=1)]
    routing_key: Annotated[str, Field(alias="routingKey", min_length=1)]
    arguments: dict[str, str | Arguments | bool]


class Reports(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    name: Annotated[str, Field(min_length=1)]
    routing_key: Annotated[str, Field(alias="routingKey", min_length=1)]
    arguments: dict[str, str | Arguments | bool]


class DeadLetters(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    name: Annotated[str, Field(min_length=1)]
    routing_key: Annotated[str, Field(alias="routingKey", min_length=1)]
    arguments: dict[str, str | Arguments | bool]


class Parking(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    name: Annotated[str, Field(min_length=1)]
    routing_key: Annotated[str, Field(alias="routingKey", min_length=1)]
    arguments: dict[str, str | Arguments | bool]


class DiagnosticTopologyV1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    exchange: Annotated[str, Field(min_length=1)]
    requests: Requests
    reports: Reports
    dead_letters: Annotated[DeadLetters, Field(alias="deadLetters")]
    parking: Parking


class EngineHealthV1(BaseModel):
    """
    État du moteur d'optimisation.
    """

    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    status: Literal["ok"]
    engine_version: Annotated[str, Field(alias="engineVersion", min_length=1)]
    ortools_version: Annotated[str, Field(alias="ortoolsVersion", pattern="^\\d+\\.\\d+\\.\\d+$")]


class MaximumDailyDurationRuleV1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    id: Literal["DUREE_QUOTIDIENNE_MAX"]
    maximum_minutes: Annotated[int, Field(alias="maximumMinutes", ge=1, le=1440)]


class MaximumWeeklyDurationRuleV1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    id: Literal["DUREE_HEBDOMADAIRE_MAX"]
    maximum_minutes: Annotated[int, Field(alias="maximumMinutes", ge=1, le=10080)]


class MinimumDailyRestRuleV1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    id: Literal["REPOS_QUOTIDIEN_MIN"]
    minimum_minutes: Annotated[int, Field(alias="minimumMinutes", ge=1, le=1440)]


class RequiredQualificationRuleV1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    id: Literal["HABILITATION_REQUISE"]


class Report3(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    kind: Literal["STARTED"]


class Assignment(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    shift_id: Annotated[str, Field(alias="shiftId", max_length=100, min_length=1)]
    employee_id: Annotated[UUID, Field(alias="employeeId")]


class Shortfall(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    shift_id: Annotated[str, Field(alias="shiftId", max_length=100, min_length=1)]
    required_count: Annotated[int, Field(alias="requiredCount", ge=1, le=999)]
    assigned_count: Annotated[int, Field(alias="assignedCount", ge=0, le=998)]


class Schedule(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    assignments: list[Assignment]
    shortfalls: list[Shortfall]


class Result5(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    status: Literal["OPTIMAL"]
    schedule: Schedule


class Schedule1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    assignments: list[Assignment]
    shortfalls: list[Shortfall]


class Result6(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    status: Literal["FEASIBLE"]
    schedule: Schedule1


class Result7(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    status: Literal["INFEASIBLE"]
    schedule: None


class Result8(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    status: Literal["UNKNOWN"]
    schedule: None


class Schedule2(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    assignments: list[Assignment]
    shortfalls: list[Shortfall]


class Result9(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    status: Literal["CANCELLED"]
    schedule: Schedule2 | None


class Outcome1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    result: Result5 | Result6 | Result7 | Result8 | Result9
    checked_rules: Annotated[
        list[
            Literal[
                "HABILITATION_REQUISE",
                "UN_SEUL_SHIFT",
                "REPOS_QUOTIDIEN_MIN",
                "DUREE_QUOTIDIENNE_MAX",
                "DUREE_HEBDOMADAIRE_MAX",
                "VOLUME_CONTRACTUEL",
            ]
        ],
        Field(alias="checkedRules", min_length=1),
    ]
    solve_seconds: Annotated[float, Field(alias="solveSeconds", ge=0.0)]


class Report4(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    kind: Literal["RESULT"]
    outcome: Outcome1


class Report5(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    kind: Literal["FAILED"]
    code: Literal["INVALID_MODEL", "PROCESSING_FAILED", "RETRIES_EXHAUSTED"]


class Payload2(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    generation_id: Annotated[UUID, Field(alias="generationId")]
    request_id: Annotated[UUID, Field(alias="requestId")]
    report: Report3 | Report4 | Report5


class ScheduleReportedV1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    id: UUID
    organization_id: Annotated[UUID, Field(alias="organizationId")]
    type: Literal["scheduling.schedule-reported.v1"]
    occurred_at: Annotated[AwareDatetime, Field(alias="occurredAt")]
    payload: Payload2


class Parameters1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    time_limit_seconds: Annotated[int, Field(alias="timeLimitSeconds", ge=1, le=300)]
    workers: Annotated[int, Field(ge=1, le=8)]
    seed: Annotated[int, Field(ge=0, le=2147483647)]


class RequiredSkillId(RootModel[UUID]):
    root: UUID


class Shift(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    id: Annotated[str, Field(max_length=100, min_length=1)]
    date: date_aliased
    shift_template_id: Annotated[UUID, Field(alias="shiftTemplateId")]
    position_id: Annotated[UUID, Field(alias="positionId")]
    starts_at: Annotated[AwareDatetime, Field(alias="startsAt")]
    ends_at: Annotated[AwareDatetime, Field(alias="endsAt")]
    effective_minutes: Annotated[int, Field(alias="effectiveMinutes", ge=1, le=1440)]
    required_skill_ids: Annotated[
        list[RequiredSkillId], Field(alias="requiredSkillIds", max_length=20)
    ]
    required_count: Annotated[int, Field(alias="requiredCount", ge=1, le=999)]


class ExpiresOn(RootModel[date_aliased]):
    root: date_aliased


class Qualification(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    skill_id: Annotated[UUID, Field(alias="skillId")]
    expires_on: Annotated[ExpiresOn | None, Field(alias="expiresOn")]


class Contract(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    weekly_minutes_min: Annotated[int, Field(alias="weeklyMinutesMin", ge=0, le=10080)]
    weekly_minutes_max: Annotated[int, Field(alias="weeklyMinutesMax", ge=1, le=10080)]


class Employee(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    id: UUID
    qualifications: Annotated[list[Qualification], Field(max_length=50)]
    contract: Contract


class Objective(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    mode: Literal["STANDARD"]


class SingleShiftRuleV1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    id: Literal["UN_SEUL_SHIFT"]


class SchedulingProblemV1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    week_starts_on: Annotated[date_aliased, Field(alias="weekStartsOn")]
    time_zone: Annotated[str, Field(alias="timeZone", max_length=64, min_length=1)]
    shifts: Annotated[list[Shift], Field(max_length=2000)]
    employees: Annotated[list[Employee], Field(max_length=1000)]
    rules: Annotated[
        list[
            RequiredQualificationRuleV1
            | SingleShiftRuleV1
            | MinimumDailyRestRuleV1
            | MaximumDailyDurationRuleV1
            | MaximumWeeklyDurationRuleV1
            | ContractualVolumeRuleV1
        ],
        Field(max_length=20, min_length=1),
    ]
    objective: Objective


class Payload3(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    generation_id: Annotated[UUID, Field(alias="generationId")]
    problem: SchedulingProblemV1
    parameters: Parameters1


class ScheduleRequestedV1(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )
    id: UUID
    organization_id: Annotated[UUID, Field(alias="organizationId")]
    type: Literal["scheduling.schedule-requested.v1"]
    occurred_at: Annotated[AwareDatetime, Field(alias="occurredAt")]
    payload: Payload3
