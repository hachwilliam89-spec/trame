"""Logs structurés (structlog) : JSON en production, lisibles en local."""

import logging

import structlog

from trame_engine.settings import LogLevel


def configure_logging(level: LogLevel, *, json: bool) -> None:
    """Configure structlog et le module `logging` standard une seule fois, au démarrage."""
    numeric_level = logging.getLevelNamesMapping()[level.upper()]
    renderer: structlog.typing.Processor = (
        structlog.processors.JSONRenderer() if json else structlog.dev.ConsoleRenderer()
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(numeric_level),
        cache_logger_on_first_use=True,
    )
    logging.basicConfig(level=numeric_level, format="%(message)s")
