"""Un calcul long hors du thread de Pika, qui seul sert la connexion pendant ce temps.

Pika n'est pas sûr entre threads : le calcul ne le touche jamais. Le thread principal traite les
événements de la connexion (battements de cœur compris) jusqu'à la fin du calcul, et l'interrompt
à l'arrêt du worker.
"""

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from threading import Event


def run_in_background[T](
    compute: Callable[[], T],
    pump: Callable[[], None],
    stop: Event,
    interrupt: Callable[[], None],
) -> T | None:
    """Le résultat du calcul, ou `None` s'il a été interrompu par l'arrêt du worker."""
    with ThreadPoolExecutor(max_workers=1, thread_name_prefix="schedule") as executor:
        future = executor.submit(compute)
        while not future.done():
            if stop.is_set():
                interrupt()
                future.result()
                return None
            try:
                pump()
            except BaseException:
                # Connexion perdue : inutile d'attendre un résultat qui ne pourra pas être publié.
                interrupt()
                raise
        if stop.is_set():
            return None
        return future.result()
