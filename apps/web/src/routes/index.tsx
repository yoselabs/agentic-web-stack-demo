import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { trpc } = Route.useRouteContext();
  const hello = useQuery(trpc.hello.queryOptions());

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Agentic Web Stack</h1>
        <p className="text-lg text-gray-600">
          {hello.isLoading
            ? "Loading..."
            : (hello.data?.message ?? "Failed to load")}
        </p>
      </div>
    </main>
  );
}
