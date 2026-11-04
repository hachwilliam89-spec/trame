"""Adaptateur Pika : livraison manuelle et rapports persistants confirmés."""

from threading import Event
from uuid import uuid7

import pika
from pika.adapters.blocking_connection import BlockingChannel
from pika.exchange_type import ExchangeType

from trame_engine.contracts import Arguments, DiagnosticReportedV1, DiagnosticTopologyV1
from trame_engine.solver.smoke import AssignmentResult, solve_assignment
from trame_engine.worker.clock import SystemClock
from trame_engine.worker.deadline import PublicationDeadlineExceededError, publication_deadline
from trame_engine.worker.handler import handle_request


class PikaDelivery:
    def __init__(
        self,
        channel: BlockingChannel,
        publisher: BlockingChannel,
        delivery_tag: int,
        topology: DiagnosticTopologyV1,
    ) -> None:
        self.channel = channel
        self.publisher = publisher
        self.delivery_tag = delivery_tag
        self.topology = topology

    def publish(self, report: DiagnosticReportedV1) -> None:
        publish_report(self.publisher, self.topology, report)

    def acknowledge(self) -> None:
        self.channel.basic_ack(self.delivery_tag)

    def reject(self, *, requeue: bool) -> None:
        self.channel.basic_reject(self.delivery_tag, requeue=requeue)


def publish_report(
    publisher: BlockingChannel,
    topology: DiagnosticTopologyV1,
    report: DiagnosticReportedV1,
    timeout_s: float = 5.0,
) -> None:
    with publication_deadline(timeout_s):
        publisher.basic_publish(
            exchange=topology.exchange,
            routing_key=topology.reports.routing_key,
            body=report.model_dump_json(by_alias=True).encode(),
            mandatory=True,
            properties=pika.BasicProperties(
                delivery_mode=2, content_type="application/json", message_id=str(report.id)
            ),
        )


def declare_topology(channel: BlockingChannel, topology: DiagnosticTopologyV1) -> None:
    channel.exchange_declare(
        exchange=topology.exchange, exchange_type=ExchangeType("direct"), durable=True
    )
    for queue in (topology.parking, topology.dead_letters, topology.requests, topology.reports):
        arguments = {
            key: value.root if isinstance(value, Arguments) else value
            for key, value in queue.arguments.items()
        }
        channel.queue_declare(queue=queue.name, durable=True, arguments=arguments)
        channel.queue_bind(
            queue=queue.name, exchange=topology.exchange, routing_key=queue.routing_key
        )


def solve_fixed(costs: list[list[int]]) -> AssignmentResult:
    return solve_assignment(costs, workers=1, seed=0, time_limit_s=5.0)


def consume(url: str, topology: DiagnosticTopologyV1, stop: Event) -> None:
    parameters = pika.URLParameters(url)
    parameters.heartbeat = 30
    parameters.blocked_connection_timeout = 5
    parameters.socket_timeout = 5
    parameters.stack_timeout = 10
    connection = pika.BlockingConnection(parameters)
    try:
        channel = connection.channel()
        publisher = connection.channel()
        publisher.confirm_delivery()
        declare_topology(channel, topology)
        channel.basic_qos(prefetch_count=1)
        for method, _properties, body in channel.consume(
            topology.requests.name, inactivity_timeout=1, auto_ack=False
        ):
            if stop.is_set():
                break
            if method is None:
                continue
            if method.delivery_tag is None or body is None:
                raise ValueError("Livraison AMQP incomplète.")
            delivery = PikaDelivery(channel, publisher, method.delivery_tag, topology)
            handle_request(body, delivery, SystemClock(), uuid7, solve_fixed)
    finally:
        close_connection(connection)


def close_connection(connection: pika.BlockingConnection, timeout_s: float = 5.0) -> None:
    try:
        with publication_deadline(timeout_s):
            if connection.is_open:
                connection.close()
    except PublicationDeadlineExceededError:
        # La supervision redémarrera ce processus ; aucune livraison n'a été acquittée.
        raise SystemExit(75) from None
