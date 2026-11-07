// Spike TO-9 integration tests: TimescaleDB hypertable and pgvector similarity search.
// Verifies time-series hypertable queries, vector cosine distance searches, and forced RLS tenant isolation (invariant 4).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type pg from "pg";
import { config, appPool } from "./connect.ts";

let pool: pg.Pool;

async function asTenant<T>(tenant: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    if (tenant) await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
    const r = await fn(c);
    await c.query("ROLLBACK");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

beforeAll(() => {
  pool = appPool(config());
});

afterAll(async () => {
  await pool.end();
});

describe("TimescaleDB hypertable tel.telemetry_point (Spike TO-9)", () => {
  it("confirms tel.telemetry_point is a hypertable", async () => {
    const c = await pool.connect();
    try {
      const res = await c.query<{ hypertable_name: string }>(
        "SELECT hypertable_name FROM timescaledb_information.hypertables WHERE hypertable_schema = 'tel' AND hypertable_name = 'telemetry_point'"
      );
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]?.hypertable_name).toBe("telemetry_point");
    } finally {
      c.release();
    }
  });

  it("inserts telemetry points and enforces tenant isolation via RLS", async () => {
    const result = await asTenant("t-demo", async c => {
      // Find a sensor belonging to t-demo
      const s = (await c.query<{ id: string }>("SELECT id FROM ref.sensor LIMIT 1")).rows[0];
      expect(s).toBeDefined();

      const now = new Date();
      await c.query(
        "INSERT INTO tel.telemetry_point (tenant_id, sensor_id, ts, value, quality_flag, trust_at_ingest) VALUES ($1, $2, $3, $4, $5, $6)",
        ["t-demo", s!.id, now, 42.5, "good", 0.95]
      );

      const rows = (
        await c.query<{ value: string; quality_flag: string }>(
          "SELECT value, quality_flag FROM tel.telemetry_point WHERE sensor_id = $1 AND ts = $2",
          [s!.id, now]
        )
      ).rows;
      return rows;
    });

    expect(result).toHaveLength(1);
    expect(Number(result[0]!.value)).toBe(42.5);
    expect(result[0]!.quality_flag).toBe("good");

    // Other tenant sees 0 rows
    const otherResult = await asTenant("t-acme", async c => {
      return (await c.query("SELECT * FROM tel.telemetry_point")).rowCount;
    });
    expect(otherResult).toBe(0);
  });
});

describe("pgvector semantic search know.chunk_embedding (Spike TO-9)", () => {
  it("stores 384-dim embeddings and performs cosine nearest-neighbor search", async () => {
    // Generate deterministic 384-dim normalized test vectors
    function makeVec(val: number): string {
      const arr = new Array(384).fill(0);
      arr[0] = val;
      arr[1] = Math.sqrt(1 - val * val);
      return `[${arr.join(",")}]`;
    }

    const searchResults = await asTenant("t-demo", async c => {
      // Get an existing citation for foreign key
      const cit = (await c.query<{ id: string }>("SELECT id FROM know.citation LIMIT 1")).rows[0];
      expect(cit).toBeDefined();

      // Ensure clean state for test chunks
      await c.query("DELETE FROM know.chunk_embedding WHERE id IN ('emb-001', 'emb-002')");

      // Insert chunk 1 (aligned with query direction [1, 0, ...])
      await c.query(
        `INSERT INTO know.chunk_embedding (id, tenant_id, citation_id, chunk_index, content, model_id, model_version, embedding)
         VALUES ('emb-001', 't-demo', $1, 1, 'Coolant loop maintenance procedure', 'all-MiniLM-L6-v2', 'v1', $2)`,
        [cit!.id, makeVec(0.95)]
      );

      // Insert chunk 2 (orthogonal / distant)
      await c.query(
        `INSERT INTO know.chunk_embedding (id, tenant_id, citation_id, chunk_index, content, model_id, model_version, embedding)
         VALUES ('emb-002', 't-demo', $1, 2, 'Electrical grounding rules', 'all-MiniLM-L6-v2', 'v1', $2)`,
        [cit!.id, makeVec(0.1)]
      );

      // Query nearest neighbor using cosine distance operator <=>
      const queryVec = makeVec(1.0);
      const res = await c.query<{ id: string; content: string; distance: number }>(
        `SELECT id, content, (embedding <=> $1) as distance
         FROM know.chunk_embedding
         WHERE id IN ('emb-001', 'emb-002')
         ORDER BY embedding <=> $1 ASC LIMIT 2`,
        [queryVec]
      );
      return res.rows;
    });

    expect(searchResults).toHaveLength(2);
    // Nearest neighbor should be emb-001 with smaller distance
    expect(searchResults[0]!.id).toBe("emb-001");
    expect(searchResults[1]!.id).toBe("emb-002");
    expect(Number(searchResults[0]!.distance)).toBeLessThan(Number(searchResults[1]!.distance));

    // Other tenant sees nothing
    const otherResult = await asTenant("t-acme", async c => {
      return (await c.query("SELECT * FROM know.chunk_embedding WHERE id IN ('emb-001', 'emb-002')")).rowCount;
    });
    expect(otherResult).toBe(0);
  });
});

describe("Dead-letter queue tel.dead_letter (ING-9)", () => {
  it("records dead-letter messages and enforces tenant RLS", async () => {
    const rows = await asTenant("t-demo", async c => {
      await c.query(
        `INSERT INTO tel.dead_letter (id, tenant_id, topic, reason, payload, error_detail)
         VALUES ('dlq-001', 't-demo', 'tel.raw.demo.site1', 'schema_validation_failed', '{"bad": true}'::jsonb, 'Missing sensor_id')`
      );
      return (await c.query<{ id: string; reason: string }>("SELECT id, reason FROM tel.dead_letter WHERE id = 'dlq-001'")).rows;
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.reason).toBe("schema_validation_failed");

    const otherResult = await asTenant("t-acme", async c => {
      return (await c.query("SELECT * FROM tel.dead_letter")).rowCount;
    });
    expect(otherResult).toBe(0);
  });
});
