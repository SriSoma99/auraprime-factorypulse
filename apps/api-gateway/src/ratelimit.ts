export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
  reason?: "rate_limit_exceeded" | "monthly_quota_exceeded";
}

export class RateLimiter {
  private windows = new Map<string, { count: number; windowStart: number }>();

  checkRateLimit(keyId: string, limitPerMin: number, quotaUsed: number, monthlyQuota: number): RateLimitResult {
    // 1. Check monthly quota
    if (quotaUsed >= monthlyQuota) {
      return {
        allowed: false,
        remaining: 0,
        resetSeconds: 86400,
        reason: "monthly_quota_exceeded"
      };
    }

    // 2. Check per-minute sliding window
    const now = Date.now();
    const entry = this.windows.get(keyId);

    if (!entry || now - entry.windowStart >= 60000) {
      this.windows.set(keyId, { count: 1, windowStart: now });
      return {
        allowed: true,
        remaining: limitPerMin - 1,
        resetSeconds: 60
      };
    }

    if (entry.count >= limitPerMin) {
      const resetSeconds = Math.ceil((entry.windowStart + 60000 - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetSeconds: Math.max(1, resetSeconds),
        reason: "rate_limit_exceeded"
      };
    }

    entry.count += 1;
    const resetSeconds = Math.ceil((entry.windowStart + 60000 - now) / 1000);
    return {
      allowed: true,
      remaining: limitPerMin - entry.count,
      resetSeconds: Math.max(1, resetSeconds)
    };
  }
}
