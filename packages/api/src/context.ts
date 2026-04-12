import type { Session } from "@project/auth";
import { db } from "@project/db";

export async function createContext(opts?: { session: Session | null }) {
  return {
    db,
    session: opts?.session ?? null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
