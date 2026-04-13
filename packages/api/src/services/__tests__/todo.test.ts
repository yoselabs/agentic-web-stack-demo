import { db } from "@project/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  completeTodo,
  createTodo,
  deleteTodo,
  exportTodosAsCSV,
  importTodosFromCSV,
  listTodos,
  reorderTodos,
} from "../todo.js";

const TEST_USER_ID = "test-user-todo-service";

const createdTodoIds: string[] = [];

beforeAll(async () => {
  await db.todo.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.user.deleteMany({ where: { id: TEST_USER_ID } });
  await db.user.create({
    data: {
      id: TEST_USER_ID,
      name: "Service Test User",
      email: "test-todo-service@example.com",
      emailVerified: false,
    },
  });
});

afterEach(async () => {
  if (createdTodoIds.length > 0) {
    await db.todo.deleteMany({
      where: { id: { in: createdTodoIds } },
    });
    createdTodoIds.length = 0;
  }
});

afterAll(async () => {
  await db.todo.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.user.delete({ where: { id: TEST_USER_ID } }).catch(() => {});
  await db.$disconnect();
});

describe("todo service", () => {
  it("lists todos (empty)", async () => {
    const todos = await listTodos(db, TEST_USER_ID);
    expect(todos).toEqual([]);
  });

  it("creates a todo at position 0 and shifts others", async () => {
    const first = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "First"),
    );
    createdTodoIds.push(first.id);

    const second = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "Second"),
    );
    createdTodoIds.push(second.id);

    const todos = await listTodos(db, TEST_USER_ID);
    const active = todos.filter((t) => !t.completed);

    expect(active[0]?.title).toBe("Second");
    expect(active[0]?.position).toBe(0);
    expect(active[1]?.title).toBe("First");
    expect(active[1]?.position).toBe(1);
  });

  it("completes a todo", async () => {
    const todo = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "To complete"),
    );
    createdTodoIds.push(todo.id);

    const updated = await db.$transaction((tx) =>
      completeTodo(tx, TEST_USER_ID, todo.id, true),
    );
    expect(updated.completed).toBe(true);
  });

  it("uncompleting a todo moves it to position 0", async () => {
    const first = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "Stay"),
    );
    const second = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "Toggle"),
    );
    createdTodoIds.push(first.id, second.id);

    await db.$transaction((tx) =>
      completeTodo(tx, TEST_USER_ID, second.id, true),
    );
    await db.$transaction((tx) =>
      completeTodo(tx, TEST_USER_ID, second.id, false),
    );

    const todos = await listTodos(db, TEST_USER_ID);
    const active = todos.filter((t) => !t.completed);
    expect(active[0]?.title).toBe("Toggle");
    expect(active[0]?.position).toBe(0);
  });

  it("reorders todos with bulk UPDATE", async () => {
    const a = await db.$transaction((tx) => createTodo(tx, TEST_USER_ID, "A"));
    const b = await db.$transaction((tx) => createTodo(tx, TEST_USER_ID, "B"));
    const c = await db.$transaction((tx) => createTodo(tx, TEST_USER_ID, "C"));
    createdTodoIds.push(a.id, b.id, c.id);

    // Current order: C(0), B(1), A(2). Reorder to A, C, B.
    await db.$transaction((tx) =>
      reorderTodos(tx, TEST_USER_ID, [a.id, c.id, b.id]),
    );

    const todos = await listTodos(db, TEST_USER_ID);
    const active = todos.filter((t) => !t.completed);
    expect(active.map((t) => t.title)).toEqual(["A", "C", "B"]);
  });

  it("deletes a todo", async () => {
    const todo = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "To delete"),
    );

    await deleteTodo(db, TEST_USER_ID, todo.id);

    const todos = await listTodos(db, TEST_USER_ID);
    expect(todos.find((t) => t.id === todo.id)).toBeUndefined();
  });

  it("imports todos from CSV with title column", async () => {
    const csv = Buffer.from("title\nBuy milk\nWalk the dog");
    const result = await db.$transaction((tx) =>
      importTodosFromCSV(tx, TEST_USER_ID, csv),
    );
    expect(result.count).toBe(2);

    const todos = await listTodos(db, TEST_USER_ID);
    const active = todos.filter((t) => !t.completed);
    createdTodoIds.push(...active.map((t) => t.id));
    expect(active[0]?.title).toBe("Buy milk");
    expect(active[1]?.title).toBe("Walk the dog");
  });

  it("rejects CSV without title column", async () => {
    const csv = Buffer.from("name,email\nAlice,a@b.com");
    await expect(
      db.$transaction((tx) => importTodosFromCSV(tx, TEST_USER_ID, csv)),
    ).rejects.toThrow("title");
  });

  it("ignores extra columns beyond title", async () => {
    const csv = Buffer.from("title,priority,notes\nTest todo,high,some note");
    const result = await db.$transaction((tx) =>
      importTodosFromCSV(tx, TEST_USER_ID, csv),
    );
    expect(result.count).toBe(1);

    const todos = await listTodos(db, TEST_USER_ID);
    const imported = todos.filter((t) => t.title === "Test todo");
    createdTodoIds.push(...imported.map((t) => t.id));
    expect(todos.some((t) => t.title === "Test todo")).toBe(true);
  });

  it("exports todos as CSV with title and completed columns", async () => {
    const todo = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "Export me"),
    );
    createdTodoIds.push(todo.id);

    const csv = await exportTodosAsCSV(db, TEST_USER_ID);
    expect(csv).toContain("title");
    expect(csv).toContain("completed");
    expect(csv).toContain("Export me");
  });

  it("exports empty CSV with headers when no todos exist", async () => {
    const csv = await exportTodosAsCSV(db, TEST_USER_ID);
    expect(csv).toBe("title,completed");
  });

  it("properly escapes titles containing commas", async () => {
    const todo = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "Buy eggs, milk, bread"),
    );
    createdTodoIds.push(todo.id);

    const csv = await exportTodosAsCSV(db, TEST_USER_ID);
    expect(csv).toContain('"Buy eggs, milk, bread"');
  });

  it("sorts completed todos after active ones", async () => {
    const active = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "Active"),
    );
    const done = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "Done"),
    );
    createdTodoIds.push(active.id, done.id);

    await db.$transaction((tx) =>
      completeTodo(tx, TEST_USER_ID, done.id, true),
    );

    const todos = await listTodos(db, TEST_USER_ID);
    expect(todos[0]?.title).toBe("Active");
    expect(todos[1]?.title).toBe("Done");
    expect(todos[1]?.completed).toBe(true);
  });
});
