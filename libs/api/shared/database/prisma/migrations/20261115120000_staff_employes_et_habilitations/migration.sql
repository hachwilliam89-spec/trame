-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "staff";

-- CreateTable
CREATE TABLE "staff"."employees" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff"."employee_qualifications" (
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "expires_on" DATE,

    CONSTRAINT "employee_qualifications_pkey" PRIMARY KEY ("employee_id","skill_id")
);

-- CreateIndex
CREATE INDEX "employees_organization_id_site_id_id_idx" ON "staff"."employees"("organization_id", "site_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_id_organization_id_key" ON "staff"."employees"("id", "organization_id");

-- CreateIndex
CREATE INDEX "employee_qualifications_skill_id_organization_id_idx" ON "staff"."employee_qualifications"("skill_id", "organization_id");

-- AddForeignKey
ALTER TABLE "staff"."employee_qualifications" ADD CONSTRAINT "employee_qualifications_employee_id_organization_id_fkey" FOREIGN KEY ("employee_id", "organization_id") REFERENCES "staff"."employees"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
