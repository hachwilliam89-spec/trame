"""RabbitMQ réel, à l'image figée de la stack de dev (`infra/compose/dev.yml`)."""

import re
import secrets
import time
from collections.abc import Iterator
from pathlib import Path

import pika
import pytest
from pika.exceptions import AMQPConnectionError
from testcontainers.core.container import DockerContainer

ROOT = Path(__file__).resolve().parents[3]
AMQP_PORT = 5672
USER = "trame-test"


def pinned_rabbitmq_image() -> str:
    compose = (ROOT / "infra/compose/dev.yml").read_text(encoding="utf-8")
    match = re.search(r"^\s*image:\s*(rabbitmq:\S+)$", compose, re.MULTILINE)
    if match is None:
        msg = "Image RabbitMQ introuvable dans infra/compose/dev.yml."
        raise LookupError(msg)
    return match.group(1)


def wait_until_reachable(url: str, timeout_s: float = 120) -> None:
    deadline = time.monotonic() + timeout_s
    while True:
        try:
            pika.BlockingConnection(pika.URLParameters(url)).close()
        except AMQPConnectionError:
            if time.monotonic() > deadline:
                raise
            time.sleep(1)
        else:
            return


@pytest.fixture(scope="module")
def amqp_url() -> Iterator[str]:
    password = secrets.token_hex(16)
    container = (
        DockerContainer(pinned_rabbitmq_image())
        .with_exposed_ports(AMQP_PORT)
        .with_env("RABBITMQ_DEFAULT_USER", USER)
        .with_env("RABBITMQ_DEFAULT_PASS", password)
    )
    with container:
        host = container.get_container_host_ip()
        port = container.get_exposed_port(AMQP_PORT)
        url = f"amqp://{USER}:{password}@{host}:{port}/%2F"
        wait_until_reachable(url)
        yield url
