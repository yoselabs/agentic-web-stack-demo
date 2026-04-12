import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/todos")({
  component: TodosPage,
});

function TodosPage() {
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState("");

  const todos = useQuery(trpc.todo.list.queryOptions());

  const createTodo = useMutation(
    trpc.todo.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.todo.list.queryFilter());
        setNewTitle("");
      },
    }),
  );

  const completeTodo = useMutation(
    trpc.todo.complete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.todo.list.queryFilter());
      },
    }),
  );

  const deleteTodo = useMutation(
    trpc.todo.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.todo.list.queryFilter());
      },
    }),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createTodo.mutate({ title: newTitle.trim() });
  };

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-6">Todos</h1>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="Add a todo..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="flex-1 px-3 py-2 border rounded"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
        >
          Add
        </button>
      </form>

      {todos.isLoading ? (
        <p className="text-gray-400">Loading...</p>
      ) : todos.data?.length === 0 ? (
        <p className="text-gray-500">No todos yet</p>
      ) : (
        <ul className="space-y-2">
          {todos.data?.map((todo) => (
            <li
              key={todo.id}
              className="flex items-center gap-3 p-3 border rounded"
            >
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() =>
                  completeTodo.mutate({
                    id: todo.id,
                    completed: !todo.completed,
                  })
                }
                className="h-4 w-4"
              />
              <span
                className={`flex-1 ${todo.completed ? "line-through text-gray-400" : ""}`}
              >
                {todo.title}
              </span>
              <button
                type="button"
                onClick={() => deleteTodo.mutate({ id: todo.id })}
                className="text-sm text-red-500 hover:text-red-700"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
