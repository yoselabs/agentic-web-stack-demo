import { z } from "zod";
import {
  closeBoard,
  createBoard,
  getBoard,
  listBoards,
} from "../services/board.js";
import { protectedProcedure, router } from "../trpc.js";

export const boardRouter = router({
  list: protectedProcedure.query(({ ctx }) => {
    return listBoards(ctx.db, ctx.session.user.id);
  }),
  create: protectedProcedure
    .input(z.object({ title: z.string().min(1).max(200) }))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        createBoard(tx, ctx.session.user.id, input.title),
      );
    }),
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return getBoard(ctx.db, ctx.session.user.id, input.id);
    }),
  close: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        closeBoard(tx, ctx.session.user.id, input.id),
      );
    }),
});
