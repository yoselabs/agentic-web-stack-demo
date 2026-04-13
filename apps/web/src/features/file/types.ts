import type { AppRouter, inferRouterOutputs } from "@project/api";

type RouterOutput = inferRouterOutputs<AppRouter>;
export type FileRecord = RouterOutput["file"]["list"][number];

export interface FilePreviewData {
  headers: string[];
  rows: Record<string, string>[];
}
