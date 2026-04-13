import { boardRouter } from "./routers/board.js";
import { cardRouter } from "./routers/card.js";
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
  todo: todoRouter,
  board: boardRouter,
  card: cardRouter,
});

export type AppRouter = typeof appRouter;
