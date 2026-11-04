# GÉNÉRÉ par `pnpm nx run contracts:generate` (ADR-0018). Ne pas éditer.

from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, RootModel


class TrameEngineContracts(RootModel[Any]):
    root: Annotated[Any, Field(title="TrameEngineContracts")]


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
