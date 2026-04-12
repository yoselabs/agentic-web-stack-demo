import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";

export const cardRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        boardId: z.string(),
        text: z.string().min(1).max(500),
        category: z.enum(["WENT_WELL", "TO_IMPROVE", "ACTION_ITEM"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const board = await ctx.db.board.findFirst({
        where: {
          id: input.boardId,
          userId: ctx.session.user.id,
          status: "OPEN",
        },
      });

      if (!board) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return ctx.db.card.create({
        data: {
          text: input.text,
          category: input.category,
          boardId: input.boardId,
          userId: ctx.session.user.id,
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const card = await ctx.db.card.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        include: { board: { select: { status: true } } },
      });

      if (!card || card.board.status !== "OPEN") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return ctx.db.card.delete({
        where: { id: input.id },
      });
    }),
});
