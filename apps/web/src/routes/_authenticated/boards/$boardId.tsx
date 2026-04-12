import { Button } from "@project/ui/components/button";
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

const CATEGORIES: { key: CardCategory; label: string; color: string }[] = [
  {
    key: "WENT_WELL",
    label: "Went Well",
    color:
      "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950",
  },
  {
    key: "TO_IMPROVE",
    label: "To Improve",
    color:
      "border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950",
  },
  {
    key: "ACTION_ITEM",
    label: "Action Items",
    color: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950",
  },
];

function BoardDetailPage() {
  const { boardId } = Route.useParams();
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();

  const boardQueryOptions = trpc.board.get.queryOptions({ id: boardId });
  const board = useQuery(boardQueryOptions);

  const createCard = useMutation(
    trpc.card.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(boardQueryOptions);
      },
      onError: () => toast.error("Failed to add card"),
    }),
  );

  const deleteCard = useMutation(
    trpc.card.delete.mutationOptions({
      onMutate: async (variables) => {
        await queryClient.cancelQueries(boardQueryOptions);
        const previous = queryClient.getQueryData(boardQueryOptions.queryKey);
        queryClient.setQueryData(
          boardQueryOptions.queryKey,
          (old: typeof previous) => {
            if (!old) return old;
            return {
              ...old,
              cards: old.cards.filter((c) => c.id !== variables.id),
            };
          },
        );
        return { previous };
      },
      onError: (_err, _vars, context) => {
        if (context?.previous) {
          queryClient.setQueryData(
            boardQueryOptions.queryKey,
            context.previous,
          );
        }
        toast.error("Failed to delete card");
      },
      onSettled: () => {
        queryClient.invalidateQueries(boardQueryOptions);
      },
    }),
  );

  const toggleVote = useMutation(
    trpc.vote.toggle.mutationOptions({
      onMutate: async (variables) => {
        await queryClient.cancelQueries(boardQueryOptions);
        const previous = queryClient.getQueryData(boardQueryOptions.queryKey);
        queryClient.setQueryData(
          boardQueryOptions.queryKey,
          (old: typeof previous) => {
            if (!old) return old;
            return {
              ...old,
              cards: old.cards.map((c) =>
                c.id === variables.cardId
                  ? {
                      ...c,
                      votedByMe: !c.votedByMe,
                      voteCount: c.votedByMe
                        ? c.voteCount - 1
                        : c.voteCount + 1,
                    }
                  : c,
              ),
            };
          },
        );
        return { previous };
      },
      onError: (_err, _vars, context) => {
        if (context?.previous) {
          queryClient.setQueryData(
            boardQueryOptions.queryKey,
            context.previous,
          );
        }
        toast.error("Failed to toggle vote");
      },
      onSettled: () => {
        queryClient.invalidateQueries(boardQueryOptions);
      },
    }),
  );

  const closeBoard = useMutation(
    trpc.board.close.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(boardQueryOptions);
        toast.success("Board closed");
      },
      onError: () => toast.error("Failed to close board"),
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
        <h1 className="text-2xl font-bold mb-4">Board not found</h1>
        <Link to="/boards">
          <Button variant="outline">Back to boards</Button>
        </Link>
      </main>
    );
  }

  const isOpen = board.data.status === "OPEN";

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{board.data.title}</h1>
          <span
            className={`text-xs font-medium px-2 py-1 rounded-full ${
              isOpen
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            {isOpen ? "Open" : "Closed"}
          </span>
        </div>
        <div className="flex gap-2">
          <Link to="/boards">
            <Button variant="outline">Back</Button>
          </Link>
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CATEGORIES.map((cat) => (
          <CategoryColumn
            key={cat.key}
            category={cat}
            cards={board.data.cards.filter((c) => c.category === cat.key)}
            isOpen={isOpen}
            onCreateCard={(text) =>
              createCard.mutate({
                boardId,
                text,
                category: cat.key,
              })
            }
            onDeleteCard={(id) => deleteCard.mutate({ id })}
            onToggleVote={(cardId) => toggleVote.mutate({ cardId })}
          />
        ))}
      </div>
    </main>
  );
}

function CategoryColumn({
  category,
  cards,
  isOpen,
  onCreateCard,
  onDeleteCard,
  onToggleVote,
}: {
  category: (typeof CATEGORIES)[number];
  cards: Array<{
    id: string;
    text: string;
    category: string;
    userId: string;
    voteCount: number;
    votedByMe: boolean;
  }>;
  isOpen: boolean;
  onCreateCard: (text: string) => void;
  onDeleteCard: (id: string) => void;
  onToggleVote: (cardId: string) => void;
}) {
  const [newText, setNewText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;
    onCreateCard(newText.trim());
    setNewText("");
  };

  return (
    <div className={`border rounded-lg p-4 ${category.color}`}>
      <h2 className="text-lg font-semibold mb-3">{category.label}</h2>

      {isOpen && (
        <form onSubmit={handleSubmit} className="mb-3">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder={`Add ${category.label.toLowerCase()}...`}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              maxLength={500}
              className="flex-1 bg-white dark:bg-gray-900"
            />
            <Button type="submit" size="sm">
              Add
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {cards.map((card) => (
          <div
            key={card.id}
            className="bg-white dark:bg-gray-900 border rounded p-3 flex items-start justify-between gap-2"
          >
            <p className="text-sm flex-1">{card.text}</p>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onToggleVote(card.id)}
                disabled={!isOpen}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                  card.votedByMe
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <ThumbsUp className="h-3 w-3" />
                {card.voteCount}
              </button>
              {isOpen && (
                <button
                  type="button"
                  onClick={() => onDeleteCard(card.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
