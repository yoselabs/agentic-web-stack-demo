import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given: given, When: when, Then: then } = createBdd();

// Store the last board URL for direct-URL-access scenario
let lastBoardUrl = "";

given("I have a board {string}", async ({ page }, title: string) => {
  await page.goto("/boards");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "New Board" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Board Title").fill(title);
  await page.locator('button[type="submit"]').click();
  // Wait for navigation to the board detail page
  await expect(page.getByRole("heading", { name: title })).toBeVisible({
    timeout: 10000,
  });
  // Store the URL for direct access scenario
  lastBoardUrl = page.url();
});

when(
  "I add a card {string} in {string}",
  async ({ page }, text: string, columnLabel: string) => {
    // Use the placeholder to find the specific input within the column
    const input = page.getByPlaceholder(
      new RegExp(`add ${columnLabel.toLowerCase()}`, "i"),
    );
    await input.fill(text);
    // Find the form containing this input and submit it
    const form = page.locator("form", { has: input });
    await form.getByRole("button", { name: "Add" }).click();
    // Wait for card to appear
    await expect(page.getByText(text)).toBeVisible({ timeout: 5000 });
  },
);

when("I vote on card {string}", async ({ page }, text: string) => {
  // Find the card by its text content, then locate the vote button (first button in the card)
  const card = page.locator("p", { hasText: text }).locator("..");
  await card.locator("button").first().click();
  await page.waitForLoadState("networkidle");
});

when("I delete card {string}", async ({ page }, text: string) => {
  // Find the card by its text content, then locate the delete button (last button in the card)
  const card = page.locator("p", { hasText: text }).locator("..");
  await card.locator("button").last().click();
  await expect(page.getByText(text)).not.toBeVisible({ timeout: 5000 });
});

when(
  "I navigate to the board {string} by URL",
  async ({ page }, _title: string) => {
    // Use the stored URL from the board creation step
    if (lastBoardUrl) {
      const boardPath = new URL(lastBoardUrl).pathname;
      await page.goto(boardPath);
    } else {
      // Fallback — navigate to a bogus board ID
      await page.goto("/boards/nonexistent-board-id");
    }
    await page.waitForLoadState("networkidle");
  },
);

then(
  "card {string} should have {int} vote(s)",
  async ({ page }, text: string, count: number) => {
    const card = page.locator("p", { hasText: text }).locator("..");
    const voteBtn = card.locator("button").first();
    await expect(voteBtn).toContainText(String(count));
  },
);

then("the add card inputs should not be visible", async ({ page }) => {
  // When a board is closed, no input fields for adding cards should be visible
  const addInputs = page.getByPlaceholder(/add .+\.\.\./i);
  await expect(addInputs).toHaveCount(0);
});
