"""Isolation des tests : Nx injecte le `.env` de la racine dans chaque tâche."""

import os

import pytest


@pytest.fixture(autouse=True)
def _environnement_moteur_vierge(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in [name for name in os.environ if name.startswith("ENGINE_")]:
        monkeypatch.delenv(name)
