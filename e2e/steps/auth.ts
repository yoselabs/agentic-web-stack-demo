import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given: given, When: when, Then: then } = createBdd();

// Sign up via UI. If user already exists, sign in instead.
async function signUpOrSignIn(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  // Try sign up first
  await page.getByRole("button", { name: "Sign Up" }).click();
  await page.getByPlaceholder("Name").fill(email.split("@")[0]);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.locator('button[type="submit"]').click();

  // Wait for either dashboard or error
  const result = await Promise.race([
    page.waitForURL(/\/dashboard/, { timeout: 5000 }).then(() => "dashboard"),
    page
      .getByText(/already exists/i)
      .waitFor({ timeout: 5000 })
      .then(() => "exists"),
  ]);

  if (result === "exists") {
    // User exists — switch to sign in
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 10000 });
  }
}

given("I am on the login page", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
});

given(
  "a user exists with email {string} and password {string}",
  async ({ page }, email: string, password: string) => {
    await signUpOrSignIn(page, email, password);
    await page.context().clearCookies();
  },
);

given("I am not signed in", async ({ page }) => {
  await page.context().clearCookies();
});

given("I am signed in as {string}", async ({ page }, email: string) => {
  await signUpOrSignIn(page, email, "testpassword123");
});

given("I am on the dashboard", async ({ page }) => {
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
    timeout: 5000,
  });
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
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

then("I should be on the login page", async ({ page }) => {
  await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
});

then("I should be on the home page", async ({ page }) => {
  await expect(page).toHaveURL("http://localhost:3000/", { timeout: 5000 });
});

then("I should be signed out", async ({ page }) => {
  // After sign-out, user lands on either / or /login (race between explicit nav and auth guard)
  await page.waitForURL(/^\http:\/\/localhost:3000\/(login)?$/, {
    timeout: 5000,
  });
  // Verify not on an authenticated page
  await expect(page).not.toHaveURL(/\/dashboard/);
});

then("I should see {string}", async ({ page }, text: string) => {
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 5000 });
});

then("I should see an error message", async ({ page }) => {
  await expect(
    page.locator("text=/fail|error|invalid|incorrect/i"),
  ).toBeVisible({ timeout: 5000 });
});
