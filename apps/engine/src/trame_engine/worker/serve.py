"""Boucle du worker : une demande à la fois, diagnostic ou génération, dans l'ordre d'arrivée."""

from collections.abc import Callable
from dataclasses import replace
from threading import Event
from uuid import uuid7

from trame_engine.solver.scheduling import ScheduleOutcome, SolveParameters, Week, solve_week
from trame_engine.solver.smoke import AssignmentResult, solve_assignment
from trame_engine.worker.amqp import close_connection, open_connection
from trame_engine.worker.background import run_in_background
from trame_engine.worker.clock import SystemClock
from trame_engine.worker.deliveries import PikaDiagnosticDelivery, PikaScheduleDelivery
from trame_engine.worker.handler import handle_request
from trame_engine.worker.health import HEALTH_FILE, mark_alive
from trame_engine.worker.intake import PendingRequest
from trame_engine.worker.schedule import ScheduleSolver, handle_schedule_request
from trame_engine.worker.stream import RequestStream, WorkerTopologies

# `solve_week` en production ; un test d'intégration y substitue un calcul plus long que le
# battement de cœur, pour vérifier que la connexion reste servie.
type WeekSolver = Callable[[Week, SolveParameters, Event], ScheduleOutcome]


def with_worker_cap(solve: WeekSolver, max_workers: int) -> WeekSolver:
    """Plafond de workers CP-SAT de l'environnement (cadrage §12 : 4 en prod, 1 en staging)."""

    def capped(week: Week, parameters: SolveParameters, cancel: Event) -> ScheduleOutcome:
        workers = min(parameters.workers, max_workers)
        return solve(week, replace(parameters, workers=workers), cancel)

    return capped


def consume(
    url: str, topologies: WorkerTopologies, stop: Event, solve_schedule: WeekSolver = solve_week
) -> None:
    connection = open_connection(url)
    try:
        stream = RequestStream(connection, topologies)
        stream.start()
        serve(stream, stop, solve_schedule)
        stream.release()
    finally:
        close_connection(connection)


def serve(stream: RequestStream, stop: Event, solve_schedule: WeekSolver) -> None:
    while not stop.is_set():
        mark_alive(HEALTH_FILE)
        stream.pump(1)
        handle_waiting_requests(stream, stop, solve_schedule)


def handle_waiting_requests(stream: RequestStream, stop: Event, solve_schedule: WeekSolver) -> None:
    while not stop.is_set():
        request = stream.intake.next()
        if request is None:
            return
        handle(request, stream, stop, solve_schedule)


def handle(
    request: PendingRequest, stream: RequestStream, stop: Event, solve_schedule: WeekSolver
) -> None:
    if request.kind == "diagnostic":
        delivery = PikaDiagnosticDelivery(request, stream)
        handle_request(request.body, delivery, SystemClock(), uuid7, solve_fixed)
        return
    schedule_delivery = PikaScheduleDelivery(request, stream)
    solver = solver_beside_connection(stream, stop, solve_schedule)
    handle_schedule_request(request.body, schedule_delivery, SystemClock(), uuid7, solver)


def solve_fixed(costs: list[list[int]]) -> AssignmentResult:
    return solve_assignment(costs, workers=1, seed=0, time_limit_s=5.0)


def solver_beside_connection(
    stream: RequestStream, stop: Event, solve_schedule: WeekSolver
) -> ScheduleSolver:
    """CP-SAT calcule dans un autre thread ; celui-ci continue de servir la connexion."""

    def keep_connection_alive() -> None:
        stream.pump(1)
        mark_alive(HEALTH_FILE)

    def solve(week: Week, parameters: SolveParameters) -> ScheduleOutcome | None:
        cancel = Event()

        def compute() -> ScheduleOutcome:
            return solve_schedule(week, parameters, cancel)

        return run_in_background(compute, keep_connection_alive, stop, interrupt=cancel.set)

    return solve
