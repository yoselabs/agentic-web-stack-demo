import { auth } from "@project/auth";
import { db } from "@project/db";

async function main() {
  console.log("Seeding database...");

  // Create demo user via Better-Auth (handles password hashing)
  const { user } = await auth.api.signUpEmail({
    body: {
      email: "demo@example.com",
      password: "password123",
      name: "Demo User",
    },
  });

  console.log(`Created user: ${user.email}`);

  // Create sample todos
  await db.todo.createMany({
    data: [
      {
        title: "Set up the project",
        completed: true,
        position: 0,
        userId: user.id,
      },
      {
        title: "Add authentication",
        completed: true,
        position: 1,
        userId: user.id,
      },
      {
        title: "Build the dashboard",
        completed: false,
        position: 0,
        userId: user.id,
      },
      {
        title: "Write BDD tests",
        completed: false,
        position: 1,
        userId: user.id,
      },
      {
        title: "Deploy to production",
        completed: false,
        position: 2,
        userId: user.id,
      },
    ],
  });

  console.log("Created 5 sample todos");
  console.log("\nDemo credentials:");
  console.log("  Email:    demo@example.com");
  console.log("  Password: password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
