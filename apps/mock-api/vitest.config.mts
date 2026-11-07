// The API test files share one local database and each re-seeds it before every test, so they run one file at a time.
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { fileParallelism: false } });
