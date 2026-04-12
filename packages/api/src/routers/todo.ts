import { z } from "zod";
import {
  completeTodo,
  createTodo,
  deleteTodo,
  listTodos,
  reorderTodos,
} from "../services/todo.js";
import { protectedProcedure, router } from "../trpc.js";

export const todoRouter = router({
  list: protectedProcedure.query(({ ctx }) => {
    return listTodos(ctx.db, ctx.session.user.id);
  }),
  create: protectedProcedure
    .input(z.object({ title: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        createTodo(tx, ctx.session.user.id, input.title),
      );
    }),
  complete: protectedProcedure
    .input(z.object({ id: z.string(), completed: z.boolean() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        completeTodo(tx, ctx.session.user.id, input.id, input.completed),
      );
    }),
  reorder: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        reorderTodos(tx, ctx.session.user.id, input.ids),
      );
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        deleteTodo(tx, ctx.session.user.id, input.id),
      );
    }),
});
