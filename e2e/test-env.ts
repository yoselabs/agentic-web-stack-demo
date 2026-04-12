import { createHash } from "node:crypto";
import path from "node:path";

// Derive a stable test port from the project root directory.
// This allows multiple git worktrees to run tests in parallel
// without Docker container or port conflicts.
const ROOT = path.resolve(import.meta.dirname, "..");
const hash = createHash("md5").update(ROOT).digest("hex");
const portOffset = Number.parseInt(hash.slice(0, 4), 16) % 100; // 0-99

export const TEST_PORT = 5400 + portOffset;
export const TEST_CONTAINER = `agentic-postgres-test-${hash.slice(0, 8)}`;
export const TEST_DATABASE_URL = `postgresql://postgres:postgres@localhost:${TEST_PORT}/agentic_web_stack_test`;
export const PROJECT_ROOT = ROOT;
