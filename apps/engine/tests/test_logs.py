import json
import logging
from collections.abc import Iterator

import pytest
import structlog

from trame_engine.logs import UVICORN_LOGGERS, configure_logging


@pytest.fixture(autouse=True)
def _restaure_la_configuration_des_logs() -> Iterator[None]:
    root = logging.getLogger()
    handlers, level = root.handlers[:], root.level
    yield
    root.handlers[:] = handlers
    root.setLevel(level)
    structlog.reset_defaults()


def _json_lines(output: str) -> list[dict[str, object]]:
    return [json.loads(line) for line in output.splitlines() if line.strip()]


def test_les_logs_d_uvicorn_sortent_en_json(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging("info", json=True)

    logging.getLogger("uvicorn.error").info("Started server process [%d]", 42)

    [entry] = _json_lines(capsys.readouterr().err)
    assert entry["event"] == "Started server process [42]"
    assert entry["logger"] == "uvicorn.error"
    assert entry["level"] == "info"
    assert "timestamp" in entry


def test_les_logs_structlog_sortent_au_meme_format(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging("info", json=True)

    structlog.get_logger("trame_engine.solver").info("resolution_terminee", statut="OPTIMAL")

    [entry] = _json_lines(capsys.readouterr().err)
    assert entry["event"] == "resolution_terminee"
    assert entry["statut"] == "OPTIMAL"
    assert entry["level"] == "info"


def test_le_niveau_filtre_les_deux_sources(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging("warning", json=True)

    logging.getLogger("uvicorn.error").info("ignoré")
    structlog.get_logger().info("ignoré")
    logging.getLogger("uvicorn.error").warning("conservé")

    assert [entry["event"] for entry in _json_lines(capsys.readouterr().err)] == ["conservé"]


def test_uvicorn_n_a_plus_de_handler_propre() -> None:
    configure_logging("info", json=True)

    for name in UVICORN_LOGGERS:
        assert logging.getLogger(name).handlers == []
        assert logging.getLogger(name).propagate is True
