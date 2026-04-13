import type { AppRouter, inferRouterOutputs } from "@project/api";
import { type QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";

type RouterOutput = inferRouterOutputs<AppRouter>;
type BoardData = RouterOutput["board"]["get"];
type CardCategory = "WENT_WELL" | "TO_IMPROVE" | "ACTION_ITEM";

export function useBoardDetail(
  trpc: TRPCOptionsProxy<AppRouter>,
  queryClient: QueryClient,
  boardId: string,
) {
  const queryOptions = trpc.board.get.queryOptions({ id: boardId });

  const board = useQuery(queryOptions);

  const createCard = useMutation(
    trpc.card.create.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries(
          trpc.board.get.queryFilter({ id: boardId }),
        );
        const previous = queryClient.getQueryData<BoardData>(
          queryOptions.queryKey,
        );
        queryClient.setQueryData<BoardData>(queryOptions.queryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            cards: [
              ...old.cards,
              {
                id: `temp-${Date.now()}`,
                text: input.text,
                category: input.category as CardCategory,
                boardId,
                userId: old.userId,
                createdAt: new Date().toISOString(),
                voteCount: 0,
                hasVoted: false,
              },
            ],
          };
        });
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData<BoardData>(
            queryOptions.queryKey,
            context.previous,
          );
        }
        toast.error("Failed to add card");
      },
      onSettled: () => {
        queryClient.invalidateQueries(
          trpc.board.get.queryFilter({ id: boardId }),
        );
      },
    }),
  );

  const deleteCard = useMutation(
    trpc.card.delete.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries(
          trpc.board.get.queryFilter({ id: boardId }),
        );
        const previous = queryClient.getQueryData<BoardData>(
          queryOptions.queryKey,
        );
        queryClient.setQueryData<BoardData>(queryOptions.queryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            cards: old.cards.filter((c) => c.id !== input.id),
          };
        });
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData<BoardData>(
            queryOptions.queryKey,
            context.previous,
          );
        }
        toast.error("Failed to delete card");
      },
      onSettled: () => {
        queryClient.invalidateQueries(
          trpc.board.get.queryFilter({ id: boardId }),
        );
      },
    }),
  );

  const toggleVote = useMutation(
    trpc.card.vote.toggle.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries(
          trpc.board.get.queryFilter({ id: boardId }),
        );
        const previous = queryClient.getQueryData<BoardData>(
          queryOptions.queryKey,
        );
        queryClient.setQueryData<BoardData>(queryOptions.queryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            cards: old.cards.map((c) =>
              c.id === input.cardId
                ? {
                    ...c,
                    hasVoted: !c.hasVoted,
                    voteCount: c.hasVoted ? c.voteCount - 1 : c.voteCount + 1,
                  }
                : c,
            ),
          };
        });
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData<BoardData>(
            queryOptions.queryKey,
            context.previous,
          );
        }
        toast.error("Failed to update vote");
      },
      onSettled: () => {
        queryClient.invalidateQueries(
          trpc.board.get.queryFilter({ id: boardId }),
        );
      },
    }),
  );

  const closeBoard = useMutation(
    trpc.board.close.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.board.get.queryFilter({ id: boardId }),
        );
        queryClient.invalidateQueries(trpc.board.list.queryFilter());
        toast.success("Board closed");
      },
      onError: () => toast.error("Failed to close board"),
    }),
  );

  return {
    board,
    createCard,
    deleteCard,
    toggleVote,
    closeBoard,
  };
}
