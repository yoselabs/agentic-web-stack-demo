import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useSession } from "#/lib/auth-client";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return <MetaRedirect />;
  }

  return <Outlet />;
}

function MetaRedirect() {
  const navigate = Route.useNavigate();
  navigate({ to: "/login" });
  return null;
}
