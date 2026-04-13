import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

/** Resolve filename within uploadDir and verify it doesn't escape via traversal. */
function safePath(uploadDir: string, filename: string): string {
  const resolved = resolve(uploadDir, filename);
  const base = resolve(uploadDir);
  if (!resolved.startsWith(`${base}/`)) {
    throw new Error("Invalid file path");
  }
  return resolved;
}

export async function storeFile(
  uploadDir: string,
  originalName: string,
  data: Buffer,
): Promise<string> {
  await mkdir(uploadDir, { recursive: true });
  const ext = extname(originalName);
  const filename = `${randomUUID()}${ext}`;
  await writeFile(safePath(uploadDir, filename), data);
  return filename;
}

export function getStoragePath(uploadDir: string, filename: string): string {
  return safePath(uploadDir, filename);
}

export async function readStoredFile(
  uploadDir: string,
  filename: string,
): Promise<Buffer> {
  return readFile(safePath(uploadDir, filename));
}

export async function deleteStoredFile(
  uploadDir: string,
  filename: string,
): Promise<void> {
  await rm(safePath(uploadDir, filename), { force: true });
}
