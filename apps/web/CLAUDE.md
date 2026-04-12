# apps/web — TanStack Start Frontend

## Adding a New Page

1. Create a route file in `src/routes/`:
   - Public page: `src/routes/about.tsx`
   - Authenticated page: `src/routes/_authenticated/settings.tsx`
2. Export `Route` using `createFileRoute`
3. The route tree regenerates automatically on `vite dev`

### Public page

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

function AboutPage() {
  return <main>About</main>;
}
```

### Authenticated page

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  // ctx.session is guaranteed non-null inside _authenticated
  return <main>Settings</main>;
}
```

Pages under `_authenticated/` are protected by the layout route's auth guard.

## Using tRPC Data

Access tRPC via route context, use with React Query hooks:

```tsx
function MyComponent() {
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();

  // Query
  const data = useQuery(trpc.todo.list.queryOptions());

  // Mutation with cache invalidation
  const createTodo = useMutation(
    trpc.todo.create.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.todo.list.queryFilter()),
    }),
  );
}
```

## Auth Client

Import from `#/lib/auth-client`:

```tsx
import { useSession, signIn, signUp, signOut } from "#/lib/auth-client";
```

- `useSession()` — returns `{ data: session, isPending }`
- `signIn.email({ email, password })` — sign in
- `signUp.email({ email, password, name })` — sign up
- `signOut()` — sign out (returns Promise)

## File Structure

- `src/router.tsx` — router factory, tRPC client, QueryClient
- `src/routes/__root.tsx` — HTML shell, QueryClientProvider
- `src/routes/_authenticated.tsx` — auth guard layout (redirects to /login if not signed in)
- `src/routes/_authenticated/*.tsx` — protected pages
- `src/routes/*.tsx` — public pages
- `src/lib/auth-client.ts` — Better-Auth React client
- `src/styles.css` — Tailwind entry point
- `vite.config.ts` — Vite + TanStack Start + Tailwind + Nitro

## Navigation

Use `Link` for declarative navigation, `useNavigate` for programmatic:

```tsx
import { Link, useNavigate } from "@tanstack/react-router";

// Declarative
<Link to="/dashboard">Dashboard</Link>

// Programmatic (in event handlers or useEffect only)
const navigate = useNavigate();
navigate({ to: "/dashboard" });
```

Never call `navigate()` during render — use `useEffect`.

## Do Not

- Edit `routeTree.gen.ts` — it's auto-generated
- Use `getServerSideProps`, `"use server"`, or Next.js patterns
- Create `QueryClient` as a module-level singleton — use `getQueryClient()` pattern
- Import `appRouter` value (only `import type { AppRouter }`)
- Put `verbatimModuleSyntax: true` in tsconfig — breaks TanStack Start
- Add `credentials: "include"` is already configured in the tRPC httpBatchLink — don't duplicate
