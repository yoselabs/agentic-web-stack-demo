export { appRouter, type AppRouter } from "./router.js";
export { createContext, type Context } from "./context.js";
export { router, publicProcedure, protectedProcedure } from "./trpc.js";

// Type inference for frontend data contracts
// Usage: type Todo = RouterOutput['todo']['list'][number]
export type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
