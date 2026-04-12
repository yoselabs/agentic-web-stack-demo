import { db } from "@aws/db";

export function createContext() {
  return { db };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
