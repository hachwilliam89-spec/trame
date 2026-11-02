from importlib.metadata import version

from fastapi.testclient import TestClient

from trame_engine import __version__ as engine_version
from trame_engine.api.app import create_app
from trame_engine.contracts import EngineHealthV1


def test_health_respecte_le_contrat_engine_health_v1() -> None:
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "status": "ok",
        "engineVersion": engine_version,
        "ortoolsVersion": version("ortools"),
    }
    assert EngineHealthV1.model_validate(body).status == "ok"
