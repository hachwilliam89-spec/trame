"""Processus worker : diagnostics et générations, un calcul à la fois."""

import logging
import os
import signal
from threading import Event
from types import FrameType

import structlog

from trame_engine.contracts import DiagnosticTopologyV1, ScheduleTopologyV1
from trame_engine.logs import configure_logging
from trame_engine.solver.scheduling import solve_week
from trame_engine.worker.serve import consume, with_worker_cap
from trame_engine.worker.settings import WorkerSettings
from trame_engine.worker.stream import WorkerTopologies


def main() -> None:
    configure_logging("info", json=True)
    # Les diagnostics de bibliothèque ne doivent pas exposer de paramètres de connexion.
    logging.getLogger("pika").setLevel(logging.CRITICAL)
    logger = structlog.get_logger()
    settings = WorkerSettings.model_validate(dict(os.environ))
    topologies = WorkerTopologies(
        diagnostic=DiagnosticTopologyV1.model_validate_json(settings.topology_file.read_bytes()),
        schedule=ScheduleTopologyV1.model_validate_json(
            settings.schedule_topology_file.read_bytes()
        ),
    )
    solve_schedule = with_worker_cap(solve_week, settings.max_workers)
    stop = Event()

    def shutdown(_signal: int, _frame: FrameType | None) -> None:
        stop.set()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    while not stop.is_set():
        try:
            logger.info("worker_connecting")
            consume(str(settings.amqp_url), topologies, stop, solve_schedule)
        except Exception as error:
            logger.warning("worker_retry", error_type=type(error).__name__)
            stop.wait(5)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        structlog.get_logger().error("worker_failed", error_type=type(error).__name__)
        raise SystemExit(1) from None
