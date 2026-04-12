import { Button } from "@project/ui/components/button";
import { Input } from "@project/ui/components/input";
import { Label } from "@project/ui/components/label";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/boards/new")({
  component: NewBoardPage,
});

function NewBoardPage() {
  const { trpc } = Route.useRouteContext();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");

  const createBoard = useMutation(
    trpc.board.create.mutationOptions({
      onSuccess: (board) => {
        toast.success("Board created");
        navigate({
          to: "/boards/$boardId",
          params: { boardId: board.id },
        });
      },
      onError: () => toast.error("Failed to create board"),
    }),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createBoard.mutate({ title: title.trim() });
  };

  return (
    <main className="max-w-lg mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <h1 className="text-3xl font-bold mb-6">New Retro Board</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="title">Board Title</Label>
          <Input
            id="title"
            type="text"
            placeholder="Sprint 42 Retro"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
        </div>
        <Button type="submit" disabled={createBoard.isPending || !title.trim()}>
          {createBoard.isPending ? "Creating..." : "Create Board"}
        </Button>
      </form>
    </main>
  );
}
