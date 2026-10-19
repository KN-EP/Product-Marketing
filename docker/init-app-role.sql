-- Least privilege: the application connects as pmm_app, not as the owner.
-- Migrations run as pmm_admin (MIGRATION_DATABASE_URL); the app role gets DML only.
CREATE ROLE pmm_app LOGIN PASSWORD 'pmm_app_dev';
GRANT CONNECT ON DATABASE pmm_os TO pmm_app;
GRANT USAGE ON SCHEMA public TO pmm_app;
ALTER DEFAULT PRIVILEGES FOR ROLE pmm_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pmm_app;
ALTER DEFAULT PRIVILEGES FOR ROLE pmm_admin IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO pmm_app;
