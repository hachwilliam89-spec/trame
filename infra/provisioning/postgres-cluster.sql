-- Ferme les bases système du serveur partagé aux rôles des environnements (US-005 B2a, #47).
--
-- Par défaut, tout rôle peut se connecter à `postgres` et à `template1`. Elles ne contiennent
-- aucune donnée de Trame, mais un rôle d'environnement n'a rien à y faire : seul le
-- superutilisateur s'y connecte encore. Une base créée ensuite ne reprend pas ces droits, car
-- CREATE DATABASE ne copie pas ceux de template1.
--
-- Lancé par le superutilisateur, dans le conteneur PostgreSQL, script sur l'entrée standard :
--   docker compose exec -T postgres psql --no-psqlrc -U postgres -d postgres \
--     < infra/provisioning/postgres-cluster.sql
-- Rejouable, sans paramètre.

\set ON_ERROR_STOP on
\set QUIET on

REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
