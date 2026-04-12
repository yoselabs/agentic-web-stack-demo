import { Prisma, type PrismaClient } from "@project/db";

type DbClient = PrismaClient | Prisma.TransactionClient;

async function lockActiveTodos(db: DbClient, userId: string): Promise<void> {
  await db.$queryRaw`
    SELECT id FROM "Todo"
    WHERE "userId" = ${userId} AND "completed" = false
    FOR UPDATE
  `;
}

async function shiftActivePositions(
  db: DbClient,
  userId: string,
): Promise<void> {
  await db.todo.updateMany({
    where: { userId, completed: false },
    data: { position: { increment: 1 } },
  });
}

export async function listTodos(db: DbClient, userId: string) {
  return db.todo.findMany({
    where: { userId },
    orderBy: [{ completed: "asc" }, { position: "asc" }],
  });
}

export async function createTodo(db: DbClient, userId: string, title: string) {
  await lockActiveTodos(db, userId);
  await shiftActivePositions(db, userId);
  return db.todo.create({
    data: { title, userId, position: 0 },
  });
}

export async function completeTodo(
  db: DbClient,
  userId: string,
  id: string,
  completed: boolean,
) {
  if (!completed) {
    await lockActiveTodos(db, userId);
    await shiftActivePositions(db, userId);
    return db.todo.update({
      where: { id, userId },
      data: { completed: false, position: 0 },
    });
  }
  return db.todo.update({
    where: { id, userId },
    data: { completed },
  });
}

export async function reorderTodos(
  db: DbClient,
  userId: string,
  ids: string[],
) {
  const pairs = ids.map((id, i) => Prisma.sql`(${id}::text, ${i}::integer)`);
  await db.$executeRaw`
    UPDATE "Todo" AS t
    SET "position" = d.new_position
    FROM (VALUES ${Prisma.join(pairs, ",")}) AS d(id, new_position)
    WHERE t.id = d.id AND t."userId" = ${userId}
  `;
}

export async function deleteTodo(db: DbClient, userId: string, id: string) {
  return db.todo.delete({
    where: { id, userId },
  });
}
