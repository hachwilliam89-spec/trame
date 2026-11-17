"""Génération d'un planning : demande validée, calcul, rapports versionnés, puis ACK.

Seuls `STARTED` puis `RESULT` ou `FAILED` sont publiés, chacun confirmé avant l'acquittement.
"""

from collections.abc import Callable, Iterator
from typing import Protocol
from uuid import UUID

import structlog
from pydantic import ValidationError

from trame_engine.contracts import ScheduleReportedV1, ScheduleRequestedV1
from trame_engine.solver.scheduling import (
    InvalidProblemError,
    ScheduleOutcome,
    SolveParameters,
    Week,
    read_week,
)
from trame_engine.worker.clock import Clock
from trame_engine.worker.deadline import PublicationDeadlineExceededError

# Même limite que SCHEDULE_MESSAGE_MAX_BYTES (contrats) : l'API refuse une demande plus grande
# avant de l'écrire ; au-delà, la demande est écartée.
MAX_REQUEST_BYTES = 1024 * 1024
# Limite de l'API pour un rapport de génération : au-delà, il serait refusé et jamais rattaché.
MAX_REPORT_BYTES = 1024 * 1024

type ScheduleSolver = Callable[[Week, SolveParameters], ScheduleOutcome | None]
type IdGenerator = Callable[[], UUID]


class ComputationInterruptedError(Exception):
    """Le worker s'arrête pendant le calcul : la demande sera recalculée plus tard."""


class ScheduleDelivery(Protocol):
    def publish(self, report: ScheduleReportedV1) -> None: ...
    def acknowledge(self) -> None: ...
    def reject(self, *, requeue: bool) -> None: ...
    def return_to_queue(self) -> None: ...


def create_report(
    request: ScheduleRequestedV1, report: dict[str, object], clock: Clock, ids: IdGenerator
) -> ScheduleReportedV1:
    return ScheduleReportedV1.model_validate(
        {
            "id": str(ids()),
            "organizationId": str(request.organization_id),
            "type": "scheduling.schedule-reported.v1",
            "occurredAt": clock.now().isoformat(),
            "payload": {
                "generationId": str(request.payload.generation_id),
                "requestId": str(request.id),
                "report": report,
            },
        }
    )


def outcome_report(outcome: ScheduleOutcome) -> dict[str, object]:
    schedule: dict[str, object] | None = None
    if outcome.schedule is not None:
        assignments = sorted(
            outcome.schedule, key=lambda item: (item.shift_id, str(item.employee_id))
        )
        schedule = {
            "assignments": [
                {"shiftId": item.shift_id, "employeeId": str(item.employee_id)}
                for item in assignments
            ],
            "shortfalls": [
                {
                    "shiftId": gap.shift_id,
                    "requiredCount": gap.required,
                    "assignedCount": gap.assigned,
                }
                for gap in outcome.shortfalls
            ],
        }
    return {
        "kind": "RESULT",
        "outcome": {
            "result": {"status": outcome.status.value, "schedule": schedule},
            "checkedRules": list(outcome.checked_rules),
            "solveSeconds": outcome.solve_seconds,
        },
    }


def run_schedule(
    request: ScheduleRequestedV1, clock: Clock, ids: IdGenerator, solve: ScheduleSolver
) -> Iterator[ScheduleReportedV1]:
    yield create_report(request, {"kind": "STARTED"}, clock, ids)
    try:
        week = read_week(request.payload.problem)
    except InvalidProblemError:
        yield create_report(request, {"kind": "FAILED", "code": "INVALID_MODEL"}, clock, ids)
        return
    parameters = SolveParameters(
        time_limit_seconds=request.payload.parameters.time_limit_seconds,
        workers=request.payload.parameters.workers,
        seed=request.payload.parameters.seed,
    )
    outcome = solve(week, parameters)
    if outcome is None:
        raise ComputationInterruptedError
    yield bounded_result_report(request, outcome, clock, ids)


def bounded_result_report(
    request: ScheduleRequestedV1, outcome: ScheduleOutcome, clock: Clock, ids: IdGenerator
) -> ScheduleReportedV1:
    """Le résultat, ou un petit rapport d'échec s'il dépasse la limite acceptée par l'API."""
    report = create_report(request, outcome_report(outcome), clock, ids)
    size = len(report.model_dump_json(by_alias=True).encode())
    if size <= MAX_REPORT_BYTES:
        return report
    structlog.get_logger().warning(
        "schedule_report_too_large",
        generation_id=str(request.payload.generation_id),
        report_bytes=size,
    )
    return create_report(request, {"kind": "FAILED", "code": "PROCESSING_FAILED"}, clock, ids)


def handle_schedule_request(
    body: bytes, delivery: ScheduleDelivery, clock: Clock, ids: IdGenerator, solve: ScheduleSolver
) -> None:
    if len(body) > MAX_REQUEST_BYTES:
        delivery.reject(requeue=False)
        return
    try:
        request = ScheduleRequestedV1.model_validate_json(body)
    except ValidationError:
        delivery.reject(requeue=False)
        return
    try:
        for report in run_schedule(request, clock, ids, solve):
            delivery.publish(report)
            structlog.get_logger().info(
                "schedule_reported",
                generation_id=str(request.payload.generation_id),
                request_id=str(request.id),
                report_id=str(report.id),
            )
    except ComputationInterruptedError:
        # basic.nack : un retour sans échec, qui ne compte pas dans la limite de livraisons.
        delivery.return_to_queue()
        return
    except PublicationDeadlineExceededError:
        # Ne pas réutiliser un canal dont la confirmation est incertaine.
        raise
    except Exception as error:
        structlog.get_logger().warning("schedule_retry", error_type=type(error).__name__)
        delivery.reject(requeue=True)
        return
    delivery.acknowledge()
