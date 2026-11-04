"""Diagnostic fixe et rapports versionnés ; aucun transport dans le calcul."""

from collections.abc import Callable, Iterator
from uuid import UUID

from trame_engine.contracts import DiagnosticReportedV1, DiagnosticRequestedV1
from trame_engine.solver.smoke import AssignmentResult
from trame_engine.worker.clock import Clock

type Solver = Callable[[list[list[int]]], AssignmentResult]
type IdGenerator = Callable[[], UUID]


def create_report(
    request: DiagnosticRequestedV1, report: dict[str, object], clock: Clock, ids: IdGenerator
) -> DiagnosticReportedV1:
    return DiagnosticReportedV1.model_validate(
        {
            "id": str(ids()),
            "organizationId": str(request.organization_id),
            "type": "scheduling.diagnostic-reported.v1",
            "occurredAt": clock.now().isoformat(),
            "payload": {
                "runId": str(request.payload.run_id),
                "requestId": str(request.id),
                "report": report,
            },
        }
    )


def run_diagnostic(
    request: DiagnosticRequestedV1, clock: Clock, ids: IdGenerator, solve: Solver
) -> Iterator[DiagnosticReportedV1]:
    yield create_report(request, {"kind": "STARTED"}, clock, ids)
    costs = [[4, 1, 3], [2, 0, 5], [3, 2, 2]]
    result = solve(costs)
    if result.status.value == "MODEL_INVALID":
        yield create_report(request, {"kind": "FAILED", "code": "INVALID_MODEL"}, clock, ids)
        return
    solution: dict[str, object] | None = None
    if result.cost is not None:
        solution = {"cost": result.cost, "assignment": list(result.assignment)}
    outcome = {
        "result": {"status": result.status.value, "solution": solution},
        "problem": {"name": "assignment-smoke-v1", "costs": costs},
        "parameters": {"workers": 1, "seed": 0, "timeLimitSeconds": 5},
    }
    yield create_report(request, {"kind": "RESULT", "outcome": outcome}, clock, ids)
