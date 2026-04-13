import { Badge } from "@project/ui/components/badge";
import { Button } from "@project/ui/components/button";
import { Input } from "@project/ui/components/input";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useBoardDetail } from "#/features/board/use-board-detail";

export const Route = createFileRoute("/_authenticated/boards/$boardId")({
  component: BoardDetailPage,
});

const COLUMNS = [
  { category: "WENT_WELL" as const, title: "Went Well" },
  { category: "TO_IMPROVE" as const, title: "To Improve" },
  { category: "ACTION_ITEM" as const, title: "Action Items" },
];

function BoardDetailPage() {
  const { boardId } = Route.useParams();
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { board, createCard, deleteCard, toggleVote, closeBoard } =
    useBoardDetail(trpc, queryClient, boardId);

  if (board.isPending) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <p className="text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (board.error || !board.data) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <p className="text-muted-foreground">Board not found</p>
      </main>
    );
  }

  const data = board.data;
  const isClosed = data.status === "CLOSED";

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">{data.title}</h1>
          {isClosed && <Badge variant="secondary">Closed</Badge>}
        </div>
        {!isClosed && (
          <Button
            variant="outline"
            onClick={() => closeBoard.mutate({ id: boardId })}
            disabled={closeBoard.isPending}
          >
            Close Board
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {COLUMNS.map((col) => (
          <BoardColumn
            key={col.category}
            title={col.title}
            category={col.category}
            cards={data.cards.filter((c) => c.category === col.category)}
            isClosed={isClosed}
            boardId={boardId}
            onCreateCard={(text) =>
              createCard.mutate({
                boardId,
                text,
                category: col.category,
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

function BoardColumn({
  title,
  cards,
  isClosed,
  onCreateCard,
  onDeleteCard,
  onToggleVote,
}: {
  title: string;
  category: string;
  cards: Array<{
    id: string;
    text: string;
    voteCount: number;
    hasVoted: boolean;
  }>;
  isClosed: boolean;
  boardId: string;
  onCreateCard: (text: string) => void;
  onDeleteCard: (id: string) => void;
  onToggleVote: (cardId: string) => void;
}) {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onCreateCard(text.trim());
    setText("");
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>

      {!isClosed && (
        <form onSubmit={handleSubmit} className="flex gap-2">
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

      <div className="flex flex-col gap-2">
        {cards.map((card) => (
          <div
            key={card.id}
            className="rounded-lg border p-3 flex items-start justify-between gap-2"
          >
            <p className="text-sm flex-1">{card.text}</p>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant={card.hasVoted ? "default" : "outline"}
                size="sm"
                onClick={() => onToggleVote(card.id)}
                disabled={isClosed}
              >
                {card.hasVoted ? "Voted" : "Vote"} ({card.voteCount})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDeleteCard(card.id)}
                disabled={isClosed}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
