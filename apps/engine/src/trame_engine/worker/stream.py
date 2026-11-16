"""Les deux files de demandes, consommées sur une connexion servie par un seul thread.

Pika n'est pas sûr entre threads : seul le thread principal touche la connexion et ses canaux.
"""

from dataclasses import dataclass

from pika import BlockingConnection
from pika.adapters.blocking_connection import BlockingChannel

from trame_engine.contracts import DiagnosticTopologyV1, ScheduleTopologyV1
from trame_engine.worker.amqp import QueueTopology, declare_topology
from trame_engine.worker.intake import Intake, RequestKind


@dataclass(frozen=True, slots=True)
class WorkerTopologies:
    diagnostic: DiagnosticTopologyV1
    schedule: ScheduleTopologyV1


@dataclass(frozen=True, slots=True)
class Consumer:
    channel: BlockingChannel
    tag: str


class RequestStream:
    def __init__(self, connection: BlockingConnection, topologies: WorkerTopologies) -> None:
        self.connection = connection
        self.topologies = topologies
        self.intake = Intake()
        self.publisher = connection.channel()
        self.publisher.confirm_delivery()
        self._consumers: list[Consumer] = []

    def start(self) -> None:
        self._listen("diagnostic", self.topologies.diagnostic)
        self._listen("schedule", self.topologies.schedule)

    def _listen(self, kind: RequestKind, topology: QueueTopology) -> None:
        channel = self.connection.channel()
        declare_topology(channel, topology)
        # Une livraison détenue au plus par file ; la limite commune vient de l'`Intake`.
        channel.basic_qos(prefetch_count=1)
        tag = channel.basic_consume(
            topology.requests.name, self.intake.receiver(kind), auto_ack=False
        )
        self._consumers.append(Consumer(channel, tag))

    def pump(self, seconds: int) -> None:
        """Traite les événements de la connexion : battements de cœur et nouvelles livraisons."""
        self.connection.process_data_events(time_limit=seconds)

    def stop_consuming(self) -> None:
        """Annule les consommateurs avant de rendre la moindre livraison.

        Tant qu'une file a une livraison détenue (prefetch = 1), elle n'en envoie pas d'autre.
        Annuler d'abord évite qu'une livraison rendue revienne aussitôt et que Pika la refuse par
        `basic.reject`, que RabbitMQ 4.3 compte comme un échec. Les livraisons déjà reçues sont
        d'abord distribuées à l'`Intake`, pour être rendues sans échec.
        """
        if not self._consumers:
            return
        self.connection.process_data_events(time_limit=0)
        while self._consumers:
            consumer = self._consumers.pop()
            consumer.channel.basic_cancel(consumer.tag)

    def return_delivery(self, channel: BlockingChannel, delivery_tag: int) -> None:
        """Rend une livraison par `basic.nack` : le worker s'arrête, la demande n'a pas échoué."""
        self.stop_consuming()
        channel.basic_nack(delivery_tag, requeue=True)

    def release(self) -> None:
        """Arrêt normal : plus de nouvelle livraison, et celles en attente sont rendues."""
        self.stop_consuming()
        self.intake.return_all()
