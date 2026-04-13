import type { AppRouter } from "@project/api";
import { type QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { FilePreviewData } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export function useFiles(
  trpc: TRPCOptionsProxy<AppRouter>,
  queryClient: QueryClient,
) {
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<FilePreviewData | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const files = useQuery(trpc.file.list.queryOptions());

  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_URL}/api/files/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.file.list.queryFilter());
      toast.success("File uploaded");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteFile = useMutation(
    trpc.file.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.file.list.queryFilter());
        setPreviewFileId(null);
        setPreviewData(null);
        toast.success("File deleted");
      },
      onError: () => toast.error("Failed to delete file"),
    }),
  );

  const loadPreview = async (fileId: string) => {
    if (previewFileId === fileId) {
      setPreviewFileId(null);
      setPreviewData(null);
      return;
    }
    setIsPreviewLoading(true);
    setPreviewFileId(fileId);
    try {
      const res = await fetch(`${API_URL}/api/files/${fileId}/preview`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load preview");
      const data: FilePreviewData = await res.json();
      setPreviewData(data);
    } catch {
      toast.error("Failed to load preview");
      setPreviewFileId(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const downloadFile = async (fileId: string, filename: string) => {
    const res = await fetch(`${API_URL}/api/files/${fileId}/download`, {
      credentials: "include",
    });
    if (!res.ok) {
      toast.error("Download failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return {
    files,
    uploadFile,
    deleteFile,
    previewFileId,
    previewData,
    isPreviewLoading,
    loadPreview,
    downloadFile,
  };
}
