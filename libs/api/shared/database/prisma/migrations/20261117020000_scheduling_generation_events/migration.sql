-- AlterTable
ALTER TABLE "scheduling"."schedule_generations" ADD COLUMN     "last_sequence" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "scheduling"."schedule_generation_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "generation_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "result_status" VARCHAR(16),
    "failure" VARCHAR(32),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schedule_generation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_generation_events_progress_idx" ON "scheduling"."schedule_generation_events"("organization_id", "generation_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_generation_events_generation_id_sequence_key" ON "scheduling"."schedule_generation_events"("generation_id", "sequence");

-- AddForeignKey
ALTER TABLE "scheduling"."schedule_generation_events" ADD CONSTRAINT "schedule_generation_events_generation_id_organization_id_fkey" FOREIGN KEY ("generation_id", "organization_id") REFERENCES "scheduling"."schedule_generations"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Invariants non représentés par Prisma ; les migrations restent leur source de vérité.
ALTER TABLE scheduling.schedule_generation_events ADD CONSTRAINT schedule_generation_events_status_check
    CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED'));
ALTER TABLE scheduling.schedule_generation_events ADD CONSTRAINT schedule_generation_events_sequence_check
    CHECK (sequence > 0);
