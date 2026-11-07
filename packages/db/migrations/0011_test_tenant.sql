-- Migration 0011: Dedicated test tenant for isolated integration test runs without cross-talk with seeded demo data.
INSERT INTO plat.tenant (id, name, edition)
VALUES ('t-test', 'Automated Test Tenant', 'full')
ON CONFLICT (id) DO NOTHING;
