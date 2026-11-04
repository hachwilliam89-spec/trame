# GÉNÉRÉ par `pnpm nx run contracts:generate` (ADR-0018). Ne pas éditer.

from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, RootModel


class TrameEngineContracts(RootModel[Any]):
    root: Annotated[Any, Field(title="TrameEngineContracts")]


class Payload(BaseModel):
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
    payload: Payload


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
