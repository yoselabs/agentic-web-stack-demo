import { serve } from "@hono/node-server";
import { trpcServer } from "@hono/trpc-server";
import {
  appRouter,
  createContext,
  createFileRecord,
  getFileWithData,
  processCSV,
  readStoredFile,
  storeFile,
} from "@project/api";
import { auth } from "@project/auth";
import { db } from "@project/db";
import { env } from "@project/env";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

import { logger } from "./logger.js";

const app = new Hono();

// Request logging middleware
app.use(async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  logger.info(
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration,
    },
    "request completed",
  );
});

const frontendOrigin = env.CORS_ORIGIN;

app.use(
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", frontendOrigin],
      connectSrc: ["'self'", frontendOrigin],
      styleSrc: ["'self'", "'unsafe-inline'", frontendOrigin],
      imgSrc: ["'self'", "data:", frontendOrigin],
      fontSrc: ["'self'", frontendOrigin],
      frameAncestors: ["'none'"],
    },
    strictTransportSecurity: "max-age=63072000; includeSubDomains; preload",
    xFrameOptions: "DENY",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "strict-origin-when-cross-origin",
  }),
);

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

// Health check — before tRPC so it bypasses tRPC middleware
app.get("/health", async (c) => {
  let dbStatus: "ok" | "error" = "ok";
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "error";
  }

  const body = {
    status: dbStatus === "ok" ? ("ok" as const) : ("degraded" as const),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: dbStatus,
  };

  return c.json(body, dbStatus === "ok" ? 200 : 503);
});

// Better-Auth handler
app.on(["POST", "GET"], "/api/auth/**", (c) => {
  return auth.handler(c.req.raw);
});

// File upload — multipart (not tRPC, needs raw request body)
app.post("/api/files/upload", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const formData = await c.req.formData();
  const file = formData.get("file");
  if (!(file instanceof File))
    return c.json({ error: "No file provided" }, 400);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: "File too large (max 10 MB)" }, 413);
  }

  const isCSV =
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel" ||
    file.name.endsWith(".csv");
  if (!isCSV) {
    return c.json({ error: "Only CSV files are accepted" }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadDir = env.UPLOAD_DIR;
  const storageName = await storeFile(uploadDir, file.name, buffer);

  const record = await createFileRecord(db, {
    userId: session.user.id,
    filename: storageName,
    originalName: file.name,
    mimeType: file.type,
    size: file.size,
    storagePath: storageName,
  });

  const processed = await processCSV(db, record.id, buffer);
  return c.json(processed, 201);
});

// File download
app.get("/api/files/:id/download", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const fileRecord = await db.file.findFirst({
    where: { id: c.req.param("id"), userId: session.user.id },
  });
  if (!fileRecord) return c.json({ error: "File not found" }, 404);

  const buffer = await readStoredFile(env.UPLOAD_DIR, fileRecord.storagePath);

  return new Response(buffer, {
    headers: {
      "Content-Type": fileRecord.mimeType,
      "Content-Disposition": `attachment; filename="${fileRecord.originalName.replace(/["\\]/g, "_")}"`,
    },
  });
});

// File preview data
app.get("/api/files/:id/preview", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const fileRecord = await db.file.findFirst({
    where: { id: c.req.param("id"), userId: session.user.id },
  });
  if (!fileRecord) return c.json({ error: "File not found" }, 404);

  const buffer = await readStoredFile(env.UPLOAD_DIR, fileRecord.storagePath);
  const result = await getFileWithData(
    db,
    session.user.id,
    fileRecord.id,
    buffer,
  );

  return c.json({ headers: result.headers, rows: result.rows });
});

// tRPC handler — pass session into context
app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: async (_opts, c) => {
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });
      return createContext({ session });
    },
  }),
);

app.get("/", (c) => c.text("Agentic Web Stack API"));

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3001) }, (info) => {
  logger.info(`Server running at http://localhost:${info.port}`);
});
