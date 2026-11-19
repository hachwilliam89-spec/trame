-- CreateTable
CREATE TABLE "staff"."absences" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "absences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "absences_organization_id_employee_id_starts_at_idx" ON "staff"."absences"("organization_id", "employee_id", "starts_at");

-- AddForeignKey
ALTER TABLE "staff"."absences" ADD CONSTRAINT "absences_employee_id_organization_id_fkey" FOREIGN KEY ("employee_id", "organization_id") REFERENCES "staff"."employees"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Contraintes ajoutées à la main : Prisma ne les exprime pas dans le schéma, et `migrate diff` les ignore.
-- La fin de l'absence suit son début, et son motif est l'une des quatre catégories.
ALTER TABLE "staff"."absences"
    ADD CONSTRAINT "absences_period_check" CHECK ("ends_at" > "starts_at"),
    ADD CONSTRAINT "absences_reason_check" CHECK ("reason" IN ('LEAVE', 'SICK_LEAVE', 'TRAINING', 'OTHER'));
