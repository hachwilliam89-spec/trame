"""Le rôle du relay, sur sa propre connexion et dans son propre thread : demandes et rapports."""

import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from functools import partial

import pika
from pika.adapters.blocking_connection import BlockingChannel
from pika.spec import Basic, BasicProperties

from trame_engine.worker.amqp import QueueTopology, declare_topology
from trame_engine.worker.stream import WorkerTopologies


@dataclass(frozen=True, slots=True)
class ReceivedReport:
    queue: str
    kind: str
    received_at: float


@dataclass(frozen=True, slots=True)
class ReturnedRequest:
    redelivered: bool
    delivery_count: int


class ApiSide:
    def __init__(self, url: str, topologies: WorkerTopologies) -> None:
        self.connection = pika.BlockingConnection(pika.URLParameters(url))
        self.channel = self.connection.channel()
        self.channel.confirm_delivery()
        declare_topology(self.channel, topologies.diagnostic)
        declare_topology(self.channel, topologies.schedule)
        self.reports: list[ReceivedReport] = []

    def request(self, topology: QueueTopology, body: bytes) -> None:
        self.channel.basic_publish(
            exchange=topology.exchange,
            routing_key=topology.requests.routing_key,
            body=body,
            properties=pika.BasicProperties(delivery_mode=2, content_type="application/json"),
        )

    def listen_to_reports(self, topologies: WorkerTopologies) -> None:
        for topology in (topologies.diagnostic, topologies.schedule):
            queue = topology.reports.name
            self.channel.basic_consume(queue, partial(self._record, queue), auto_ack=True)

    def _record(
        self,
        queue: str,
        _channel: BlockingChannel,
        _method: Basic.Deliver,
        _properties: BasicProperties,
        body: bytes,
    ) -> None:
        kind = json.loads(body)["payload"]["report"]["kind"]
        self.reports.append(ReceivedReport(queue, kind, time.monotonic()))

    def has_report(self, topology: QueueTopology, kind: str) -> bool:
        queue = topology.reports.name
        return any(report.queue == queue and report.kind == kind for report in self.reports)

    def waiting_requests(self, topology: QueueTopology) -> int:
        """Demandes prêtes, hors livraisons détenues par un consommateur."""
        declared = self.channel.queue_declare(topology.requests.name, passive=True)
        if declared.method.message_count is None:
            msg = "RabbitMQ n'a pas donné le nombre de messages."
            raise ValueError(msg)
        return declared.method.message_count

    def wait_until(self, condition: Callable[[], bool], timeout_s: float) -> None:
        deadline = time.monotonic() + timeout_s
        while not condition():
            if time.monotonic() > deadline:
                msg = "Condition non atteinte à temps."
                raise TimeoutError(msg)
            self.connection.process_data_events(time_limit=1)

    def take_request(self, topology: QueueTopology) -> ReturnedRequest:
        """Reprend une demande rendue par le worker, et dit combien d'échecs RabbitMQ a comptés."""
        taken: list[ReturnedRequest] = []

        def take(
            channel: BlockingChannel,
            method: Basic.Deliver,
            properties: BasicProperties,
            _body: bytes,
        ) -> None:
            if method.delivery_tag is None:
                msg = "Livraison AMQP sans étiquette."
                raise ValueError(msg)
            headers = properties.headers or {}
            count = int(headers.get("x-delivery-count", 0))
            taken.append(ReturnedRequest(bool(method.redelivered), count))
            channel.basic_ack(method.delivery_tag)

        tag = self.channel.basic_consume(topology.requests.name, take, auto_ack=False)
        self.wait_until(lambda: bool(taken), timeout_s=10)
        self.channel.basic_cancel(tag)
        return taken[0]

    def close(self) -> None:
        if self.connection.is_open:
            self.connection.close()
