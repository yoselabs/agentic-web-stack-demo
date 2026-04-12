import { db } from "@project/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createContext } from "../context.js";
import { appRouter } from "../router.js";

// Fake user + session for protectedProcedure
const TEST_USER_ID = "test-user-todo-integration";
const TEST_USER = {
  id: TEST_USER_ID,
  name: "Test User",
  email: "test-todo@example.com",
  emailVerified: false,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fakeSession = {
  user: TEST_USER,
  session: {
    id: "test-session-id",
    token: "test-token",
    userId: TEST_USER_ID,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    ipAddress: null,
    userAgent: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

// Track created todo IDs for cleanup
const createdTodoIds: string[] = [];

async function createCaller() {
  const ctx = await createContext({ session: fakeSession });
  return appRouter.createCaller(ctx);
}

beforeAll(async () => {
  // Clean up from any prior run, then create the test user
  await db.todo.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.user.deleteMany({ where: { id: TEST_USER_ID } });
  await db.user.create({
    data: {
      id: TEST_USER_ID,
      name: TEST_USER.name,
      email: TEST_USER.email,
      emailVerified: TEST_USER.emailVerified,
    },
  });
});

afterEach(async () => {
  // Clean up todos created during tests
  if (createdTodoIds.length > 0) {
    await db.todo.deleteMany({
      where: { id: { in: createdTodoIds } },
    });
    createdTodoIds.length = 0;
  }
});

afterAll(async () => {
  // Clean up any remaining todos and the test user
  await db.todo.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.user.delete({ where: { id: TEST_USER_ID } }).catch(() => {});
  await db.$disconnect();
});

describe("todo router", () => {
  it("lists todos (empty)", async () => {
    const caller = await createCaller();
    const todos = await caller.todo.list();
    expect(todos).toEqual([]);
  });

  it("creates a todo", async () => {
    const caller = await createCaller();
    const todo = await caller.todo.create({ title: "Integration test todo" });

    createdTodoIds.push(todo.id);

    expect(todo.title).toBe("Integration test todo");
    expect(todo.completed).toBe(false);
    expect(todo.userId).toBe(TEST_USER_ID);

    // Verify it appears in the list
    const todos = await caller.todo.list();
    expect(todos).toHaveLength(1);
    expect(todos[0]?.id).toBe(todo.id);
  });

  it("completes a todo", async () => {
    const caller = await createCaller();
    const todo = await caller.todo.create({ title: "To be completed" });
    createdTodoIds.push(todo.id);

    const updated = await caller.todo.complete({
      id: todo.id,
      completed: true,
    });

    expect(updated.completed).toBe(true);
    expect(updated.id).toBe(todo.id);

    // Toggle back
    const toggled = await caller.todo.complete({
      id: todo.id,
      completed: false,
    });
    expect(toggled.completed).toBe(false);
  });

  it("deletes a todo", async () => {
    const caller = await createCaller();
    const todo = await caller.todo.create({ title: "To be deleted" });

    await caller.todo.delete({ id: todo.id });

    // Verify it's gone
    const todos = await caller.todo.list();
    const found = todos.find((t) => t.id === todo.id);
    expect(found).toBeUndefined();
  });

  it("rejects unauthenticated calls", async () => {
    const ctx = await createContext({ session: null });
    const caller = appRouter.createCaller(ctx);

    await expect(caller.todo.list()).rejects.toThrow("UNAUTHORIZED");
  });

  it("creates todos at position 0 and shifts others", async () => {
    const caller = await createCaller();
    const first = await caller.todo.create({ title: "First" });
    const second = await caller.todo.create({ title: "Second" });

    createdTodoIds.push(first.id, second.id);

    const todos = await caller.todo.list();
    const active = todos.filter((t) => !t.completed);

    // Second was created last, should be at position 0 (top)
    expect(active[0]?.title).toBe("Second");
    expect(active[0]?.position).toBe(0);
    expect(active[1]?.title).toBe("First");
    expect(active[1]?.position).toBe(1);
  });

  it("reorders active todos", async () => {
    const caller = await createCaller();
    const first = await caller.todo.create({ title: "A" });
    const second = await caller.todo.create({ title: "B" });
    const third = await caller.todo.create({ title: "C" });

    createdTodoIds.push(first.id, second.id, third.id);

    // Current order: C (0), B (1), A (2)
    // Reorder to: A, C, B
    await caller.todo.reorder({ ids: [first.id, third.id, second.id] });

    const todos = await caller.todo.list();
    const active = todos.filter((t) => !t.completed);
    expect(active.map((t) => t.title)).toEqual(["A", "C", "B"]);
  });

  it("sorts completed todos after active ones", async () => {
    const caller = await createCaller();
    const first = await caller.todo.create({ title: "Active" });
    const second = await caller.todo.create({ title: "Done" });

    createdTodoIds.push(first.id, second.id);

    await caller.todo.complete({ id: second.id, completed: true });

    const todos = await caller.todo.list();
    expect(todos[0]?.title).toBe("Active");
    expect(todos[1]?.title).toBe("Done");
    expect(todos[1]?.completed).toBe(true);
  });

  it("uncompleting a todo moves it to position 0", async () => {
    const caller = await createCaller();
    const first = await caller.todo.create({ title: "Stay" });
    const second = await caller.todo.create({ title: "Toggle" });

    createdTodoIds.push(first.id, second.id);

    await caller.todo.complete({ id: second.id, completed: true });
    await caller.todo.complete({ id: second.id, completed: false });

    const todos = await caller.todo.list();
    const active = todos.filter((t) => !t.completed);
    expect(active[0]?.title).toBe("Toggle");
    expect(active[0]?.position).toBe(0);
  });
});
