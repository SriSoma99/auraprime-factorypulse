// Build-time configuration passed from the config schema by `pnpm local:init` (app.* keys, doc/config/keys.md).
// EXPO_PUBLIC_* must be referenced literally so Expo can inline them.
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set; run pnpm local:init`);
  return value;
}
export const env = {
  apiBaseUrl: required("EXPO_PUBLIC_FP_API_BASE_URL", process.env.EXPO_PUBLIC_FP_API_BASE_URL),
  pollIntervalMs: Number(required("EXPO_PUBLIC_FP_POLL_INTERVAL_MS", process.env.EXPO_PUBLIC_FP_POLL_INTERVAL_MS)),
};
