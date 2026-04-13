import { existsSync, mkdirSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteStoredFile, getStoragePath, storeFile } from "../storage.js";

const TEST_DIR = join(process.cwd(), ".test-uploads");

beforeAll(() => {
  if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("storage service", () => {
  it("stores a buffer and returns the storage path", async () => {
    const data = Buffer.from("hello,world\na,b");
    const path = await storeFile(TEST_DIR, "test.csv", data);

    expect(path).toMatch(/\.csv$/);
    const content = await readFile(join(TEST_DIR, path), "utf-8");
    expect(content).toBe("hello,world\na,b");
  });

  it("generates unique filenames to avoid collisions", async () => {
    const data = Buffer.from("data");
    const path1 = await storeFile(TEST_DIR, "same.csv", data);
    const path2 = await storeFile(TEST_DIR, "same.csv", data);

    expect(path1).not.toBe(path2);
  });

  it("returns full path via getStoragePath", () => {
    const full = getStoragePath(TEST_DIR, "abc123.csv");
    expect(full).toBe(join(TEST_DIR, "abc123.csv"));
  });

  it("deletes a stored file", async () => {
    const data = Buffer.from("to-delete");
    const path = await storeFile(TEST_DIR, "delete-me.csv", data);

    await deleteStoredFile(TEST_DIR, path);
    expect(existsSync(join(TEST_DIR, path))).toBe(false);
  });
});
