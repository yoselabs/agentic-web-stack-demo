import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";

export const boardRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.board.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { cards: true } } },
    });
  }),

  create: protectedProcedure
    .input(z.object({ title: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.board.create({
        data: { title: input.title, userId: ctx.session.user.id },
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
              _count: { select: { votes: true } },
            },
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
          voteCount: card._count.votes,
          hasVoted: card.votes.some((v) => v.userId === ctx.session.user.id),
          votes: undefined,
          _count: undefined,
        })),
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
