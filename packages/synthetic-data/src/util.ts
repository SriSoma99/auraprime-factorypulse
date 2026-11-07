import { createHash } from "node:crypto";

/** Small seeded PRNG so the dataset is identical on every machine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function minutesBefore(iso: string, minutes: number): string { return new Date(Date.parse(iso) - minutes * 60_000).toISOString(); }
export function minutesAfter(iso: string, minutes: number): string { return new Date(Date.parse(iso) + minutes * 60_000).toISOString(); }

/** Local-only bearer token for a seeded principal, derived from the seed (never a real credential). */
export function principalToken(seed: number, principalId: string): string {
  return "fpdev_" + createHash("sha256").update(`${seed}:${principalId}`).digest("hex").slice(0, 32);
}
export function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
