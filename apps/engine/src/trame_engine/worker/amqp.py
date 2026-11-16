"""Adaptateur Pika : connexion, topologie déclarée et rapports persistants confirmés."""

import pika
from pika.adapters.blocking_connection import BlockingChannel
from pika.exchange_type import ExchangeType

from trame_engine.contracts import (
    Arguments,
    DiagnosticReportedV1,
    DiagnosticTopologyV1,
    ScheduleReportedV1,
    ScheduleTopologyV1,
)
from trame_engine.worker.deadline import PublicationDeadlineExceededError, publication_deadline

type QueueTopology = DiagnosticTopologyV1 | ScheduleTopologyV1
type Report = DiagnosticReportedV1 | ScheduleReportedV1


def open_connection(url: str) -> pika.BlockingConnection:
    parameters = pika.URLParameters(url)
    parameters.heartbeat = 30
    parameters.blocked_connection_timeout = 5
    parameters.socket_timeout = 5
    parameters.stack_timeout = 10
    return pika.BlockingConnection(parameters)


def publish_report(
    publisher: BlockingChannel, topology: QueueTopology, report: Report, timeout_s: float = 5.0
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


def declare_topology(channel: BlockingChannel, topology: QueueTopology) -> None:
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


def close_connection(connection: pika.BlockingConnection, timeout_s: float = 5.0) -> None:
    try:
        with publication_deadline(timeout_s):
            if connection.is_open:
                connection.close()
    except PublicationDeadlineExceededError:
        # La supervision redémarrera ce processus ; aucune livraison n'a été acquittée.
        raise SystemExit(75) from None
