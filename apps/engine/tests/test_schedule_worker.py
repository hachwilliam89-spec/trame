"""Worker de génération (jalon 1, PR 5b) : rapports versionnés, refus, retours en file."""

import json
import threading
import time
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from threading import Event
from uuid import UUID

import pytest

from trame_engine.contracts import ScheduleReportedV1, ScheduleRequestedV1, ScheduleTopologyV1
from trame_engine.solver.scheduling import (
    ScheduleOutcome,
    SolveParameters,
    Week,
    read_week,
    solve_week,
)
from trame_engine.worker.background import run_in_background
from trame_engine.worker.schedule import MAX_REQUEST_BYTES, handle_schedule_request, run_schedule
from trame_engine.worker.serve import with_worker_cap

ROOT = Path(__file__).resolve().parents[3]
REQUEST = (
    ROOT / "libs/shared/contracts/fixtures/ScheduleRequestedV1/valid/semaine-de-demonstration.json"
)


class FixedClock:
    def now(self) -> datetime:
        return datetime(2026, 11, 16, 20, tzinfo=UTC)


def next_id() -> UUID:
    return UUID("0190f0a0-0000-7000-8000-000000000099")


def solve(week: Week, parameters: SolveParameters) -> ScheduleOutcome | None:
    return solve_week(week, parameters)


class RecordingDelivery:
    def __init__(self) -> None:
        self.reports: list[ScheduleReportedV1] = []
        self.outcome = "en cours"

    def publish(self, report: ScheduleReportedV1) -> None:
        self.reports.append(report)

    def acknowledge(self) -> None:
        self.outcome = "acquittée"

    def reject(self, *, requeue: bool) -> None:
        self.outcome = "rejetée, remise en file" if requeue else "rejetée"

    def return_to_queue(self) -> None:
        self.outcome = "rendue sans échec"


def request_body(change: Mapping[str, object] | None = None) -> bytes:
    """La demande de la fixture, sans minimum contractuel : un planning existe."""
    message = json.loads(REQUEST.read_text(encoding="utf-8"))
    problem = message["payload"]["problem"]
    for employee in problem["employees"]:
        employee["contract"]["weeklyMinutesMin"] = 0
    for key, value in (change or {}).items():
        problem[key] = value
    return json.dumps(message).encode()


def kinds(delivery: RecordingDelivery) -> list[str]:
    return [report.payload.report.kind for report in delivery.reports]


def test_annonce_le_depart_puis_rend_le_planning_et_ses_manques() -> None:
    request = ScheduleRequestedV1.model_validate_json(request_body())

    reports = list(run_schedule(request, FixedClock(), next_id, solve))

    assert [report.payload.report.kind for report in reports] == ["STARTED", "RESULT"]
    result = reports[1].model_dump(by_alias=True, mode="json")["payload"]["report"]
    assert result["outcome"]["result"]["status"] == "OPTIMAL"
    assert result["outcome"]["checkedRules"][0] == "HABILITATION_REQUISE"
    shortfalls = result["outcome"]["result"]["schedule"]["shortfalls"]
    assert {(gap["shiftId"], gap["requiredCount"], gap["assignedCount"]) for gap in shortfalls} <= {
        ("2026-11-23/matin/cariste", 2, 1),
        ("2026-11-23/apres-midi/cariste", 1, 0),
    }
    assert reports[1].payload.request_id == request.id


def test_sans_planning_legal_le_resultat_n_invente_aucun_planning() -> None:
    impossible_minimum = {
        "employees": [
            {
                "id": "0190f0a0-0000-7000-8000-000000000041",
                "qualifications": [],
                "contract": {"weeklyMinutesMin": 2100, "weeklyMinutesMax": 2100},
            }
        ]
    }
    request = ScheduleRequestedV1.model_validate_json(request_body(impossible_minimum))

    reports = list(run_schedule(request, FixedClock(), next_id, solve))

    result = reports[1].model_dump(by_alias=True, mode="json")["payload"]["report"]["outcome"]
    assert result["result"] == {"status": "INFEASIBLE", "schedule": None}


def test_un_probleme_incoherent_echoue_en_invalid_model_sans_calcul() -> None:
    shift = json.loads(REQUEST.read_text(encoding="utf-8"))["payload"]["problem"]["shifts"][0]
    request = ScheduleRequestedV1.model_validate_json(request_body({"shifts": [shift, shift]}))

    reports = list(run_schedule(request, FixedClock(), next_id, solve))

    failure = reports[-1].model_dump(by_alias=True, mode="json")["payload"]["report"]
    assert failure == {"kind": "FAILED", "code": "INVALID_MODEL"}


def test_acquitte_apres_le_depart_et_le_resultat_publies() -> None:
    delivery = RecordingDelivery()

    handle_schedule_request(request_body(), delivery, FixedClock(), next_id, solve)

    assert kinds(delivery) == ["STARTED", "RESULT"]
    assert delivery.outcome == "acquittée"


@pytest.mark.parametrize("body", [b"{", b"x" * (MAX_REQUEST_BYTES + 1), b'{"type":"autre"}'])
def test_ecarte_un_message_illisible_ou_trop_gros_sans_nouvelle_tentative(body: bytes) -> None:
    delivery = RecordingDelivery()

    handle_schedule_request(body, delivery, FixedClock(), next_id, solve)

    assert delivery.reports == []
    assert delivery.outcome == "rejetée"


def test_un_calcul_interrompu_rend_la_demande_sans_la_compter_comme_un_echec() -> None:
    delivery = RecordingDelivery()

    def interrupted(_week: Week, _parameters: SolveParameters) -> ScheduleOutcome | None:
        return None

    handle_schedule_request(request_body(), delivery, FixedClock(), next_id, interrupted)

    assert kinds(delivery) == ["STARTED"]
    assert delivery.outcome == "rendue sans échec"


def test_une_erreur_inattendue_est_retentee_comme_un_echec() -> None:
    delivery = RecordingDelivery()

    def broken(_week: Week, _parameters: SolveParameters) -> ScheduleOutcome | None:
        raise RuntimeError("panne")

    handle_schedule_request(request_body(), delivery, FixedClock(), next_id, broken)

    assert delivery.outcome == "rejetée, remise en file"


def test_le_calcul_tourne_a_part_pendant_que_la_connexion_reste_servie() -> None:
    threads: list[int] = []
    pumped: list[int] = []

    def compute() -> str:
        threads.append(threading.get_ident())
        time.sleep(0.3)
        return "fini"

    def pump() -> None:
        pumped.append(threading.get_ident())
        time.sleep(0.02)

    result = run_in_background(compute, pump, Event(), interrupt=lambda: None)

    assert result == "fini"
    assert threads[0] != threading.get_ident()
    assert len(pumped) > 3
    assert set(pumped) == {threading.get_ident()}


def test_un_arret_interrompt_le_calcul_et_ne_rend_aucun_resultat() -> None:
    stop = Event()
    interrupted = Event()

    def compute() -> str:
        interrupted.wait(5)
        return "trop tard"

    def pump() -> None:
        stop.set()
        time.sleep(0.01)

    result = run_in_background(compute, pump, stop, interrupt=interrupted.set)

    assert result is None
    assert interrupted.is_set()


def test_la_topologie_de_la_generation_est_conforme_et_separee_du_diagnostic() -> None:
    topology = ScheduleTopologyV1.model_validate_json(
        (ROOT / "infra/rabbitmq/schedule-topology.json").read_bytes()
    )

    names = [topology.requests.name, topology.reports.name, topology.dead_letters.name]
    assert topology.exchange == "trame.schedule.v1"
    assert all(name.startswith("trame.schedule.") for name in names)


def test_une_connexion_perdue_interrompt_le_calcul_avant_de_remonter_l_erreur() -> None:
    interrupted = Event()

    def compute() -> str:
        interrupted.wait(5)
        return "trop tard"

    def pump() -> None:
        raise ConnectionError

    started = time.monotonic()
    with pytest.raises(ConnectionError):
        run_in_background(compute, pump, Event(), interrupt=interrupted.set)

    assert interrupted.is_set()
    assert time.monotonic() - started < 2


def test_le_plafond_de_workers_de_l_environnement_borne_la_demande() -> None:
    received: list[SolveParameters] = []

    def record(week: Week, parameters: SolveParameters, _cancel: Event) -> ScheduleOutcome:
        received.append(parameters)
        return solve_week(week, parameters)

    request = ScheduleRequestedV1.model_validate_json(request_body())
    week = read_week(request.payload.problem)
    capped = with_worker_cap(record, max_workers=1)

    capped(week, SolveParameters(time_limit_seconds=5, workers=4, seed=0), Event())
    capped(week, SolveParameters(time_limit_seconds=5, workers=1, seed=7), Event())

    assert received == [
        SolveParameters(time_limit_seconds=5, workers=1, seed=0),
        SolveParameters(time_limit_seconds=5, workers=1, seed=7),
    ]
