import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@project/ui/components/table";
import type { FilePreviewData } from "./types";

interface FilePreviewProps {
  data: FilePreviewData;
  isLoading: boolean;
}

export function FilePreview({ data, isLoading }: FilePreviewProps) {
  if (isLoading) {
    return <p className="text-muted-foreground py-4">Loading preview...</p>;
  }

  return (
    <div className="border rounded-lg mt-4 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {data.headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => (
            <TableRow key={data.headers.map((h) => row[h] ?? "").join("\t")}>
              {data.headers.map((header) => (
                <TableCell key={header}>{row[header]}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
