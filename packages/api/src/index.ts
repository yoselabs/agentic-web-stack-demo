export { appRouter, type AppRouter } from "./router.js";
export { createContext, type Context } from "./context.js";
export { router, publicProcedure, protectedProcedure } from "./trpc.js";

// Type inference for frontend data contracts
export type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
