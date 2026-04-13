import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

export async function storeFile(
  uploadDir: string,
  originalName: string,
  data: Buffer,
): Promise<string> {
  await mkdir(uploadDir, { recursive: true });
  const ext = extname(originalName);
  const filename = `${randomUUID()}${ext}`;
  await writeFile(join(uploadDir, filename), data);
  return filename;
}

export function getStoragePath(uploadDir: string, filename: string): string {
  return join(uploadDir, filename);
}

export async function readStoredFile(
  uploadDir: string,
  filename: string,
): Promise<Buffer> {
  return readFile(join(uploadDir, filename));
}

export async function deleteStoredFile(
  uploadDir: string,
  filename: string,
): Promise<void> {
  await rm(join(uploadDir, filename), { force: true });
}
