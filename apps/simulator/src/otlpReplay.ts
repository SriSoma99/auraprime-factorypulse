// OTLP replay helpers (ING-13, SIM-1); the command is otlpReplayCli.ts.

/** Returns a copy of an OTLP metrics payload with every data point stamped at `at`. */
export function restamp(payload: unknown, at: Date): unknown {
  const nano = `${BigInt(at.getTime()) * 1_000_000n}`;
  return JSON.parse(JSON.stringify(payload), (k, v) => (k === "timeUnixNano" ? nano : v));
}
