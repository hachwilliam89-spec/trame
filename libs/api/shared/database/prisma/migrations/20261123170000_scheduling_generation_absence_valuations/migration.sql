-- US-033 : valorisation des absences gardée avec chaque génération. Ajout seul (expand) : une
-- génération plus ancienne se relit avec une liste vide, et l'API précédente ignore la colonne.
-- AlterTable
ALTER TABLE "scheduling"."schedule_generations" ADD COLUMN     "absence_valuations" JSONB NOT NULL DEFAULT '[]';
