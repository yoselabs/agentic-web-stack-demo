import { db } from "@project/db";

export async function createContext() {
  return { db };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
