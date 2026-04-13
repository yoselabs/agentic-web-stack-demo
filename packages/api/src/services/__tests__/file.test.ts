import { db } from "@project/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createFileRecord,
  deleteFileRecord,
  getFileWithData,
  listFiles,
  processCSV,
} from "../file.js";

const TEST_USER_ID = "test-user-file-service";
const createdFileIds: string[] = [];

beforeAll(async () => {
  await db.file.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.user.deleteMany({ where: { id: TEST_USER_ID } });
  await db.user.create({
    data: {
      id: TEST_USER_ID,
      name: "File Test User",
      email: "test-file-service@example.com",
      emailVerified: false,
    },
  });
});

afterEach(async () => {
  if (createdFileIds.length > 0) {
    await db.file.deleteMany({ where: { id: { in: createdFileIds } } });
    createdFileIds.length = 0;
  }
});

afterAll(async () => {
  await db.file.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.user.delete({ where: { id: TEST_USER_ID } }).catch(() => {});
  await db.$disconnect();
});

describe("file service", () => {
  it("lists files (empty)", async () => {
    const files = await listFiles(db, TEST_USER_ID);
    expect(files).toEqual([]);
  });

  it("creates a file record", async () => {
    const file = await createFileRecord(db, {
      userId: TEST_USER_ID,
      filename: "abc123.csv",
      originalName: "data.csv",
      mimeType: "text/csv",
      size: 100,
      storagePath: "abc123.csv",
    });
    createdFileIds.push(file.id);

    expect(file.originalName).toBe("data.csv");
    expect(file.status).toBe("pending");
  });

  it("processes CSV and updates record", async () => {
    const csvData = Buffer.from(
      "name,email\nAlice,alice@test.com\nBob,bob@test.com",
    );
    const file = await createFileRecord(db, {
      userId: TEST_USER_ID,
      filename: "process-test.csv",
      originalName: "users.csv",
      mimeType: "text/csv",
      size: csvData.length,
      storagePath: "process-test.csv",
    });
    createdFileIds.push(file.id);

    const result = await processCSV(db, file.id, csvData);

    expect(result.status).toBe("processed");
    expect(result.rowCount).toBe(2);
  });

  it("returns parsed data with getFileWithData", async () => {
    const csvData = Buffer.from("name,age\nAlice,30\nBob,25");
    const file = await createFileRecord(db, {
      userId: TEST_USER_ID,
      filename: "data-test.csv",
      originalName: "people.csv",
      mimeType: "text/csv",
      size: csvData.length,
      storagePath: "data-test.csv",
    });
    createdFileIds.push(file.id);

    await processCSV(db, file.id, csvData);
    const result = await getFileWithData(db, TEST_USER_ID, file.id, csvData);

    expect(result.headers).toEqual(["name", "age"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ name: "Alice", age: "30" });
  });

  it("deletes a file record", async () => {
    const file = await createFileRecord(db, {
      userId: TEST_USER_ID,
      filename: "delete-test.csv",
      originalName: "remove.csv",
      mimeType: "text/csv",
      size: 50,
      storagePath: "delete-test.csv",
    });

    await deleteFileRecord(db, TEST_USER_ID, file.id);

    const files = await listFiles(db, TEST_USER_ID);
    expect(files.find((f) => f.id === file.id)).toBeUndefined();
  });
});
