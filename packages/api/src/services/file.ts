import type { Prisma, PrismaClient } from "@project/db";
import Papa from "papaparse";

type DbClient = PrismaClient | Prisma.TransactionClient;

interface CreateFileInput {
  userId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
}

export async function listFiles(db: DbClient, userId: string) {
  return db.file.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createFileRecord(db: DbClient, input: CreateFileInput) {
  return db.file.create({ data: input });
}

export async function processCSV(db: DbClient, fileId: string, data: Buffer) {
  const text = data.toString("utf-8");
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });

  return db.file.update({
    where: { id: fileId },
    data: {
      status: "processed",
      rowCount: parsed.data.length,
    },
  });
}

export async function getFileWithData(
  db: DbClient,
  userId: string,
  fileId: string,
  data: Buffer,
) {
  const file = await db.file.findFirstOrThrow({
    where: { id: fileId, userId },
  });

  const text = data.toString("utf-8");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  return {
    ...file,
    headers: parsed.meta.fields ?? [],
    rows: parsed.data,
  };
}

export async function deleteFileRecord(
  db: DbClient,
  userId: string,
  fileId: string,
) {
  return db.file.delete({ where: { id: fileId, userId } });
}
