import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileList } from "#/features/file/file-list";
import { FilePreview } from "#/features/file/file-preview";
import { FileUploadForm } from "#/features/file/file-upload-form";
import { useFiles } from "#/features/file/use-files";

export const Route = createFileRoute("/_authenticated/files")({
  component: FilesPage,
});

function FilesPage() {
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const {
    files,
    uploadFile,
    deleteFile,
    previewFileId,
    previewData,
    isPreviewLoading,
    loadPreview,
    getDownloadUrl,
  } = useFiles(trpc, queryClient);

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <h1 className="text-3xl font-bold mb-6">Files</h1>

      <FileUploadForm
        onUpload={(file) => uploadFile.mutate(file)}
        isPending={uploadFile.isPending}
      />

      {files.isPending ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : files.data?.length === 0 ? (
        <p className="text-muted-foreground">No files uploaded yet</p>
      ) : (
        <>
          <FileList
            files={files.data ?? []}
            onPreview={loadPreview}
            onDelete={(id) => deleteFile.mutate({ id })}
            getDownloadUrl={getDownloadUrl}
            activePreviewId={previewFileId}
          />
          {previewFileId && previewData && (
            <FilePreview data={previewData} isLoading={isPreviewLoading} />
          )}
        </>
      )}
    </main>
  );
}
