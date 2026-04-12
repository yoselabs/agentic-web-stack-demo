import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";

export const todoRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.todo.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: [{ completed: "asc" }, { position: "asc" }],
    });
  }),
  create: protectedProcedure
    .input(z.object({ title: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.todo.updateMany({
        where: { userId: ctx.session.user.id, completed: false },
        data: { position: { increment: 1 } },
      });
      return ctx.db.todo.create({
        data: {
          title: input.title,
          userId: ctx.session.user.id,
          position: 0,
        },
      });
    }),
  complete: protectedProcedure
    .input(z.object({ id: z.string(), completed: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!input.completed) {
        await ctx.db.todo.updateMany({
          where: { userId: ctx.session.user.id, completed: false },
          data: { position: { increment: 1 } },
        });
        return ctx.db.todo.update({
          where: { id: input.id, userId: ctx.session.user.id },
          data: { completed: false, position: 0 },
        });
      }
      return ctx.db.todo.update({
        where: { id: input.id, userId: ctx.session.user.id },
        data: { completed: input.completed },
      });
    }),
  reorder: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.$transaction(
        input.ids.map((id, index) =>
          ctx.db.todo.update({
            where: { id, userId: ctx.session.user.id },
            data: { position: index },
          }),
        ),
      );
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.todo.delete({
        where: { id: input.id, userId: ctx.session.user.id },
      });
    }),
});
