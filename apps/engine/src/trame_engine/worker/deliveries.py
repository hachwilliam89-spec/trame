"""Livraisons Pika vues par les traitements : publier, acquitter, refuser, rendre."""

from trame_engine.contracts import DiagnosticReportedV1, ScheduleReportedV1
from trame_engine.worker.amqp import publish_report
from trame_engine.worker.intake import PendingRequest
from trame_engine.worker.stream import RequestStream


class PikaDelivery:
    def __init__(self, request: PendingRequest, stream: RequestStream) -> None:
        self.request = request
        self.stream = stream

    def acknowledge(self) -> None:
        self.request.channel.basic_ack(self.request.delivery_tag)

    def reject(self, *, requeue: bool) -> None:
        self.request.channel.basic_reject(self.request.delivery_tag, requeue=requeue)


class PikaDiagnosticDelivery(PikaDelivery):
    def publish(self, report: DiagnosticReportedV1) -> None:
        publish_report(self.stream.publisher, self.stream.topologies.diagnostic, report)


class PikaScheduleDelivery(PikaDelivery):
    def publish(self, report: ScheduleReportedV1) -> None:
        publish_report(self.stream.publisher, self.stream.topologies.schedule, report)

    def return_to_queue(self) -> None:
        self.stream.return_delivery(self.request.channel, self.request.delivery_tag)
