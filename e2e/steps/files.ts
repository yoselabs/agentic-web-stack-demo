import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given: given, When: when, Then: then } = createBdd();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

given("I have uploaded {string}", async ({ page }, filename: string) => {
  const filePath = resolve(__dirname, `../fixtures/${filename}`);
  const input = page.locator('input[type="file"]');
  await input.setInputFiles(filePath);
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText(filename)).toBeVisible({ timeout: 10000 });
});

when("I upload the file {string}", async ({ page }, filename: string) => {
  const filePath = resolve(__dirname, `../fixtures/${filename}`);
  const input = page.locator('input[type="file"]');
  await input.setInputFiles(filePath);
  await page.getByRole("button", { name: "Upload" }).click();
  await page.waitForLoadState("networkidle");
});

when(
  "I click the delete button for {string}",
  async ({ page }, filename: string) => {
    const row = page.locator("li", { hasText: filename });
    await row.getByRole("button", { name: /Delete/i }).click();
    await row.waitFor({ state: "detached", timeout: 5000 });
  },
);

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

when("I download the file {string}", async ({ page }, filename: string) => {
  const row = page.locator("li", { hasText: filename });
  const downloadPromise = page.waitForEvent("download");
  await row.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Download failed — no file path");
  // Store download path for subsequent Then step
  (page as Record<string, unknown>).__lastDownloadPath = path;
});

then(
  "the downloaded file should contain {string}",
  async ({ page }, text: string) => {
    const path = (page as Record<string, unknown>).__lastDownloadPath as string;
    if (!path)
      throw new Error("No download captured — run download step first");
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(path, "utf-8");
    expect(content).toContain(text);
  },
);
