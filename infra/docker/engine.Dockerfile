FROM ghcr.io/astral-sh/uv:0.13.6@sha256:af22a52f5eafef3d78e551599d405c02df61919d18028f0cea8eda93bc9986d0 AS uv
FROM python:3.14.10-slim-bookworm@sha256:3fe1a0b6c2d6b2ebb572906cdabeca75aeb558c0c17db5ffefbcf8094871c32b AS builder
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_PYTHON_DOWNLOADS=never UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY apps/engine/pyproject.toml apps/engine/uv.lock apps/engine/README.md ./
COPY apps/engine/src ./src
RUN uv sync --frozen --no-dev --no-editable --no-build-package ortools

FROM python:3.14.10-slim-bookworm@sha256:3fe1a0b6c2d6b2ebb572906cdabeca75aeb558c0c17db5ffefbcf8094871c32b AS engine
WORKDIR /app
ENV PATH=/app/.venv/bin:$PATH PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    DIAGNOSTIC_TOPOLOGY_FILE=/app/topology.json ENGINE_HOST=0.0.0.0 ENGINE_LOG_JSON=true
COPY --from=builder /app/.venv ./.venv
COPY infra/rabbitmq/diagnostic-topology.json ./topology.json
USER 10001:10001
EXPOSE 8000
CMD ["python", "-m", "trame_engine"]

FROM engine AS worker
CMD ["python", "-m", "trame_engine.worker"]
