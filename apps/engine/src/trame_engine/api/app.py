"""Application FastAPI du moteur."""

from importlib.metadata import version

from fastapi import FastAPI

from trame_engine import __version__ as engine_version
from trame_engine.contracts import EngineHealthV1


def create_app() -> FastAPI:
    app = FastAPI(
        title="Trame — moteur d'optimisation",
        version=engine_version,
        docs_url=None,
        redoc_url=None,
    )

    @app.get("/health", response_model=EngineHealthV1)
    def health() -> EngineHealthV1:
        return EngineHealthV1(
            status="ok", engine_version=engine_version, ortools_version=version("ortools")
        )

    return app
