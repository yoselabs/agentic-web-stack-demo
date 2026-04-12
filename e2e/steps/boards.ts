import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given: given, When: when, Then: then } = createBdd();

// Track the last board URL for the "direct URL" scenario
let lastBoardUrl = "";

given("I have a board {string}", async ({ page }, title: string) => {
  await page.goto("/boards");
  await page.waitForLoadState("networkidle");

  // Navigate to new board page directly (works on both desktop and mobile)
  await page.goto("/boards/new");
  await page.waitForLoadState("networkidle");

  await page.getByPlaceholder("Board title...").fill(title);
  await page.locator('button[type="submit"]').click();

  // Wait for navigation to the board detail page
  await expect(
    page.getByRole("heading", { name: title, level: 1 }),
  ).toBeVisible({ timeout: 10000 });
  lastBoardUrl = page.url();
});

when(
  "I add a card {string} in {string}",
  async ({ page }, text: string, columnTitle: string) => {
    // Find the column by its h2 heading, then scope to the parent div
    const columnHeading = page.getByRole("heading", {
      name: columnTitle,
      level: 2,
    });
    const column = page.locator("div", { has: columnHeading }).first();

    await column.getByPlaceholder("Add a card...").fill(text);
    await column.getByRole("button", { name: "Add" }).click();

    // Wait for the card text to appear
    await expect(page.getByText(text)).toBeVisible({ timeout: 5000 });
  },
);

when("I vote on the card {string}", async ({ page }, text: string) => {
  // Find the card containing the text, then click the vote button (first button)
  const cardEl = page.locator("[data-slot='card']", { hasText: text }).first();
  const voteBtn = cardEl.locator("button").first();
  await voteBtn.click();
  await page.waitForLoadState("networkidle");
});

when("I close the board", async ({ page }) => {
  await page.getByRole("button", { name: "Close Board" }).click();
  await page.waitForLoadState("networkidle");
});

when("I delete the card {string}", async ({ page }, text: string) => {
  const cardEl = page.locator("[data-slot='card']", { hasText: text }).first();
  // Delete button is the last button in the card (Trash icon)
  const deleteBtn = cardEl.locator("button").last();
  await deleteBtn.click();
  // Wait for removal
  await expect(page.getByText(text)).not.toBeVisible({ timeout: 5000 });
});

when("I navigate to the last board URL", async ({ page }) => {
  if (!lastBoardUrl) throw new Error("No board URL stored");
  const boardPath = new URL(lastBoardUrl).pathname;
  await page.goto(boardPath);
  await page.waitForLoadState("networkidle");
});

then(
  "the card {string} should show {int} vote(s)",
  async ({ page }, text: string, count: number) => {
    const cardEl = page
      .locator("[data-slot='card']", { hasText: text })
      .first();
    await expect(
      cardEl.getByRole("button", { name: String(count) }),
    ).toBeVisible({ timeout: 5000 });
  },
);

then("the add card forms should be hidden", async ({ page }) => {
  await expect(
    page.getByPlaceholder("Add a card...").first(),
  ).not.toBeVisible();
});
