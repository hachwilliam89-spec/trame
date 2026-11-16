"""Réception des demandes des deux files, traitées une à une par le thread de Pika.

`prefetch=1` vaut pour chaque consommateur : il ne suffit pas à limiter le worker à un calcul pour
les deux files. Les livraisons sont donc mises en attente ici, puis traitées dans l'ordre
d'arrivée. À l'arrêt, celles qui attendent sont rendues par `basic.nack`, un retour sans échec qui
ne compte pas dans la limite de livraisons des files quorum.
"""

from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from pika.adapters.blocking_connection import BlockingChannel
from pika.spec import Basic, BasicProperties

type RequestKind = Literal["diagnostic", "schedule"]


@dataclass(frozen=True, slots=True)
class PendingRequest:
    kind: RequestKind
    channel: BlockingChannel
    delivery_tag: int
    body: bytes


type Receiver = Callable[[BlockingChannel, Basic.Deliver, BasicProperties, bytes], None]


class Intake:
    def __init__(self) -> None:
        self._pending: deque[PendingRequest] = deque()

    def receiver(self, kind: RequestKind) -> Receiver:
        """Rappel de `basic_consume` : la livraison attend son tour, sans être traitée ici."""

        def receive(
            channel: BlockingChannel,
            method: Basic.Deliver,
            _properties: BasicProperties,
            body: bytes,
        ) -> None:
            if method.delivery_tag is None:
                msg = "Livraison AMQP sans étiquette."
                raise ValueError(msg)
            self._pending.append(PendingRequest(kind, channel, method.delivery_tag, body))

        return receive

    def next(self) -> PendingRequest | None:
        return self._pending.popleft() if self._pending else None

    def return_all(self) -> None:
        while self._pending:
            pending = self._pending.popleft()
            pending.channel.basic_nack(pending.delivery_tag, requeue=True)
