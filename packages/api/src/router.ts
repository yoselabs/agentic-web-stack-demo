import { todoRouter } from "./routers/todo.js";
import { router } from "./trpc.js";

export const appRouter = router({
  todo: todoRouter,
});

export type AppRouter = typeof appRouter;
