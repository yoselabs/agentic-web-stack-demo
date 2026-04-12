# e2e — BDD Testing with playwright-bdd

## Add a Feature (BDD-first workflow)

1. **Write the Gherkin spec** in `features/<name>.feature`
2. **Write step definitions** in `steps/<name>.ts`
3. **Generate tests:** `pnpm exec bddgen` (generates `.features-gen/`)
4. **Run:** `make test`
5. **Implement** the feature code (tRPC routes, UI pages) until tests pass
6. **Verify:** `make check && make test`

Write the spec FIRST, then implement. This is the core workflow.

## Writing Feature Files

```gherkin
Feature: Feature Name

  Scenario: Descriptive scenario name
    Given I am signed in as "unique-email@example.com"
    And I navigate to "/page"
    When I do something
    Then I should see "expected result"
```

Rules:
- Each scenario must be independent — no shared state between scenarios
- Use unique emails per scenario (DB is shared across parallel workers)
- Background steps run per-scenario, not per-feature
- Keep scenarios focused — one behavior per scenario

## Writing Step Definitions

```typescript
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given: given, When: when, Then: then } = createBdd();

given("step text with {string}", async ({ page }, value: string) => {
  // implementation
});
```

Rules:
- Use `createBdd()` — not decorator syntax
- Steps are shared across all feature files — write reusable steps
- Use Playwright's role-based locators: `getByRole`, `getByPlaceholder`, `getByText`
- Avoid `getByText` for text that appears in multiple places — use `getByRole('heading')` or `.first()`
- Use `page.locator('button[type="submit"]')` for submit buttons (avoids matching toggle buttons)

## Auth in Tests

Use the `signUpOrSignIn` helper pattern:
- Tries sign-up first, falls back to sign-in if user exists
- Handles parallel execution where multiple scenarios may create the same user

## Test Infrastructure

- `docker-compose.test.yml` — Postgres on port 5433, tmpfs (in-memory)
- `global-setup.ts` — destroys and recreates test container, pushes fresh schema
- `playwright.config.ts` — starts both web and server with test env vars
- Fully parallel execution (7 workers, ~24 seconds)

## Do Not

- Edit files in `.features-gen/` — they are auto-generated
- Share mutable state between scenarios
- Use `waitForTimeout` as the primary waiting strategy — prefer `waitForURL`, `toBeVisible`, `toHaveURL`
- Hardcode `http://localhost:3000` in step definitions — use `page.goto("/path")` (baseURL configured)
