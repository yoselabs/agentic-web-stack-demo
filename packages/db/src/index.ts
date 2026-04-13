import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

// Re-export all generated types (enums, input types, Prisma namespace, PrismaClient, etc.)
// so consumers can `import { Prisma, MyEnum } from "@project/db"` without reaching into @prisma/client
export * from "@prisma/client";
