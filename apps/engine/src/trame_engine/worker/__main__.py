"""Processus worker local ; la supervision et les images arrivent dans US-005."""

import logging
import os
import signal
from threading import Event
from types import FrameType

import structlog

from trame_engine.contracts import DiagnosticTopologyV1
from trame_engine.logs import configure_logging
from trame_engine.worker.amqp import consume
from trame_engine.worker.settings import WorkerSettings


def main() -> None:
    configure_logging("info", json=True)
    # Les diagnostics de bibliothèque ne doivent pas exposer de paramètres de connexion.
    logging.getLogger("pika").setLevel(logging.CRITICAL)
    logger = structlog.get_logger()
    settings = WorkerSettings.model_validate(dict(os.environ))
    topology = DiagnosticTopologyV1.model_validate_json(settings.topology_file.read_bytes())
    stop = Event()

    def shutdown(_signal: int, _frame: FrameType | None) -> None:
        stop.set()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    while not stop.is_set():
        try:
            logger.info("diagnostic_worker_connecting")
            consume(str(settings.amqp_url), topology, stop)
        except Exception as error:
            logger.warning("diagnostic_worker_retry", error_type=type(error).__name__)
            stop.wait(5)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        structlog.get_logger().error("diagnostic_worker_failed", error_type=type(error).__name__)
        raise SystemExit(1) from None
