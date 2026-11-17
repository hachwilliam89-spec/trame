-- Retire le jeu de démonstration d'une organisation, et ses générations (RUNBOOK, « Charger le jeu
-- de démonstration »). Une seule transaction : tout ou rien. Variable psql : organization.
BEGIN;
DELETE FROM scheduling.schedule_generations WHERE organization_id = :'organization';
DELETE FROM demand.coverage_needs WHERE organization_id = :'organization';
DELETE FROM demand.weekly_coverages WHERE organization_id = :'organization';
DELETE FROM staff.contracts WHERE organization_id = :'organization';
DELETE FROM staff.employee_qualifications WHERE organization_id = :'organization';
DELETE FROM staff.employees WHERE organization_id = :'organization';
DELETE FROM organization.position_skills WHERE organization_id = :'organization';
DELETE FROM organization.positions WHERE organization_id = :'organization';
DELETE FROM organization.shift_templates WHERE organization_id = :'organization';
DELETE FROM organization.skills WHERE organization_id = :'organization';
DELETE FROM organization.sites WHERE organization_id = :'organization';
COMMIT;
