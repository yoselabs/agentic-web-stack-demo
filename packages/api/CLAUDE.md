# packages/api — tRPC Router + Context

## Adding a New Route

1. Create a sub-router or add to the existing `appRouter` in `src/router.ts`
2. Use `publicProcedure` for unauthenticated routes, `protectedProcedure` for authenticated
3. Add input validation with Zod
4. Run `make check` — types propagate to apps/web automatically

### Example: Add a sub-router

```typescript
// In src/router.ts
const postRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.post.findMany({
      where: { userId: ctx.session.user.id },
    });
  }),
  create: protectedProcedure
    .input(z.object({ title: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.post.create({
        data: { title: input.title, userId: ctx.session.user.id },
      });
    }),
});

// Add to appRouter
export const appRouter = router({
  // ... existing routes
  post: postRouter,
});
```

## File Structure

- `src/trpc.ts` — single `initTRPC.create()`, exports `router`, `publicProcedure`, `protectedProcedure`
- `src/context.ts` — `createContext()` receives session from Hono, exports `Context` type
- `src/router.ts` — `appRouter` with all routes, exports `AppRouter` type
- `src/index.ts` — re-exports everything

## Context

`protectedProcedure` narrows `ctx.session` to non-null. Inside a protected procedure:
- `ctx.session.user` — authenticated user (id, email, name, etc.)
- `ctx.db` — Prisma client

## Do Not

- Create a second `initTRPC.create()` — all routers must use the one from `src/trpc.ts`
- Import `appRouter` value in client code — only import `type AppRouter`
- Skip input validation — always use `.input(z.object({...}))` for mutations
- Access `ctx.session.user` in `publicProcedure` — it's nullable, use `protectedProcedure`
- Name procedures `then`, `call`, or `apply` — reserved by JavaScript Proxy
