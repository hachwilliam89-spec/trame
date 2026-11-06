-- Provisionne la base de Keycloak, partagée par les realms de staging et de production
-- (US-005 B2a, #47) : le rôle keycloak possède la base keycloak, où Keycloak crée ses tables, et
-- aucun autre rôle ne s'y connecte.
--
-- Lancé par le superutilisateur, dans le conteneur PostgreSQL, script sur l'entrée standard :
--   docker compose exec -T -e TRAME_KEYCLOAK_DATABASE_PASSWORD postgres \
--     psql --no-psqlrc -U postgres -d postgres < infra/provisioning/postgres-keycloak.sql
-- Le mot de passe ne passe que par l'environnement. Rejouable, comme postgres-environment.sql.

\set ON_ERROR_STOP on
\set QUIET on

-- Aucun texte de requête de cette session n'atteint le journal du serveur : la suite contient des
-- mots de passe. Chaque mode qui journalise ce texte est coupé, quel que soit le réglage du serveur :
-- toutes les requêtes, celles qui durent, un échantillon de requêtes ou de transactions, celles en
-- erreur, et les options de débogage qui journalisent l'arbre d'une requête. Ces réglages exigent
-- le superutilisateur : sans lui, le script s'arrête ici, avant tout secret.
SET log_statement = none;
SET log_min_duration_statement = -1;
SET log_min_duration_sample = -1;
SET log_transaction_sample_rate = 0;
SET log_min_error_statement = panic;
SET debug_print_parse = off;
SET debug_print_rewritten = off;
SET debug_print_plan = off;

\set keycloak_password ''
\getenv keycloak_password TRAME_KEYCLOAK_DATABASE_PASSWORD
SELECT :'keycloak_password' <> '' AS password_is_set \gset
\if :password_is_set
\else
  DO $$ BEGIN RAISE EXCEPTION 'TRAME_KEYCLOAK_DATABASE_PASSWORD est requis.'; END $$;
\endif

SELECT NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'keycloak') AS role_is_missing,
       NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak') AS database_is_missing
\gset

\if :role_is_missing
  CREATE ROLE keycloak;
\endif
ALTER ROLE keycloak WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION
  NOBYPASSRLS PASSWORD :'keycloak_password';

\if :database_is_missing
  CREATE DATABASE keycloak OWNER keycloak;
\endif
ALTER DATABASE keycloak OWNER TO keycloak;
-- Par défaut, tout rôle se connecte à toute base : ici, seul son propriétaire le peut.
REVOKE ALL ON DATABASE keycloak FROM PUBLIC;
