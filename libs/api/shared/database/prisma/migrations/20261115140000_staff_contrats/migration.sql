-- CreateTable
CREATE TABLE "staff"."contracts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "weekly_minutes_min" SMALLINT NOT NULL,
    "weekly_minutes_max" SMALLINT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contracts_organization_id_employee_id_id_idx" ON "staff"."contracts"("organization_id", "employee_id", "id");

-- AddForeignKey
ALTER TABLE "staff"."contracts" ADD CONSTRAINT "contracts_employee_id_organization_id_fkey" FOREIGN KEY ("employee_id", "organization_id") REFERENCES "staff"."employees"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Contraintes ajoutées à la main : Prisma ne les exprime pas dans le schéma, et `migrate diff` les ignore.
-- Volume hebdomadaire en minutes, d'une minute à une semaine entière (10 080 minutes), et fin
-- du contrat au plus tôt le jour de son début.
ALTER TABLE "staff"."contracts"
    ADD CONSTRAINT "contracts_weekly_minutes_min_check" CHECK ("weekly_minutes_min" BETWEEN 0 AND "weekly_minutes_max"),
    ADD CONSTRAINT "contracts_weekly_minutes_max_check" CHECK ("weekly_minutes_max" BETWEEN 1 AND 10080),
    ADD CONSTRAINT "contracts_period_check" CHECK ("ends_on" IS NULL OR "ends_on" >= "starts_on");
