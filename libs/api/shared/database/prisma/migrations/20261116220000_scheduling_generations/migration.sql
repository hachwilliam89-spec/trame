-- CreateTable
CREATE TABLE "scheduling"."schedule_generations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "week_starts_on" DATE NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "problem" JSONB NOT NULL,
    "parameters" JSONB NOT NULL,
    "excluded_employees" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "outcome" JSONB,
    "failure" VARCHAR(32),
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "schedule_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_generations_week_idx" ON "scheduling"."schedule_generations"("organization_id", "site_id", "week_starts_on", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_generations_id_organization_id_key" ON "scheduling"."schedule_generations"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_generations_organization_id_idempotency_key_key" ON "scheduling"."schedule_generations"("organization_id", "idempotency_key");


-- Invariants non représentés par Prisma ; les migrations restent leur source de vérité.
ALTER TABLE scheduling.schedule_generations ADD CONSTRAINT schedule_generations_status_check
    CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED'));
ALTER TABLE scheduling.schedule_generations ADD CONSTRAINT schedule_generations_idempotency_key_check
    CHECK (idempotency_key COLLATE "C" ~ '^[!-~]{1,128}$');
-- Un lundi (ISODOW 1) : la semaine planifiée commence toujours un lundi.
ALTER TABLE scheduling.schedule_generations ADD CONSTRAINT schedule_generations_week_starts_on_check
    CHECK (EXTRACT(ISODOW FROM week_starts_on) = 1);
