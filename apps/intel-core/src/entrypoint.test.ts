// Entrypoint test: the DetectionService (APP-04) starts once, and only when DU-04 is launched as a service.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";

// Fresh imports load the whole service graph, which is slow on a cold transform cache.
const timeout = 30_000;
const argv1 = process.argv[1]!;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.argv[1] = argv1;
  vi.restoreAllMocks();
});

// Loads fresh modules after argv is set, so any entrypoint guard evaluates against the simulated launch command.
async function launchAs(script: string, entry: string) {
  process.argv[1] = path.resolve(import.meta.dirname, script);
  const { DetectionService } = await import("./detector.js");
  const detection = vi.spyOn(DetectionService.prototype, "start").mockResolvedValue();
  await import(entry);
  return detection;
}

describe("intel-core entrypoint", () => {
  it("importing the package starts no DetectionService", async () => {
    const detection = await launchAs("index.ts", "./index.js");
    expect(detection).not.toHaveBeenCalled();
  }, timeout);

  it("the service entrypoint starts exactly one DetectionService", async () => {
    const detection = await launchAs("main.ts", "./main.js");
    expect(detection).toHaveBeenCalledTimes(1);
  }, timeout);
});
