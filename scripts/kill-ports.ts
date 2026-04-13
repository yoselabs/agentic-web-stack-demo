import { execSync } from "node:child_process";

const ports = process.argv.slice(2);
if (ports.length === 0) {
  console.error("Usage: kill-ports.ts <port> [port...]");
  process.exit(1);
}

for (const port of ports) {
  const parsed = Number.parseInt(port, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
    console.error(`Invalid port: ${port}`);
    continue;
  }
  try {
    const pids = execSync(`lsof -ti :${parsed}`, { encoding: "utf-8" }).trim();
    if (pids) {
      execSync(`kill ${pids}`);
      console.log(
        `Killed processes on port ${port}: ${pids.replace(/\n/g, ", ")}`,
      );
    }
  } catch {
    // No process on port — that's fine
  }
}
