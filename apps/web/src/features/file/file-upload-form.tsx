import { Button } from "@project/ui/components/button";
import { Input } from "@project/ui/components/input";
import { useRef } from "react";

interface FileUploadFormProps {
  onUpload: (file: File) => void;
  isPending: boolean;
}

export function FileUploadForm({ onUpload, isPending }: FileUploadFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    onUpload(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
      <Input ref={inputRef} type="file" accept=".csv" className="flex-1" />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Uploading..." : "Upload"}
      </Button>
    </form>
  );
}
