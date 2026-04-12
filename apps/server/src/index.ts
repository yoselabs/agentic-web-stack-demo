import { serve } from "@hono/node-server";
import { trpcServer } from "@hono/trpc-server";
import { appRouter, createContext } from "@project/api";
import { env } from "@project/env";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: () => createContext(),
  }),
);

app.get("/", (c) => c.text("Agentic Web Stack API"));

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
