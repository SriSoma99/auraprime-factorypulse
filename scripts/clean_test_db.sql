DELETE FROM intel.trust_assessment WHERE sensor_id = 'FT-401';
DELETE FROM "case".work_order WHERE id = 'WO-SENS-FT-401';
DELETE FROM "case".incident WHERE id = 'INC-SENS-FT-401';
GRANT INSERT, UPDATE, SELECT, DELETE ON intel.trust_assessment, intel.line_impact TO app_user;
