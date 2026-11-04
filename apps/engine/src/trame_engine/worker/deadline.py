"""Échéances POSIX du worker Linux/macOS, dans son unique thread principal."""

import signal
from collections.abc import Iterator
from contextlib import contextmanager
from types import FrameType


class PublicationDeadlineExceededError(TimeoutError):
    """Le rapport peut avoir été publié ; la connexion ne doit plus être réutilisée."""


def _expire(_signal: int, _frame: FrameType | None) -> None:
    raise PublicationDeadlineExceededError("Confirmation AMQP incertaine.")


@contextmanager
def publication_deadline(seconds: float) -> Iterator[None]:
    if seconds <= 0 or signal.getitimer(signal.ITIMER_REAL)[0] > 0:
        raise ValueError("Échéance POSIX non disponible.")
    previous = signal.getsignal(signal.SIGALRM)
    if previous is None:
        raise RuntimeError("Gestionnaire SIGALRM non restaurable.")
    signal.signal(signal.SIGALRM, _expire)
    try:
        signal.setitimer(signal.ITIMER_REAL, seconds)
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)
