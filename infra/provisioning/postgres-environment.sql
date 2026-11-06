-- Provisionne la base d'un environnement déployé de Trame (US-005 B2a, #47) :
--   - trame_<environnement>_migrator possède la base et applique les migrations (DDL) ;
--   - trame_<environnement>_api ne fait que du DML, dans les schémas créés par les migrations ;
--   - seuls ces deux rôles se connectent à la base trame_<environnement>.
--
-- Lancé par le superutilisateur, dans le conteneur PostgreSQL, avant la première migration. Le
-- script arrive sur l'entrée standard :
--   docker compose exec -T -e TRAME_ENVIRONMENT=staging -e TRAME_MIGRATOR_PASSWORD \
--     -e TRAME_API_PASSWORD postgres psql --no-psqlrc -U postgres -d postgres \
--     < infra/provisioning/postgres-environment.sql
-- Les mots de passe ne passent que par l'environnement. Rejouable : il crée ce qui manque, puis
-- réaligne mots de passe, attributs et droits.

\set ON_ERROR_STOP on
\set QUIET on

-- Le serveur ne journalise pas une requête en erreur de cette session : elle pourrait contenir un
-- mot de passe.
SET log_min_error_statement = panic;

\set environment ''
\set migrator_password ''
\set api_password ''
\getenv environment TRAME_ENVIRONMENT
\getenv migrator_password TRAME_MIGRATOR_PASSWORD
\getenv api_password TRAME_API_PASSWORD

-- Tout est vérifié avant la première création.
SELECT :'environment' IN ('staging', 'production') AS environment_is_known,
       :'migrator_password' <> '' AND :'api_password' <> '' AS passwords_are_set
\gset
\if :environment_is_known
\else
  DO $$ BEGIN RAISE EXCEPTION 'TRAME_ENVIRONMENT doit valoir staging ou production.'; END $$;
\endif
\if :passwords_are_set
\else
  DO $$ BEGIN RAISE EXCEPTION 'TRAME_MIGRATOR_PASSWORD et TRAME_API_PASSWORD sont requis.'; END $$;
\endif

SELECT 'trame_' || :'environment' AS database_name,
       'trame_' || :'environment' || '_migrator' AS migrator_role,
       'trame_' || :'environment' || '_api' AS api_role
\gset
SELECT NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'migrator_role') AS migrator_is_missing,
       NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'api_role') AS api_is_missing,
       NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database_name') AS database_is_missing
\gset

\if :migrator_is_missing
  CREATE ROLE :"migrator_role";
\endif
\if :api_is_missing
  CREATE ROLE :"api_role";
\endif
-- Réalignés à chaque passage, ce qui sert aussi à changer les mots de passe.
ALTER ROLE :"migrator_role" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
  NOREPLICATION NOBYPASSRLS PASSWORD :'migrator_password';
ALTER ROLE :"api_role" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
  NOREPLICATION NOBYPASSRLS PASSWORD :'api_password';

\if :database_is_missing
  CREATE DATABASE :"database_name" OWNER :"migrator_role";
\endif
ALTER DATABASE :"database_name" OWNER TO :"migrator_role";
-- Par défaut, tout rôle se connecte à toute base : ici, seuls le propriétaire et l'API le peuvent.
REVOKE ALL ON DATABASE :"database_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database_name" TO :"api_role";

\connect :database_name
-- Prisma tient l'historique des migrations dans public : l'API n'y accède pas.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
-- Les migrations créent elles-mêmes les schémas des contextes. L'API reçoit leurs droits à leur
-- création, sans liste de schémas à tenir ici : usage du schéma, et DML seulement sur les tables.
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_role" GRANT USAGE ON SCHEMAS TO :"api_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_role"
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"api_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_role"
  GRANT USAGE, SELECT ON SEQUENCES TO :"api_role";
