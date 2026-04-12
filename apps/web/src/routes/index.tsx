import { Link, createFileRoute } from "@tanstack/react-router";
import { useSession } from "#/lib/auth-client";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { data: session, isPending } = useSession();

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Agentic Web Stack</h1>
        <p className="text-lg text-gray-600 mb-6">
          TanStack Start + Hono + tRPC + Prisma + Better-Auth
        </p>
        {isPending ? (
          <p className="text-gray-400">Loading...</p>
        ) : session ? (
          <Link
            to="/dashboard"
            className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
          >
            Go to Dashboard
          </Link>
        ) : (
          <Link
            to="/login"
            className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
          >
            Sign In
          </Link>
        )}
      </div>
    </main>
  );
}
