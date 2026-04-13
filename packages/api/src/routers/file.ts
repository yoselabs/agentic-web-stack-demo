import { z } from "zod";
import { deleteFileRecord, listFiles } from "../services/file.js";
import { deleteStoredFile } from "../services/storage.js";
import { protectedProcedure, router } from "../trpc.js";

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
      const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
      await deleteStoredFile(uploadDir, file.storagePath);
      return file;
    }),
});
