import type { Prisma, PrismaClient } from "@project/db";
import { TRPCError } from "@trpc/server";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function listBoards(db: DbClient, userId: string) {
  return db.board.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { cards: true } } },
  });
}

export async function createBoard(db: DbClient, userId: string, title: string) {
  return db.board.create({
    data: { title, userId },
  });
}

export async function getBoard(db: DbClient, userId: string, boardId: string) {
  const board = await db.board.findFirst({
    where: { id: boardId, userId },
    include: {
      cards: {
        include: { votes: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!board) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  return {
    ...board,
    cards: board.cards.map((card) => ({
      ...card,
      voteCount: card.votes.length,
      hasVoted: card.votes.some((v) => v.userId === userId),
      votes: undefined,
    })),
  };
}

export async function closeBoard(
  db: DbClient,
  userId: string,
  boardId: string,
) {
  const board = await db.board.findFirst({
    where: { id: boardId, userId },
  });

  if (!board) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  return db.board.update({
    where: { id: boardId },
    data: { status: "CLOSED" },
  });
}
