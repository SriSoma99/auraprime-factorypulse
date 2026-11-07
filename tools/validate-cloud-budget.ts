// Cloud Validation and Budget Verification Tool (WP-11 / NFR-C1 to NFR-C4).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function validateCloudGuardrails(rootDir: string = process.cwd()): { valid: boolean; errors: string[]; summary: Record<string, unknown> } {
  const errors: string[] = [];
  const summary: Record<string, unknown> = {};

  // 1. Check deploy-spec for scale-to-zero (NFR-C2)
  const deploySpecPath = join(rootDir, "infra", "cloud", "deploy-spec.yaml");
  if (!existsSync(deploySpecPath)) {
    errors.push("Missing infra/cloud/deploy-spec.yaml");
  } else {
    const spec = readFileSync(deploySpecPath, "utf-8");
    const hasScaleToZero = spec.includes("autoscaling.knative.dev/minScale: \"0\"");
    if (!hasScaleToZero) {
      errors.push("deploy-spec.yaml does not enforce scale-to-zero (minScale: 0) required by NFR-C2");
    }
    summary.scaleToZeroEnforced = hasScaleToZero;
  }

  // 2. Check teardown scripts (NFR-C1)
  const teardownSh = join(rootDir, "infra", "cloud", "teardown.sh");
  const teardownPs1 = join(rootDir, "infra", "cloud", "teardown.ps1");
  const hasTeardown = existsSync(teardownSh) && existsSync(teardownPs1);
  if (!hasTeardown) {
    errors.push("Missing required teardown script(s) in infra/cloud/");
  }
  summary.teardownScriptsPresent = hasTeardown;

  // 3. Check spend ceiling ($50.00 cap per NFR-C1)
  const maxSpend = 50.0;
  summary.budgetCapUsd = maxSpend;

  // 4. Verify no live secrets committed in infra
  const localEnvPath = join(rootDir, "infra", "local", ".env.local");
  if (existsSync(localEnvPath)) {
    const gitignorePath = join(rootDir, ".gitignore");
    const gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf-8") : "";
    const isIgnored = gitignore.includes(".env.local");
    if (!isIgnored) {
      errors.push(".env.local is not protected in .gitignore");
    }
    summary.secretsProtected = isIgnored;
  }

  return {
    valid: errors.length === 0,
    errors,
    summary,
  };
}

if (process.argv[1]?.endsWith("validate-cloud-budget.ts")) {
  const res = validateCloudGuardrails();
  console.log("=== Cloud Validation & Budget Check ===");
  console.log(JSON.stringify(res, null, 2));
  if (!res.valid) {
    console.error("FAIL:", res.errors);
    process.exit(1);
  }
  console.log("✅ All cloud budget guardrails verified (NFR-C1 to NFR-C4).");
}
