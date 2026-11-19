-- CreateTable
CREATE TABLE "staff"."absence_week_references" (
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "week_starts_on" DATE NOT NULL,
    "method" VARCHAR(32) NOT NULL,
    "frozen_at" TIMESTAMPTZ(3) NOT NULL,
    "generation_id" UUID,
    "worked_shifts" JSONB,
    "time_zone" VARCHAR(64),
    "weekly_minimum_minutes" INTEGER,
    "activity_days" JSONB,
    "day_valuations" JSONB,

    CONSTRAINT "absence_week_references_pkey" PRIMARY KEY ("organization_id","employee_id","week_starts_on")
);

-- AddForeignKey
ALTER TABLE "staff"."absence_week_references" ADD CONSTRAINT "absence_week_references_employee_id_organization_id_fkey" FOREIGN KEY ("employee_id", "organization_id") REFERENCES "staff"."employees"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Contraintes ajoutées à la main : Prisma ne les exprime pas dans le schéma, et `migrate diff` les ignore.
-- La semaine commence un lundi (ISODOW 1), et chaque méthode porte exactement ses paramètres.
ALTER TABLE "staff"."absence_week_references"
    ADD CONSTRAINT "absence_week_references_week_starts_on_check" CHECK (EXTRACT(ISODOW FROM "week_starts_on") = 1),
    ADD CONSTRAINT "absence_week_references_method_check" CHECK (
        (
            "method" = 'REFERENCE_PLANNING'
            AND "generation_id" IS NOT NULL
            AND "worked_shifts" IS NOT NULL
            AND "time_zone" IS NULL
            AND "weekly_minimum_minutes" IS NULL
            AND "activity_days" IS NULL
            AND "day_valuations" IS NULL
        )
        OR (
            "method" = 'EQUAL_SHARE_OF_ACTIVITY_DAYS'
            AND "generation_id" IS NULL
            AND "worked_shifts" IS NULL
            AND "time_zone" IS NOT NULL
            AND "weekly_minimum_minutes" >= 0
            AND "activity_days" IS NOT NULL
            AND "day_valuations" IS NOT NULL
        )
    );
