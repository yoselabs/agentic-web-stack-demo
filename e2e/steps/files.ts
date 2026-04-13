import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given: given, When: when, Then: then } = createBdd();

const stepsDir = dirname(fileURLToPath(import.meta.url));

/** Shared upload helper — sets file input, clicks Upload, waits for result. */
async function uploadFile(
  page: import("@playwright/test").Page,
  filename: string,
) {
  const filePath = resolve(stepsDir, `../fixtures/${filename}`);
  const input = page.locator('input[type="file"]');
  await input.setInputFiles(filePath);
  await page.getByRole("button", { name: "Upload" }).click();
  await page.waitForLoadState("networkidle");
}

// Module-scoped download path — reset per scenario via Playwright's test isolation
let lastDownloadPath: string | null = null;

// --- Given ---

given("I have uploaded {string}", async ({ page }, filename: string) => {
  await uploadFile(page, filename);
  await expect(page.getByText(filename)).toBeVisible({ timeout: 10000 });
});

// --- When ---

when("I upload the file {string}", async ({ page }, filename: string) => {
  await uploadFile(page, filename);
});

when(
  "I click the delete button for {string}",
  async ({ page }, filename: string) => {
    const row = page.locator("li", { hasText: filename });
    await row.getByRole("button", { name: /Delete/i }).click();
    await row.waitFor({ state: "detached", timeout: 5000 });
  },
);

when("I download the file {string}", async ({ page }, filename: string) => {
  const row = page.locator("li", { hasText: filename });
  const downloadPromise = page.waitForEvent("download");
  await row.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Download failed — no file path");
  lastDownloadPath = path;
});

// --- Then ---

then(
  "I should see a data table with {int} rows",
  async ({ page }, count: number) => {
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(count, { timeout: 10000 });
  },
);

then("the table should contain {string}", async ({ page }, text: string) => {
  const table = page.locator("table");
  await expect(table.getByText(text, { exact: true })).toBeVisible({
    timeout: 5000,
  });
});

then(
  "the downloaded file should contain {string}",
  async (_ctx, text: string) => {
    if (!lastDownloadPath)
      throw new Error("No download captured — run download step first");
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(lastDownloadPath, "utf-8");
    expect(content).toContain(text);
    lastDownloadPath = null;
  },
);
