import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";

export const voteRouter = router({
  toggle: protectedProcedure
    .input(z.object({ cardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const card = await ctx.db.card.findFirst({
        where: { id: input.cardId },
        include: {
          board: { select: { userId: true, status: true } },
        },
      });
      if (
        !card ||
        card.board.userId !== ctx.session.user.id ||
        card.board.status !== "OPEN"
      ) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const existing = await ctx.db.vote.findUnique({
        where: {
          cardId_userId: {
            cardId: input.cardId,
            userId: ctx.session.user.id,
          },
        },
      });
      if (existing) {
        await ctx.db.vote.delete({ where: { id: existing.id } });
        return { voted: false };
      }
      await ctx.db.vote.create({
        data: { cardId: input.cardId, userId: ctx.session.user.id },
      });
      return { voted: true };
    }),
});
