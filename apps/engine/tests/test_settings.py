import pytest
from pydantic import ValidationError

from trame_engine.settings import EngineSettings


def test_valeurs_par_defaut() -> None:
    settings = EngineSettings()

    assert settings.port == 8000
    assert settings.max_workers == 4


def test_lit_les_variables_prefixees(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENGINE_PORT", "9100")
    monkeypatch.setenv("ENGINE_MAX_WORKERS", "1")

    settings = EngineSettings()

    assert settings.port == 9100
    assert settings.max_workers == 1


@pytest.mark.parametrize(
    ("variable", "valeur"),
    [("ENGINE_PORT", "0"), ("ENGINE_MAX_WORKERS", "16"), ("ENGINE_LOG_LEVEL", "bavard")],
)
def test_une_valeur_invalide_bloque_le_demarrage(
    monkeypatch: pytest.MonkeyPatch, variable: str, valeur: str
) -> None:
    monkeypatch.setenv(variable, valeur)

    with pytest.raises(ValidationError):
        EngineSettings()
