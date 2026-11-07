export interface ApiKeyRecord {
  id: string;
  tenant_id: string;
  project_id: string | null;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  rate_limit_per_min: number;
  monthly_quota: number;
  quota_used: number;
  expires_at: string | null;
  revoked: boolean;
  created_at: string;
  last_used_at: string | null;
}

export interface CreateApiKeyRequest {
  name: string;
  projectId?: string;
  scopes: string[];
  rateLimitPerMin?: number;
  monthlyQuota?: number;
  expiresInDays?: number;
}

export interface CreatedApiKeyResponse {
  id: string;
  name: string;
  keyPrefix: string;
  secretKey: string;
  scopes: string[];
  rateLimitPerMin: number;
  monthlyQuota: number;
  expiresAt: string | null;
}

export interface UsageEventRecord {
  id: string;
  tenant_id: string;
  project_id: string | null;
  meter: string;
  quantity: number;
  trace_id: string | null;
  ts: string;
}

export interface WebhookEndpointRecord {
  id: string;
  tenant_id: string;
  url: string;
  secret_token: string;
  events: string[];
  active: boolean;
  created_at: string;
}

export interface WebhookDeliveryRecord {
  id: string;
  tenant_id: string;
  endpoint_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  signature: string;
  attempts: number;
  status: "pending" | "delivered" | "failed";
  response_status: number | null;
  last_attempt_at: string | null;
  created_at: string;
}

export interface PrincipalIdentity {
  id: string;
  tenantId: string;
  displayName: string;
  role: string;
  sessionType: "human" | "api_key" | "agent_token";
  scopes?: string[];
  apiKeyId?: string;
}

export class ProblemError extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    public readonly detail?: string
  ) {
    super(detail ?? title);
  }
}
