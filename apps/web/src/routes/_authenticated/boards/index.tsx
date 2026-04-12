import { Badge } from "@project/ui/components/badge";
import { Button } from "@project/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@project/ui/components/card";
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
        <h1 className="text-3xl font-bold">Boards</h1>
        <Button asChild>
          <Link to={"/boards/new" as string}>New Board</Link>
        </Button>
      </div>

      {boards.isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : boards.data?.length === 0 ? (
        <p className="text-muted-foreground">
          No boards yet. Create your first retro board!
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {boards.data?.map((board) => (
            <Link key={board.id} to={`/boards/${board.id}` as string}>
              <Card className="hover:border-foreground/20 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-lg">{board.title}</CardTitle>
                  <Badge
                    variant={board.status === "OPEN" ? "default" : "secondary"}
                  >
                    {board.status === "OPEN" ? "Open" : "Closed"}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {board._count.cards}{" "}
                    {board._count.cards === 1 ? "card" : "cards"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
