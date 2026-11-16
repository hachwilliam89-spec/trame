"""Configuration du worker : pas d'URL ni de droits PostgreSQL."""

from pathlib import Path

from pydantic import AmqpDsn, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class WorkerSettings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", frozen=True)
    amqp_url: AmqpDsn = Field(validation_alias="AMQP_URL")
    topology_file: Path = Field(
        default=Path("../../infra/rabbitmq/diagnostic-topology.json"),
        validation_alias="DIAGNOSTIC_TOPOLOGY_FILE",
    )
    schedule_topology_file: Path = Field(
        default=Path("../../infra/rabbitmq/schedule-topology.json"),
        validation_alias="SCHEDULE_TOPOLOGY_FILE",
    )
    # Plafond de workers CP-SAT d'une génération (cadrage §12 : 4 en prod, 1 en staging).
    max_workers: int = Field(default=4, ge=1, le=8, validation_alias="ENGINE_MAX_WORKERS")
