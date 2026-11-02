-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "organization";

-- CreateTable
CREATE TABLE "organization"."sites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "time_zone" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization"."shift_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "label" VARCHAR(50) NOT NULL,
    "start_minute" SMALLINT NOT NULL,
    "end_minute" SMALLINT NOT NULL,
    "break_start_minute" SMALLINT NOT NULL,
    "break_duration_minutes" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sites_organization_id_code_key" ON "organization"."sites"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sites_id_organization_id_key" ON "organization"."sites"("id", "organization_id");

-- CreateIndex
CREATE INDEX "shift_templates_site_id_organization_id_idx" ON "organization"."shift_templates"("site_id", "organization_id");

-- AddForeignKey
ALTER TABLE "organization"."shift_templates" ADD CONSTRAINT "shift_templates_site_id_organization_id_fkey" FOREIGN KEY ("site_id", "organization_id") REFERENCES "organization"."sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Contraintes ajoutées à la main : Prisma ne les exprime pas dans le schéma, et `migrate diff` les ignore.
-- Heures locales en minutes depuis minuit, et pause d'au moins une minute.
ALTER TABLE "organization"."shift_templates"
    ADD CONSTRAINT "shift_templates_start_minute_check" CHECK ("start_minute" BETWEEN 0 AND 1439),
    ADD CONSTRAINT "shift_templates_end_minute_check" CHECK ("end_minute" BETWEEN 0 AND 1439),
    ADD CONSTRAINT "shift_templates_break_start_minute_check" CHECK ("break_start_minute" BETWEEN 0 AND 1439),
    ADD CONSTRAINT "shift_templates_break_duration_minutes_check" CHECK ("break_duration_minutes" > 0);
