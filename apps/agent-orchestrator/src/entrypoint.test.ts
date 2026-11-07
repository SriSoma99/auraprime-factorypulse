// Regression test: the orchestrator process (DU-06) must not also start a DetectionService (APP-04, DU-04).
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

// Loads fresh modules after argv is set, so entrypoint guards evaluate against the simulated launch command.
async function launchAs(script: string, entry: string) {
  process.argv[1] = path.resolve(import.meta.dirname, script);
  const { DetectionService } = await import("@fp/intel-core/detector");
  const detection = vi.spyOn(DetectionService.prototype, "start").mockResolvedValue();
  const { AgentOrchestratorService } = await import("./service.js");
  const orchestrator = vi.spyOn(AgentOrchestratorService.prototype, "start").mockResolvedValue();
  await import(entry);
  return { detection, orchestrator };
}

describe("agent-orchestrator entrypoint", () => {
  it("importing the package starts no service, even when the process was launched from an index file", async () => {
    // index.ts was the start command that also started intel-core's DetectionService.
    const starts = await launchAs("index.ts", "./index.js");
    expect(starts.detection).not.toHaveBeenCalled();
    expect(starts.orchestrator).not.toHaveBeenCalled();
  }, timeout);

  it("the service entrypoint starts exactly one orchestrator and no DetectionService", async () => {
    const starts = await launchAs("main.ts", "./main.js");
    expect(starts.orchestrator).toHaveBeenCalledTimes(1);
    expect(starts.detection).not.toHaveBeenCalled();
  }, timeout);
});
