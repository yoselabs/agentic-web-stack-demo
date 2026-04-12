import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";

export const boardRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.board.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { cards: true } },
      },
    });
  }),

  create: protectedProcedure
    .input(z.object({ title: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.board.create({
        data: {
          title: input.title,
          userId: ctx.session.user.id,
        },
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const board = await ctx.db.board.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        include: {
          cards: {
            orderBy: { createdAt: "asc" },
            include: {
              votes: { select: { userId: true } },
            },
          },
        },
      });

      if (!board) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const userId = ctx.session.user.id;
      const cards = board.cards.map((card) => ({
        id: card.id,
        text: card.text,
        category: card.category,
        boardId: card.boardId,
        userId: card.userId,
        createdAt: card.createdAt,
        voteCount: card.votes.length,
        votedByMe: card.votes.some((v) => v.userId === userId),
      }));

      return {
        id: board.id,
        title: board.title,
        status: board.status,
        userId: board.userId,
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
        cards,
      };
    }),

  close: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const board = await ctx.db.board.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
      });

      if (!board) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return ctx.db.board.update({
        where: { id: input.id },
        data: { status: "CLOSED" },
      });
    }),
});
