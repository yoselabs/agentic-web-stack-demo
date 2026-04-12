export { appRouter, type AppRouter } from "./router.js";
export { createContext, type Context } from "./context.js";
export { router, publicProcedure, protectedProcedure } from "./trpc.js";

// Re-export for frontend type inference: type Todo = RouterOutput['todo']['list'][number]
export type { inferRouterOutputs } from "@trpc/server";
