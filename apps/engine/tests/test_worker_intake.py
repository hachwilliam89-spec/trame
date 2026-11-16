"""Réception des deux files : une demande à la fois, et rien de perdu à l'arrêt."""

import os
import time
from pathlib import Path
from typing import cast

from pika.adapters.blocking_connection import BlockingChannel
from pika.spec import Basic, BasicProperties

from trame_engine.worker.health import is_alive, mark_alive
from trame_engine.worker.intake import Intake, RequestKind


class RecordingChannel:
    def __init__(self) -> None:
        self.returned: list[tuple[int, bool]] = []

    def basic_nack(self, delivery_tag: int, *, requeue: bool) -> None:
        self.returned.append((delivery_tag, requeue))


def deliver(intake: Intake, kind: RequestKind, channel: RecordingChannel, tag: int) -> None:
    callback = intake.receiver(kind)
    method = Basic.Deliver(delivery_tag=tag)
    callback(cast(BlockingChannel, channel), method, BasicProperties(), f"{kind}-{tag}".encode())


def test_les_demandes_des_deux_files_sont_traitees_une_a_une_dans_l_ordre_d_arrivee() -> None:
    intake = Intake()
    diagnostics, schedules = RecordingChannel(), RecordingChannel()
    deliver(intake, "schedule", schedules, 1)
    deliver(intake, "diagnostic", diagnostics, 1)

    first = intake.next()
    second = intake.next()

    assert first is not None
    assert second is not None
    assert (first.kind, first.body) == ("schedule", b"schedule-1")
    assert (second.kind, second.body) == ("diagnostic", b"diagnostic-1")
    assert intake.next() is None


def test_a_l_arret_les_demandes_en_attente_sont_rendues_sans_compter_d_echec() -> None:
    intake = Intake()
    diagnostics, schedules = RecordingChannel(), RecordingChannel()
    deliver(intake, "diagnostic", diagnostics, 7)
    deliver(intake, "schedule", schedules, 9)

    intake.return_all()

    assert diagnostics.returned == [(7, True)]
    assert schedules.returned == [(9, True)]
    assert intake.next() is None


def test_la_sonde_juge_le_worker_vivant_tant_que_sa_boucle_tourne(tmp_path: Path) -> None:
    health = tmp_path / "vivant"

    assert not is_alive(health, max_silence_seconds=20)
    mark_alive(health)
    assert is_alive(health, max_silence_seconds=20)
    past = time.time() - 60
    os.utime(health, (past, past))
    assert not is_alive(health, max_silence_seconds=20)
