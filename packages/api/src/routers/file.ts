import { z } from "zod";
import { deleteFileRecord, listFiles } from "../services/file.js";
import { deleteStoredFile } from "../services/storage.js";
import { protectedProcedure, router } from "../trpc.js";

// UPLOAD_DIR is validated at server startup by @project/env.
// Accessing via process.env here avoids coupling packages/api to @project/env.
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";

export const fileRouter = router({
  list: protectedProcedure.query(({ ctx }) => {
    return listFiles(ctx.db, ctx.session.user.id);
  }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const file = await ctx.db.$transaction((tx) =>
        deleteFileRecord(tx, ctx.session.user.id, input.id),
      );
      await deleteStoredFile(UPLOAD_DIR, file.storagePath);
      return file;
    }),
});
