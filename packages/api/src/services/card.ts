import type { CardCategory, Prisma, PrismaClient } from "@project/db";
import { TRPCError } from "@trpc/server";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function createCard(
  db: DbClient,
  userId: string,
  boardId: string,
  text: string,
  category: CardCategory,
) {
  const board = await db.board.findFirst({
    where: { id: boardId, userId, status: "OPEN" },
  });

  if (!board) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  return db.card.create({
    data: { text, category, boardId, userId },
  });
}

export async function deleteCard(db: DbClient, userId: string, cardId: string) {
  const card = await db.card.findFirst({
    where: { id: cardId, userId },
    include: { board: true },
  });

  if (!card || card.board.status !== "OPEN") {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  return db.card.delete({ where: { id: cardId } });
}

export async function toggleVote(db: DbClient, userId: string, cardId: string) {
  const card = await db.card.findFirst({
    where: { id: cardId },
    include: { board: true },
  });

  if (!card || card.board.userId !== userId || card.board.status !== "OPEN") {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  const existing = await db.vote.findUnique({
    where: { cardId_userId: { cardId, userId } },
  });

  if (existing) {
    await db.vote.delete({ where: { id: existing.id } });
    return { voted: false };
  }

  await db.vote.create({ data: { cardId, userId } });
  return { voted: true };
}
