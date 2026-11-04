-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "scheduling";

-- CreateTable
CREATE TABLE "scheduling"."diagnostic_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "diagnostic_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling"."outbox_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "body" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "diagnostic_runs_organization_id_id_idx" ON "scheduling"."diagnostic_runs"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_runs_organization_id_idempotency_key_key" ON "scheduling"."diagnostic_runs"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "outbox_messages_organization_id_id_idx" ON "scheduling"."outbox_messages"("organization_id", "id");


-- Invariants non représentés par Prisma ; les migrations restent leur source de vérité.
ALTER TABLE scheduling.diagnostic_runs ADD CONSTRAINT diagnostic_runs_status_check
    CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED'));
ALTER TABLE scheduling.diagnostic_runs ADD CONSTRAINT diagnostic_runs_idempotency_key_check
    CHECK (idempotency_key COLLATE "C" ~ '^[!-~]{1,128}$');
