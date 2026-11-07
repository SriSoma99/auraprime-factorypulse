import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** Walk up from a start directory to the folder holding pnpm-workspace.yaml. */
export function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`repository root not found above ${start}`);
    dir = parent;
  }
}
