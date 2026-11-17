-- Fixture de test uniquement, jamais utilisée pour provisionner staging/prod. Mêmes droits que le
-- provisionnement (infra/provisioning/postgres-environment.sql) : les migrations créent les schémas
-- des contextes, et l'API reçoit leurs droits à leur création, sans liste de schémas à tenir ici.
CREATE ROLE trame_api LOGIN PASSWORD 'trame-api-test-only'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON DATABASE trame FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE trame GRANT USAGE ON SCHEMAS TO trame_api;
ALTER DEFAULT PRIVILEGES FOR ROLE trame
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trame_api;
ALTER DEFAULT PRIVILEGES FOR ROLE trame GRANT USAGE, SELECT ON SEQUENCES TO trame_api;
