-- AlterTable
ALTER TABLE "scheduling"."diagnostic_runs" ADD COLUMN     "failure" VARCHAR(32),
ADD COLUMN     "finished_at" TIMESTAMPTZ(3),
ADD COLUMN     "last_sequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "outcome" JSONB;

-- AlterTable
ALTER TABLE "scheduling"."outbox_messages" ADD COLUMN     "published_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "scheduling"."inbox_receipts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inbox_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling"."diagnostic_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "diagnostic_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "diagnostic_events_organization_id_run_id_sequence_idx" ON "scheduling"."diagnostic_events"("organization_id", "run_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_events_run_id_sequence_key" ON "scheduling"."diagnostic_events"("run_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_runs_id_organization_id_key" ON "scheduling"."diagnostic_runs"("id", "organization_id");

-- CreateIndex
CREATE INDEX "outbox_messages_published_at_id_idx" ON "scheduling"."outbox_messages"("published_at", "id");

-- AddForeignKey
ALTER TABLE "scheduling"."diagnostic_events" ADD CONSTRAINT "diagnostic_events_run_id_organization_id_fkey" FOREIGN KEY ("run_id", "organization_id") REFERENCES "scheduling"."diagnostic_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

