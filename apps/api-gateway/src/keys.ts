import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import type { ApiKeyRecord, CreateApiKeyRequest, CreatedApiKeyResponse, PrincipalIdentity } from "./types.ts";

export class ApiKeyService {
  constructor(private readonly pool: Pool) {}

  async createApiKey(tenantId: string, req: CreateApiKeyRequest): Promise<CreatedApiKeyResponse> {
    const rawSecret = `fp_live_${randomBytes(24).toString("hex")}`;
    const keyPrefix = rawSecret.slice(0, 16);
    const keyHash = createHash("sha256").update(rawSecret).digest("hex");
    const keyId = `key_${randomBytes(8).toString("hex")}`;

    const expiresAt = req.expiresInDays
      ? new Date(Date.now() + req.expiresInDays * 86400 * 1000).toISOString()
      : null;

    const rateLimit = req.rateLimitPerMin ?? 60;
    const monthlyQuota = req.monthlyQuota ?? 10000;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

      await client.query(
        `INSERT INTO plat.api_key (
          id, tenant_id, project_id, name, key_prefix, key_hash, scopes,
          rate_limit_per_min, monthly_quota, quota_used, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, 0, $10)`,
        [
          keyId,
          tenantId,
          req.projectId ?? null,
          req.name,
          keyPrefix,
          keyHash,
          JSON.stringify(req.scopes),
          rateLimit,
          monthlyQuota,
          expiresAt
        ]
      );
      await client.query("COMMIT");

      return {
        id: keyId,
        name: req.name,
        keyPrefix,
        secretKey: rawSecret,
        scopes: req.scopes,
        rateLimitPerMin: rateLimit,
        monthlyQuota,
        expiresAt
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async authenticateApiKey(rawKey: string): Promise<{ key: ApiKeyRecord; principal: PrincipalIdentity } | null> {
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    // Lookup happens before tenant is known, so it runs via SECURITY DEFINER function plat.resolve_api_key
    const res = await this.pool.query<ApiKeyRecord>(
      `SELECT * FROM plat.resolve_api_key($1)`,
      [keyHash]
    );

    const key = res.rows[0];
    if (!key) return null;
    if (key.revoked) return null;
    if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) return null;

    // Update last_used_at with tenant isolation
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [key.tenant_id]);
      await client.query(
        "UPDATE plat.api_key SET last_used_at = now() WHERE id = $1",
        [key.id]
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    return {
      key,
      principal: {
        id: key.id,
        tenantId: key.tenant_id,
        displayName: key.name,
        role: "admin",
        sessionType: "api_key",
        scopes: key.scopes,
        apiKeyId: key.id
      }
    };
  }

  async revokeApiKey(tenantId: string, keyId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const res = await client.query(
        "UPDATE plat.api_key SET revoked = true WHERE id = $1",
        [keyId]
      );
      await client.query("COMMIT");
      return (res.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }

  async listApiKeys(tenantId: string): Promise<Omit<ApiKeyRecord, "key_hash">[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const res = await client.query<ApiKeyRecord>(
        "SELECT id, tenant_id, project_id, name, key_prefix, scopes, rate_limit_per_min, monthly_quota, quota_used, expires_at, revoked, created_at, last_used_at FROM plat.api_key ORDER BY created_at DESC"
      );
      await client.query("COMMIT");
      return res.rows;
    } finally {
      client.release();
    }
  }
}
