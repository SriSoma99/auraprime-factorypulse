// Window Aggregator for Stream Processor (APP-03).
// Computes rolling window statistics (min, max, mean, stddev) per sensor.
import type { WindowStats } from "./types.js";

interface TimestampedValue {
  ts: number;
  val: number;
}

export class WindowAggregator {
  private readonly windows = new Map<string, TimestampedValue[]>();

  constructor(
    private readonly maxPoints = 20,
    private readonly maxAgeMs = 300_000 // 5 minutes
  ) {}

  private key(tenantId: string, sensorId: string): string {
    return `${tenantId}:${sensorId}`;
  }

  public addPoint(tenantId: string, sensorId: string, val: number, tsIso: string): WindowStats {
    const k = this.key(tenantId, sensorId);
    let pts = this.windows.get(k);
    if (!pts) {
      pts = [];
      this.windows.set(k, pts);
    }

    const t = new Date(tsIso).getTime();
    pts.push({ ts: t, val });

    // Evict points exceeding maxAgeMs or maxPoints
    const cutoff = t - this.maxAgeMs;
    while (pts.length > 0 && pts[0]!.ts < cutoff) {
      pts.shift();
    }
    while (pts.length > this.maxPoints) {
      pts.shift();
    }

    return this.calculateStats(pts);
  }

  public getStats(tenantId: string, sensorId: string): WindowStats | null {
    const pts = this.windows.get(this.key(tenantId, sensorId));
    if (!pts || pts.length === 0) return null;
    return this.calculateStats(pts);
  }

  public clear(): void {
    this.windows.clear();
  }

  private calculateStats(pts: TimestampedValue[]): WindowStats {
    const n = pts.length;
    let min = pts[0]!.val;
    let max = pts[0]!.val;
    let sum = 0;

    for (let i = 0; i < n; i++) {
      const v = pts[i]!.val;
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }

    const mean = sum / n;
    let varianceSum = 0;
    for (let i = 0; i < n; i++) {
      varianceSum += Math.pow(pts[i]!.val - mean, 2);
    }
    const stddev = n > 1 ? Math.sqrt(varianceSum / (n - 1)) : 0;

    return {
      count: n,
      min: Number(min.toFixed(4)),
      max: Number(max.toFixed(4)),
      mean: Number(mean.toFixed(4)),
      stddev: Number(stddev.toFixed(4)),
    };
  }
}
