"""Point d'entrée : `uv run python -m trame_engine`."""

import uvicorn

from trame_engine.api.app import create_app
from trame_engine.logs import configure_logging
from trame_engine.settings import EngineSettings


def main() -> None:
    settings = EngineSettings()
    configure_logging(settings.log_level, json=settings.log_json)
    uvicorn.run(
        create_app(),
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
        access_log=False,
    )


if __name__ == "__main__":
    main()
