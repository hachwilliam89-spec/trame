"""Worker de génération contre un vrai RabbitMQ 4.3 (PR 5b).

Un calcul plus long que deux battements de cœur garde sa connexion, un diagnostic attend la fin
d'une génération, et un arrêt pendant un calcul rend les demandes sans compter d'échec.
"""

import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from threading import Event, Thread

from tests_integration.api_side import ApiSide, ReceivedReport
from trame_engine.contracts import DiagnosticTopologyV1, ScheduleTopologyV1
from trame_engine.solver.scheduling import ScheduleOutcome, SolveParameters, Week, solve_week
from trame_engine.worker.serve import WeekSolver, consume
from trame_engine.worker.stream import WorkerTopologies

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "libs/shared/contracts/fixtures"
SCHEDULE_REQUEST = FIXTURES / "ScheduleRequestedV1/valid/semaine-de-demonstration.json"
DIAGNOSTIC_REQUEST = FIXTURES / "DiagnosticRequestedV1/valid/request.json"
# Battement de cœur du worker : 30 s. RabbitMQ coupe une connexion muette après deux battements.
LONGER_THAN_TWO_HEARTBEATS_S = 70

TOPOLOGIES = WorkerTopologies(
    diagnostic=DiagnosticTopologyV1.model_validate_json(
        (ROOT / "infra/rabbitmq/diagnostic-topology.json").read_bytes()
    ),
    schedule=ScheduleTopologyV1.model_validate_json(
        (ROOT / "infra/rabbitmq/schedule-topology.json").read_bytes()
    ),
)


@dataclass(frozen=True, slots=True)
class WorkerRun:
    reports: list[ReceivedReport]
    stopped_within_s: float


def slow_solver(seconds: float) -> WeekSolver:
    def solve(week: Week, parameters: SolveParameters, cancel: Event) -> ScheduleOutcome:
        cancel.wait(seconds)
        return solve_week(week, parameters, cancel)

    return solve


def run_worker_with(
    amqp_url: str, scenario: Callable[[ApiSide], None], solve_schedule: WeekSolver
) -> WorkerRun:
    """Le worker tourne dans le thread principal, comme en production ; l'API dans un autre."""
    stop = Event()
    failures: list[BaseException] = []
    reports: list[ReceivedReport] = []
    stop_requested_at: list[float] = []

    def play_api() -> None:
        try:
            api = ApiSide(amqp_url, TOPOLOGIES)
            api.listen_to_reports(TOPOLOGIES)
            scenario(api)
            reports.extend(api.reports)
            api.close()
        except BaseException as error:
            failures.append(error)
        finally:
            stop_requested_at.append(time.monotonic())
            stop.set()

    api_thread = Thread(target=play_api)
    api_thread.start()
    consume(amqp_url, TOPOLOGIES, stop, solve_schedule)
    stopped_within_s = time.monotonic() - stop_requested_at[0]
    api_thread.join(timeout=10)
    if failures:
        raise failures[0]
    return WorkerRun(reports, stopped_within_s)


def reports_of(run: WorkerRun, queue: str) -> list[ReceivedReport]:
    return [report for report in run.reports if report.queue == queue]


def test_un_long_calcul_garde_sa_connexion_et_un_diagnostic_attend_la_generation(
    amqp_url: str,
) -> None:
    schedule, diagnostic = TOPOLOGIES.schedule, TOPOLOGIES.diagnostic

    def scenario(api: ApiSide) -> None:
        api.request(schedule, SCHEDULE_REQUEST.read_bytes())
        api.wait_until(lambda: api.has_report(schedule, "STARTED"), timeout_s=30)
        api.request(diagnostic, DIAGNOSTIC_REQUEST.read_bytes())
        api.wait_until(lambda: api.has_report(diagnostic, "RESULT"), timeout_s=150)

    run = run_worker_with(amqp_url, scenario, slow_solver(LONGER_THAN_TWO_HEARTBEATS_S))

    generation = reports_of(run, schedule.reports.name)
    assert [report.kind for report in generation] == ["STARTED", "RESULT"]
    assert generation[1].received_at - generation[0].received_at > 65
    first_diagnostic_report = reports_of(run, diagnostic.reports.name)[0]
    assert first_diagnostic_report.kind == "STARTED"
    assert first_diagnostic_report.received_at > generation[1].received_at


def test_un_arret_pendant_le_calcul_rend_les_demandes_sans_compter_d_echec(amqp_url: str) -> None:
    schedule, diagnostic = TOPOLOGIES.schedule, TOPOLOGIES.diagnostic

    def scenario(api: ApiSide) -> None:
        api.request(schedule, SCHEDULE_REQUEST.read_bytes())
        api.wait_until(lambda: api.has_report(schedule, "STARTED"), timeout_s=30)
        api.request(diagnostic, DIAGNOSTIC_REQUEST.read_bytes())
        # Livré au worker, qui le garde en attente derrière la génération.
        api.wait_until(lambda: api.waiting_requests(diagnostic) == 0, timeout_s=10)

    run = run_worker_with(amqp_url, scenario, slow_solver(LONGER_THAN_TWO_HEARTBEATS_S))

    assert run.stopped_within_s < 10
    assert [report.kind for report in reports_of(run, schedule.reports.name)] == ["STARTED"]
    api = ApiSide(amqp_url, TOPOLOGIES)
    try:
        returned_generation = api.take_request(schedule)
        returned_diagnostic = api.take_request(diagnostic)
    finally:
        api.close()
    assert returned_generation.redelivered
    assert returned_generation.delivery_count == 0
    assert returned_diagnostic.redelivered
    assert returned_diagnostic.delivery_count == 0
