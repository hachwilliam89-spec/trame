-- Fixture de test uniquement, jamais utilisée pour provisionner staging/prod.
CREATE ROLE trame_api LOGIN PASSWORD 'trame-api-test-only'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON DATABASE trame FROM PUBLIC;
CREATE SCHEMA organization AUTHORIZATION trame;
CREATE SCHEMA scheduling AUTHORIZATION trame;
GRANT USAGE ON SCHEMA organization, scheduling TO trame_api;
ALTER DEFAULT PRIVILEGES FOR ROLE trame IN SCHEMA organization, scheduling
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trame_api;
