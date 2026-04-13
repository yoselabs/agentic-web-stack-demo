export { appRouter, type AppRouter } from "./router.js";
export { createContext, type Context } from "./context.js";
export { router, publicProcedure, protectedProcedure } from "./trpc.js";

export {
  createFileRecord,
  processCSV,
  getFileWithData,
} from "./services/file.js";
export {
  storeFile,
  readStoredFile,
  deleteStoredFile,
  getStoragePath,
} from "./services/storage.js";

// Type inference for frontend data contracts
// Usage: type Todo = RouterOutput['todo']['list'][number]
export type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
