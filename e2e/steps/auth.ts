import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given: given, When: when, Then: then } = createBdd();

async function signUpViaUI(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Sign Up" }).click();
  await page.getByPlaceholder("Name").fill(email.split("@")[0]);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 10000 });
}

given("I am on the login page", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
});

given(
  "a user exists with email {string} and password {string}",
  async ({ page }, email: string, password: string) => {
    await signUpViaUI(page, email, password);
    await page.context().clearCookies();
  },
);

given("I am not signed in", async ({ page }) => {
  await page.context().clearCookies();
});

given("I am signed in as {string}", async ({ page }, email: string) => {
  await signUpViaUI(page, email, "testpassword123");
});

given("I am on the dashboard", async ({ page }) => {
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("Dashboard")).toBeVisible({ timeout: 5000 });
});

when("I switch to sign up mode", async ({ page }) => {
  await page.getByRole("button", { name: "Sign Up" }).click();
});

when(
  "I fill in {string} with {string}",
  async ({ page }, field: string, value: string) => {
    await page.getByPlaceholder(field).fill(value);
  },
);

when("I submit the form", async ({ page }) => {
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2000);
});

when("I navigate to {string}", async ({ page }, path: string) => {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
});

when("I click {string}", async ({ page }, text: string) => {
  await page.getByRole("button", { name: text }).click();
  await page.waitForTimeout(2000);
});

then("I should be on the dashboard", async ({ page }) => {
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  await expect(page.getByText("Dashboard")).toBeVisible();
});

then("I should be on the login page", async ({ page }) => {
  await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
});

then("I should be on the home page", async ({ page }) => {
  await expect(page).toHaveURL("http://localhost:3000/", { timeout: 5000 });
});

then("I should see {string}", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible({ timeout: 5000 });
});

then("I should see an error message", async ({ page }) => {
  await expect(
    page.locator("text=/fail|error|invalid|incorrect/i"),
  ).toBeVisible({ timeout: 5000 });
});
