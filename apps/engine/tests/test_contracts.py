"""Tests de contrat côté moteur : les mêmes fixtures sont validées côté TypeScript (ADR-0018)."""

import json
from pathlib import Path

import pytest
from pydantic import BaseModel, ValidationError

from trame_engine import contracts

FIXTURES = Path(__file__).resolve().parents[3] / "libs" / "shared" / "contracts" / "fixtures"


def _cases(kind: str) -> list[tuple[str, Path]]:
    return [
        (contract_dir.name, fixture)
        for contract_dir in sorted(FIXTURES.iterdir())
        if contract_dir.is_dir()
        for fixture in sorted((contract_dir / kind).glob("*.json"))
    ]


def _model(name: str) -> type[BaseModel]:
    model = getattr(contracts, name)
    assert isinstance(model, type)
    assert issubclass(model, BaseModel)
    return model


def test_chaque_contrat_a_des_fixtures_valides_et_invalides() -> None:
    names = {name for name, _ in _cases("valid")} & {name for name, _ in _cases("invalid")}
    assert names, "Aucune fixture de contrat trouvée."


@pytest.mark.parametrize(("name", "fixture"), _cases("valid"), ids=str)
def test_fixture_valide_acceptee(name: str, fixture: Path) -> None:
    _model(name).model_validate(json.loads(fixture.read_text(encoding="utf-8")))


@pytest.mark.parametrize(("name", "fixture"), _cases("invalid"), ids=str)
def test_fixture_invalide_refusee(name: str, fixture: Path) -> None:
    with pytest.raises(ValidationError):
        _model(name).model_validate(json.loads(fixture.read_text(encoding="utf-8")))
