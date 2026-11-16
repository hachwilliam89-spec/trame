"""Arrêt du worker pendant un calcul : CP-SAT est interrompu depuis un autre thread."""

import threading
import time
from threading import Event

from trame_engine.solver.scheduling.solving import watch_stop


class RecordingSolver:
    def __init__(self) -> None:
        self.stopped = Event()

    def stop_search(self) -> None:
        self.stopped.set()


def test_un_arret_demande_interrompt_la_recherche() -> None:
    solver = RecordingSolver()
    stop = Event()
    done = Event()
    watcher = threading.Thread(target=watch_stop, args=(solver, stop, done))
    watcher.start()

    stop.set()
    watcher.join(timeout=2)

    assert solver.stopped.is_set()


def test_une_recherche_terminee_libere_la_surveillance_sans_l_interrompre() -> None:
    solver = RecordingSolver()
    stop = Event()
    done = Event()
    watcher = threading.Thread(target=watch_stop, args=(solver, stop, done))
    watcher.start()

    done.set()
    watcher.join(timeout=2)
    time.sleep(0.05)

    assert not watcher.is_alive()
    assert not solver.stopped.is_set()
