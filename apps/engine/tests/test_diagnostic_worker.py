import signal
import time
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import cast
from uuid import UUID

import pytest
from pika import BlockingConnection
from pika.adapters.blocking_connection import BlockingChannel
from pydantic import ValidationError

from trame_engine.contracts import DiagnosticReportedV1, DiagnosticRequestedV1, DiagnosticTopologyV1
from trame_engine.solver.smoke import AssignmentResult, SolveStatus
from trame_engine.worker.amqp import close_connection, publish_report
from trame_engine.worker.deadline import PublicationDeadlineExceededError, publication_deadline
from trame_engine.worker.diagnostic import run_diagnostic
from trame_engine.worker.handler import handle_request
from trame_engine.worker.settings import WorkerSettings

FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "libs/shared/contracts/fixtures/DiagnosticRequestedV1/valid/request.json"
)


class FixedClock:
    def now(self) -> datetime:
        return datetime(2026, 11, 4, 10, tzinfo=UTC)


def next_id() -> UUID:
    return UUID("0190f0a0-0000-7000-8000-000000000099")


def optimal(_costs: list[list[int]]) -> AssignmentResult:
    return AssignmentResult(SolveStatus.OPTIMAL, 5, (1, 0, 2))


class RecordingDelivery:
    def __init__(self, *, fail_publication: bool = False) -> None:
        self.reports: list[DiagnosticReportedV1] = []
        self.acknowledged = False
        self.requeued: bool | None = None
        self.fail_publication = fail_publication

    def publish(self, report: DiagnosticReportedV1) -> None:
        if self.fail_publication:
            raise OSError("publication incertaine")
        self.reports.append(report)

    def acknowledge(self) -> None:
        self.acknowledged = True

    def reject(self, *, requeue: bool) -> None:
        self.requeued = requeue


def test_annonce_le_depart_avant_de_calculer_et_conserve_le_resultat() -> None:
    request = DiagnosticRequestedV1.model_validate_json(FIXTURE.read_bytes())
    reports: Iterator[DiagnosticReportedV1] = run_diagnostic(
        request, FixedClock(), next_id, optimal
    )
    assert next(reports).payload.report.kind == "STARTED"
    finished = next(reports).payload.report
    assert finished.kind == "RESULT"
    assert finished.outcome.model_dump(mode="json", by_alias=True) == {
        "result": {"status": "OPTIMAL", "solution": {"cost": 5, "assignment": [1, 0, 2]}},
        "problem": {"name": "assignment-smoke-v1", "costs": [[4, 1, 3], [2, 0, 5], [3, 2, 2]]},
        "parameters": {"workers": 1, "seed": 0, "timeLimitSeconds": 5},
    }


@pytest.mark.parametrize("status", list(SolveStatus))
def test_traite_toutes_les_issues_natives_sans_inventer_de_solution(status: SolveStatus) -> None:
    request = DiagnosticRequestedV1.model_validate_json(FIXTURE.read_bytes())

    def solve(_costs: list[list[int]]) -> AssignmentResult:
        if status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}:
            return AssignmentResult(status, 5, (1, 0, 2))
        return AssignmentResult(status, None, ())

    report = list(run_diagnostic(request, FixedClock(), next_id, solve))[-1].payload.report
    if status is SolveStatus.MODEL_INVALID:
        assert report.kind == "FAILED"
        assert report.code == "INVALID_MODEL"
    else:
        assert report.kind == "RESULT"
        assert report.outcome.result.status == status.value
        if status in {SolveStatus.INFEASIBLE, SolveStatus.UNKNOWN}:
            assert report.outcome.result.solution is None


def test_acquitte_uniquement_apres_les_deux_publications_confirmees() -> None:
    delivery = RecordingDelivery()
    handle_request(FIXTURE.read_bytes(), delivery, FixedClock(), next_id, optimal)
    assert delivery.acknowledged
    assert [report.payload.report.kind for report in delivery.reports] == ["STARTED", "RESULT"]


def test_une_publication_inconnue_ne_perd_pas_la_demande() -> None:
    delivery = RecordingDelivery(fail_publication=True)
    handle_request(FIXTURE.read_bytes(), delivery, FixedClock(), next_id, optimal)
    assert not delivery.acknowledged
    assert delivery.requeued is True


@pytest.mark.parametrize("body", [b"{}", b"not-json", b" " * 65537])
def test_isole_les_messages_invalides_sans_fausse_attribution(body: bytes) -> None:
    delivery = RecordingDelivery()
    handle_request(body, delivery, FixedClock(), next_id, optimal)
    assert not delivery.acknowledged
    assert delivery.requeued is False
    assert not delivery.reports


def test_borne_vraiment_un_appel_bloquant_et_restaure_le_signal() -> None:

    previous = signal.getsignal(signal.SIGALRM)
    with pytest.raises(PublicationDeadlineExceededError), publication_deadline(0.01):
        time.sleep(0.1)
    assert signal.getsignal(signal.SIGALRM) == previous
    assert signal.getitimer(signal.ITIMER_REAL) == (0.0, 0.0)


def test_publication_pika_bloquee_interrompt_la_connexion_incertaine() -> None:

    class BlockedPublisher:
        def basic_publish(self, **_kwargs: object) -> None:
            time.sleep(0.1)

    root = FIXTURE.parents[6]
    topology = DiagnosticTopologyV1.model_validate_json(
        (root / "infra/rabbitmq/diagnostic-topology.json").read_bytes()
    )
    started = next(
        run_diagnostic(
            DiagnosticRequestedV1.model_validate_json(FIXTURE.read_bytes()),
            FixedClock(),
            next_id,
            optimal,
        )
    )
    with pytest.raises(PublicationDeadlineExceededError):
        publish_report(cast(BlockingChannel, BlockedPublisher()), topology, started, timeout_s=0.01)


def test_settings_exigent_une_url_amqp_et_ne_permettent_pas_http() -> None:

    with pytest.raises(ValidationError):
        WorkerSettings.model_validate({})
    with pytest.raises(ValidationError):
        WorkerSettings.model_validate({"AMQP_URL": "https://broker"})
    assert str(WorkerSettings.model_validate({"AMQP_URL": "amqp://broker"}).amqp_url).startswith(
        "amqp://"
    )


def test_fermeture_bloquee_arrete_le_worker_sans_reutiliser_la_connexion() -> None:
    class BlockedConnection:
        is_open = True

        def close(self) -> None:
            time.sleep(0.1)

    with pytest.raises(SystemExit) as error:
        close_connection(cast(BlockingConnection, BlockedConnection()), timeout_s=0.01)
    assert error.value.code == 75


def test_confirmation_expiree_ne_reutilise_pas_le_canal_pour_rejeter() -> None:
    class UncertainDelivery(RecordingDelivery):
        def publish(self, report: DiagnosticReportedV1) -> None:
            self.reports.append(report)
            raise PublicationDeadlineExceededError("incertain")

    delivery = UncertainDelivery()
    with pytest.raises(PublicationDeadlineExceededError):
        handle_request(FIXTURE.read_bytes(), delivery, FixedClock(), next_id, optimal)
    assert not delivery.acknowledged
    assert delivery.requeued is None
