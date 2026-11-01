"""Configuration du moteur, validée au démarrage : une valeur invalide bloque le lancement."""

from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

type LogLevel = Literal["critical", "error", "warning", "info", "debug"]


class EngineSettings(BaseSettings):
    """Variables d'environnement préfixées par `ENGINE_`."""

    model_config = SettingsConfigDict(env_prefix="ENGINE_", extra="ignore", frozen=True)

    host: str = "127.0.0.1"
    port: int = Field(default=8000, ge=1, le=65535)
    log_level: LogLevel = "info"
    log_json: bool = True
    # Plafond de workers CP-SAT (cadrage §12 : 4 en prod, 1 en staging).
    max_workers: int = Field(default=4, ge=1, le=8)
