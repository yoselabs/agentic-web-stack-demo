import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { signOut, useSession } from "#/lib/auth-client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: session } = useSession();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Dashboard</h1>
        <p className="text-lg text-gray-600 mb-6">
          Welcome, {session?.user.name ?? session?.user.email}
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
        >
          Sign Out
        </button>
      </div>
    </main>
  );
}
