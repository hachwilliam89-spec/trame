-- Retire le jeu de démonstration chargé par `load-demo.js`, et lui seul (RUNBOOK, « Charger le jeu
-- de démonstration »). Paramètres de session, passés par PGOPTIONS : trame.demo_organization et
-- trame.demo_site, le `siteId` affiché par le chargement. Une seule transaction : tout ou rien.
--
-- Le jeu se reconnaît à son site : tout ce qui y est rattaché est retiré. Les compétences, propres
-- à l'organisation, ne sont retirées que si les postes du site les exigeaient et que plus rien ne
-- les utilise ensuite.
BEGIN;

CREATE TEMPORARY TABLE demo_target ON COMMIT DROP AS
SELECT
  current_setting('trame.demo_organization')::uuid AS organization_id,
  current_setting('trame.demo_site')::uuid AS site_id;

-- Une erreur d'identifiant ne supprime rien : le site doit être le site de démonstration de cette
-- organisation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM organization.sites
    JOIN demo_target
      ON sites.id = demo_target.site_id
      AND sites.organization_id = demo_target.organization_id
    WHERE sites.code = 'DEMO'
  ) THEN
    RAISE EXCEPTION 'Aucun site de démonstration avec cet identifiant dans cette organisation : rien n''a été supprimé.';
  END IF;
END
$$;

CREATE TEMPORARY TABLE demo_skills ON COMMIT DROP AS
SELECT DISTINCT position_skills.skill_id
FROM organization.position_skills
JOIN organization.positions ON positions.id = position_skills.position_id
JOIN demo_target
  ON positions.site_id = demo_target.site_id
  AND positions.organization_id = demo_target.organization_id;

DELETE FROM scheduling.schedule_generations
USING demo_target
WHERE schedule_generations.organization_id = demo_target.organization_id
  AND schedule_generations.site_id = demo_target.site_id;

DELETE FROM demand.coverage_needs
USING demo_target
WHERE coverage_needs.organization_id = demo_target.organization_id
  AND coverage_needs.site_id = demo_target.site_id;

DELETE FROM demand.weekly_coverages
USING demo_target
WHERE weekly_coverages.organization_id = demo_target.organization_id
  AND weekly_coverages.site_id = demo_target.site_id;

DELETE FROM staff.contracts
USING staff.employees, demo_target
WHERE contracts.employee_id = employees.id
  AND employees.organization_id = demo_target.organization_id
  AND employees.site_id = demo_target.site_id;

DELETE FROM staff.employee_qualifications
USING staff.employees, demo_target
WHERE employee_qualifications.employee_id = employees.id
  AND employees.organization_id = demo_target.organization_id
  AND employees.site_id = demo_target.site_id;

DELETE FROM staff.employees
USING demo_target
WHERE employees.organization_id = demo_target.organization_id
  AND employees.site_id = demo_target.site_id;

DELETE FROM organization.position_skills
USING organization.positions, demo_target
WHERE position_skills.position_id = positions.id
  AND positions.organization_id = demo_target.organization_id
  AND positions.site_id = demo_target.site_id;

DELETE FROM organization.positions
USING demo_target
WHERE positions.organization_id = demo_target.organization_id
  AND positions.site_id = demo_target.site_id;

DELETE FROM organization.shift_templates
USING demo_target
WHERE shift_templates.organization_id = demo_target.organization_id
  AND shift_templates.site_id = demo_target.site_id;

DELETE FROM organization.sites
USING demo_target
WHERE sites.organization_id = demo_target.organization_id
  AND sites.id = demo_target.site_id;

DELETE FROM organization.skills
USING demo_skills
WHERE skills.id = demo_skills.skill_id
  AND NOT EXISTS (
    SELECT 1 FROM organization.position_skills WHERE position_skills.skill_id = skills.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM staff.employee_qualifications WHERE employee_qualifications.skill_id = skills.id
  );

COMMIT;
