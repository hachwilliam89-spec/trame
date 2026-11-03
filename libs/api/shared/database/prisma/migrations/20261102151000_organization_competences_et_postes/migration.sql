-- CreateTable
CREATE TABLE "organization"."skills" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization"."positions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization"."position_skills" (
    "organization_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,

    CONSTRAINT "position_skills_pkey" PRIMARY KEY ("position_id","skill_id")
);

-- CreateIndex
CREATE INDEX "skills_organization_id_id_idx" ON "organization"."skills"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "skills_id_organization_id_key" ON "organization"."skills"("id", "organization_id");

-- CreateIndex
CREATE INDEX "positions_organization_id_site_id_id_idx" ON "organization"."positions"("organization_id", "site_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "positions_id_organization_id_key" ON "organization"."positions"("id", "organization_id");

-- CreateIndex
CREATE INDEX "position_skills_skill_id_organization_id_idx" ON "organization"."position_skills"("skill_id", "organization_id");

-- AddForeignKey
ALTER TABLE "organization"."positions" ADD CONSTRAINT "positions_site_id_organization_id_fkey" FOREIGN KEY ("site_id", "organization_id") REFERENCES "organization"."sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization"."position_skills" ADD CONSTRAINT "position_skills_position_id_organization_id_fkey" FOREIGN KEY ("position_id", "organization_id") REFERENCES "organization"."positions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization"."position_skills" ADD CONSTRAINT "position_skills_skill_id_organization_id_fkey" FOREIGN KEY ("skill_id", "organization_id") REFERENCES "organization"."skills"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
