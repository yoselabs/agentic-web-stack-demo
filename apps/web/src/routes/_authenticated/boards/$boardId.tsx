import { Badge } from "@project/ui/components/badge";
import { Button } from "@project/ui/components/button";
import { Card, CardContent } from "@project/ui/components/card";
import { Input } from "@project/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ThumbsUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/boards/$boardId")({
  component: BoardDetailPage,
});

type CardCategory = "WENT_WELL" | "TO_IMPROVE" | "ACTION_ITEM";

interface BoardCard {
  id: string;
  text: string;
  category: CardCategory;
  boardId: string;
  userId: string;
  createdAt: string;
  voteCount: number;
  hasVoted: boolean;
}

interface BoardData {
  id: string;
  title: string;
  status: "OPEN" | "CLOSED";
  userId: string;
  createdAt: string;
  updatedAt: string;
  cards: BoardCard[];
}

const COLUMNS: { category: CardCategory; title: string }[] = [
  { category: "WENT_WELL", title: "Went Well" },
  { category: "TO_IMPROVE", title: "To Improve" },
  { category: "ACTION_ITEM", title: "Action Items" },
];

function BoardDetailPage() {
  const { trpc } = Route.useRouteContext();
  const { boardId } = Route.useParams();
  const queryClient = useQueryClient();

  const board = useQuery(trpc.board.get.queryOptions({ id: boardId }));

  const queryKey = trpc.board.get.queryFilter({ id: boardId }).queryKey;

  const closeBoard = useMutation(
    trpc.board.close.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
        toast.success("Board closed");
      },
      onError: () => toast.error("Failed to close board"),
    }),
  );

  const createCard = useMutation(
    trpc.card.create.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData(queryKey) as
          | BoardData
          | undefined;
        if (previous) {
          const optimisticCard: BoardCard = {
            id: `optimistic-${Date.now()}`,
            text: input.text,
            category: input.category as CardCategory,
            boardId: input.boardId,
            userId: "",
            createdAt: new Date().toISOString(),
            voteCount: 0,
            hasVoted: false,
          };
          queryClient.setQueryData(queryKey, {
            ...previous,
            cards: [...previous.cards, optimisticCard],
          });
        }
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData(queryKey, context.previous);
        }
        toast.error("Failed to add card");
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey });
      },
    }),
  );

  const deleteCard = useMutation(
    trpc.card.delete.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData(queryKey) as
          | BoardData
          | undefined;
        if (previous) {
          queryClient.setQueryData(queryKey, {
            ...previous,
            cards: previous.cards.filter((c: BoardCard) => c.id !== input.id),
          });
        }
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData(queryKey, context.previous);
        }
        toast.error("Failed to delete card");
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey });
      },
    }),
  );

  const toggleVote = useMutation(
    trpc.vote.toggle.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData(queryKey) as
          | BoardData
          | undefined;
        if (previous) {
          queryClient.setQueryData(queryKey, {
            ...previous,
            cards: previous.cards.map((c: BoardCard) =>
              c.id === input.cardId
                ? {
                    ...c,
                    hasVoted: !c.hasVoted,
                    voteCount: c.hasVoted ? c.voteCount - 1 : c.voteCount + 1,
                  }
                : c,
            ),
          });
        }
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData(queryKey, context.previous);
        }
        toast.error("Failed to toggle vote");
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey });
      },
    }),
  );

  if (board.isLoading) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (!board.data) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-bold mb-4">Board not found</h1>
        <Button asChild variant="outline">
          <Link to={"/boards" as string}>Back to boards</Link>
        </Button>
      </main>
    );
  }

  const isOpen = board.data.status === "OPEN";

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">{board.data.title}</h1>
          <Badge variant={isOpen ? "default" : "secondary"}>
            {isOpen ? "Open" : "Closed"}
          </Badge>
        </div>
        {isOpen && (
          <Button
            variant="outline"
            onClick={() => closeBoard.mutate({ id: boardId })}
            disabled={closeBoard.isPending}
          >
            Close Board
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {COLUMNS.map((column) => (
          <BoardColumn
            key={column.category}
            title={column.title}
            category={column.category}
            cards={board.data.cards.filter(
              (c) => c.category === column.category,
            )}
            isOpen={isOpen}
            boardId={boardId}
            onCreateCard={(text, category) =>
              createCard.mutate({ boardId, text, category })
            }
            onDeleteCard={(id) => deleteCard.mutate({ id })}
            onToggleVote={(cardId) => toggleVote.mutate({ cardId })}
          />
        ))}
      </div>
    </main>
  );
}

function BoardColumn({
  title,
  category,
  cards,
  isOpen,
  onCreateCard,
  onDeleteCard,
  onToggleVote,
}: {
  title: string;
  category: CardCategory;
  cards: BoardCard[];
  isOpen: boolean;
  boardId: string;
  onCreateCard: (text: string, category: CardCategory) => void;
  onDeleteCard: (id: string) => void;
  onToggleVote: (cardId: string) => void;
}) {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onCreateCard(text.trim(), category);
    setText("");
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {isOpen && (
        <form onSubmit={handleSubmit} className="flex gap-2 mb-3">
          <Input
            type="text"
            placeholder="Add a card..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
      )}
      <div className="space-y-2">
        {cards.map((card) => (
          <Card key={card.id}>
            <CardContent className="p-3">
              <p className="text-sm mb-2">{card.text}</p>
              <div className="flex items-center justify-between">
                <Button
                  variant={card.hasVoted ? "default" : "ghost"}
                  size="sm"
                  onClick={() => onToggleVote(card.id)}
                  disabled={!isOpen}
                  className="gap-1"
                >
                  <ThumbsUp className="h-3 w-3" />
                  {card.voteCount}
                </Button>
                {isOpen && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteCard(card.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
