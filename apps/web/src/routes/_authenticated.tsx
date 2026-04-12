import {
  Link,
  Outlet,
  createFileRoute,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { signOut, useSession } from "#/lib/auth-client";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isPending && !session) {
      navigate({ to: "/login" });
    }
  }, [isPending, session, navigate]);

  if (isPending || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen">
      <nav className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold">Agentic Web Stack</span>
          <Link
            to="/dashboard"
            className="text-sm text-gray-600 hover:text-gray-900"
            activeProps={{ className: "text-sm font-semibold text-gray-900" }}
          >
            Dashboard
          </Link>
          <Link
            to="/todos"
            className="text-sm text-gray-600 hover:text-gray-900"
            activeProps={{ className: "text-sm font-semibold text-gray-900" }}
          >
            Todos
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            {session.user.name ?? session.user.email}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-sm px-3 py-1 border rounded hover:bg-gray-50"
          >
            Sign Out
          </button>
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
