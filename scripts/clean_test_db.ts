import { adminPool, config } from "../packages/db/src/connect.ts";

async function main() {
  const cfg = config();
  const pool = adminPool(cfg);
  const client = await pool.connect();
  try {
    await client.query("DELETE FROM intel.trust_assessment WHERE sensor_id = 'FT-401'");
    await client.query("DELETE FROM \"case\".work_order WHERE id = 'WO-SENS-FT-401'");
    await client.query("DELETE FROM \"case\".incident WHERE id = 'INC-SENS-FT-401'");
    await client.query("TRUNCATE gov.audit_event RESTART IDENTITY CASCADE");
    await client.query("TRUNCATE plat.usage_event, plat.webhook_delivery, plat.webhook_endpoint, plat.api_key, plat.project, gov.tool_grant, gov.tool_kill_switch RESTART IDENTITY CASCADE");
    await client.query(`GRANT INSERT, UPDATE, SELECT, DELETE ON intel.trust_assessment, intel.line_impact TO "${cfg.db.app_user}"`);
    console.log("Database cleaned successfully.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
