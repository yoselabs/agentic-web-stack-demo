import { Button } from "@project/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/boards/")({
  component: BoardsPage,
});

function BoardsPage() {
  const { trpc } = Route.useRouteContext();
  const boards = useQuery(trpc.board.list.queryOptions());

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Retro Boards</h1>
        <Link to="/boards/new">
          <Button>New Board</Button>
        </Link>
      </div>

      {boards.isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : boards.data?.length === 0 ? (
        <p className="text-muted-foreground">
          No boards yet. Create your first retro board!
        </p>
      ) : (
        <div className="space-y-3">
          {boards.data?.map((board) => (
            <Link
              key={board.id}
              to="/boards/$boardId"
              params={{ boardId: board.id }}
              className="block border rounded-lg p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{board.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {board._count.cards} cards &middot;{" "}
                    {new Date(board.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    board.status === "OPEN"
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {board.status === "OPEN" ? "Open" : "Closed"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
