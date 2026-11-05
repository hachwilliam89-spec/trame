"""Frontière d'une livraison : validation, rapports confirmés, puis ACK."""

from typing import Protocol

import structlog
from pydantic import ValidationError

from trame_engine.contracts import DiagnosticReportedV1, DiagnosticRequestedV1
from trame_engine.worker.clock import Clock
from trame_engine.worker.deadline import PublicationDeadlineExceededError
from trame_engine.worker.diagnostic import IdGenerator, Solver, run_diagnostic


class Delivery(Protocol):
    def publish(self, report: DiagnosticReportedV1) -> None: ...
    def acknowledge(self) -> None: ...
    def reject(self, *, requeue: bool) -> None: ...


def handle_request(
    body: bytes, delivery: Delivery, clock: Clock, ids: IdGenerator, solve: Solver
) -> None:
    if len(body) > 65536:
        delivery.reject(requeue=False)
        return
    try:
        request = DiagnosticRequestedV1.model_validate_json(body)
    except ValidationError:
        delivery.reject(requeue=False)
        return
    try:
        for report in run_diagnostic(request, clock, ids, solve):
            delivery.publish(report)
            structlog.get_logger().info(
                "diagnostic_reported",
                run_id=str(request.payload.run_id),
                request_id=str(request.id),
                report_id=str(report.id),
            )
    except PublicationDeadlineExceededError:
        # Ne pas réutiliser un canal dont la confirmation est incertaine.
        raise
    except Exception as error:
        structlog.get_logger().warning("diagnostic_retry", error_type=type(error).__name__)
        delivery.reject(requeue=True)
        return
    delivery.acknowledge()
