import type { AppRouter } from "@project/api";
import { type QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { useState } from "react";
import { toast } from "sonner";

export function useBoardList(
  trpc: TRPCOptionsProxy<AppRouter>,
  queryClient: QueryClient,
) {
  const [newTitle, setNewTitle] = useState("");
  const navigate = useNavigate();

  const boards = useQuery(trpc.board.list.queryOptions());

  const createBoard = useMutation(
    trpc.board.create.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries(trpc.board.list.queryFilter());
        setNewTitle("");
        navigate({ to: "/boards/$boardId", params: { boardId: data.id } });
      },
      onError: () => toast.error("Failed to create board"),
    }),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createBoard.mutate({ title: newTitle.trim() });
  };

  return {
    boards,
    newTitle,
    setNewTitle,
    createBoard,
    handleSubmit,
  };
}
