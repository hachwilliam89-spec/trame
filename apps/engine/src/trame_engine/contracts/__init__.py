# GÉNÉRÉ par `pnpm nx run contracts:generate` (ADR-0018). Ne pas éditer.

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, RootModel


class TrameEngineContracts(RootModel[Any]):
    root: Annotated[Any, Field(title="TrameEngineContracts")]


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
