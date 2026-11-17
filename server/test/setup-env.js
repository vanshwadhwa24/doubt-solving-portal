// Runs before any test module loads: point the app at the test database.
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://portal:portal@localhost:5432/doubt_portal_test';
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/doubt-portal-test-uploads';
