-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "demand";

-- CreateTable
CREATE TABLE "demand"."weekly_coverages" (
    "organization_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "week_starts_on" DATE NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "weekly_coverages_pkey" PRIMARY KEY ("organization_id","site_id","week_starts_on")
);

-- CreateTable
CREATE TABLE "demand"."coverage_needs" (
    "organization_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "week_starts_on" DATE NOT NULL,
    "date" DATE NOT NULL,
    "shift_template_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "required_count" SMALLINT NOT NULL,

    CONSTRAINT "coverage_needs_pkey" PRIMARY KEY ("organization_id","site_id","date","shift_template_id","position_id")
);

-- CreateIndex
CREATE INDEX "coverage_needs_organization_id_site_id_week_starts_on_idx" ON "demand"."coverage_needs"("organization_id", "site_id", "week_starts_on");

-- AddForeignKey
ALTER TABLE "demand"."coverage_needs" ADD CONSTRAINT "coverage_needs_organization_id_site_id_week_starts_on_fkey" FOREIGN KEY ("organization_id", "site_id", "week_starts_on") REFERENCES "demand"."weekly_coverages"("organization_id", "site_id", "week_starts_on") ON DELETE CASCADE ON UPDATE CASCADE;

-- Contraintes ajoutées à la main : Prisma ne les exprime pas dans le schéma, et `migrate diff` les ignore.
-- Une semaine commence un lundi (jour ISO 1). Un besoin porte sur un jour de sa semaine, du lundi
-- au dimanche, et sur 1 à 999 personnes.
ALTER TABLE "demand"."weekly_coverages"
    ADD CONSTRAINT "weekly_coverages_week_starts_on_check" CHECK (EXTRACT(ISODOW FROM "week_starts_on") = 1);

ALTER TABLE "demand"."coverage_needs"
    ADD CONSTRAINT "coverage_needs_date_check" CHECK ("date" BETWEEN "week_starts_on" AND "week_starts_on" + 6),
    ADD CONSTRAINT "coverage_needs_required_count_check" CHECK ("required_count" BETWEEN 1 AND 999);
