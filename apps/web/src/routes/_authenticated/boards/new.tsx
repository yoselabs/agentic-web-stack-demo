import { Button } from "@project/ui/components/button";
import { Input } from "@project/ui/components/input";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useBoardList } from "#/features/board/use-board-list";

export const Route = createFileRoute("/_authenticated/boards/new")({
  component: NewBoardPage,
});

function NewBoardPage() {
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { newTitle, setNewTitle, createBoard, handleSubmit } = useBoardList(
    trpc,
    queryClient,
  );

  return (
    <main className="max-w-xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <h1 className="text-3xl font-bold mb-6">New Board</h1>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="text"
          placeholder="Board title..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={createBoard.isPending}>
          {createBoard.isPending ? "Creating..." : "Create"}
        </Button>
      </form>
    </main>
  );
}
