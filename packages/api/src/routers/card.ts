import { z } from "zod";
import { createCard, deleteCard, toggleVote } from "../services/card.js";
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
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        createCard(
          tx,
          ctx.session.user.id,
          input.boardId,
          input.text,
          input.category,
        ),
      );
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        deleteCard(tx, ctx.session.user.id, input.id),
      );
    }),
  vote: router({
    toggle: protectedProcedure
      .input(z.object({ cardId: z.string() }))
      .mutation(({ ctx, input }) => {
        return ctx.db.$transaction((tx) =>
          toggleVote(tx, ctx.session.user.id, input.cardId),
        );
      }),
  }),
});
