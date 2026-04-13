import { Button } from "@project/ui/components/button";
import type { FileRecord } from "./types";

interface FileListProps {
  files: FileRecord[];
  onPreview: (id: string) => void;
  onDelete: (id: string) => void;
  getDownloadUrl: (id: string) => string;
  activePreviewId: string | null;
}

export function FileList({
  files,
  onPreview,
  onDelete,
  getDownloadUrl,
  activePreviewId,
}: FileListProps) {
  return (
    <ul className="space-y-2">
      {files.map((file) => (
        <li
          key={file.id}
          className="flex items-center justify-between p-3 border rounded-lg"
        >
          <div className="flex flex-col gap-1">
            <span className="font-medium">{file.originalName}</span>
            <span className="text-xs text-muted-foreground">
              {file.status === "processed" ? "Processed" : file.status} ·{" "}
              {file.rowCount != null ? `${file.rowCount} rows · ` : ""}
              {formatBytes(file.size)}
            </span>
          </div>
          <div className="flex gap-2">
            {file.status === "processed" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPreview(file.id)}
                >
                  {activePreviewId === file.id ? "Hide" : "Preview"}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={getDownloadUrl(file.id)}>Download</a>
                </Button>
              </>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(file.id)}
              aria-label={`Delete ${file.originalName}`}
            >
              Delete
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
