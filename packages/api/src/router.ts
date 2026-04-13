import { fileRouter } from "./routers/file.js";
import { todoRouter } from "./routers/todo.js";
import { protectedProcedure, publicProcedure, router } from "./trpc.js";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => "OK"),
  hello: publicProcedure.query(() => ({
    message: "Hello from tRPC!",
  })),
  me: protectedProcedure.query(({ ctx }) => ({
    user: ctx.session.user,
  })),
  file: fileRouter,
  todo: todoRouter,
});

export type AppRouter = typeof appRouter;
