import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given: given, When: when, Then: then } = createBdd();

given("I have a todo {string}", async ({ page }, title: string) => {
  await page.getByPlaceholder("Add a todo...").fill(title);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(title)).toBeVisible({ timeout: 5000 });
});

when("I toggle the todo {string}", async ({ page }, title: string) => {
  const todoRow = page.locator("li", { hasText: title });
  await todoRow.getByRole("checkbox").click();
});

when("I delete the todo {string}", async ({ page }, title: string) => {
  const todoRow = page.locator("li", { hasText: title });
  await todoRow.getByRole("button", { name: "Delete" }).click();
  await page.waitForTimeout(500);
});

when("I sign out and sign in as {string}", async ({ page }, email: string) => {
  // Sign out
  await page.getByRole("button", { name: "Sign Out" }).click();
  await page.waitForURL("**/", { timeout: 5000 });

  // Sign up as new user
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Sign Up" }).click();
  await page.getByPlaceholder("Name").fill(email.split("@")[0]);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill("testpassword123");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 10000 });
});

then(
  "the todo {string} should be completed",
  async ({ page }, title: string) => {
    const todoRow = page.locator("li", { hasText: title });
    await expect(todoRow.getByRole("checkbox")).toBeChecked();
  },
);

then("I should not see {string}", async ({ page }, text: string) => {
  await expect(page.getByText(text)).not.toBeVisible();
});
