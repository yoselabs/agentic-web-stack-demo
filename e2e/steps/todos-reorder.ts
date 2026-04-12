import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { When: when, Then: then } = createBdd();

when(
  "I drag {string} above {string}",
  async ({ page }, source: string, target: string) => {
    const sourceItem = page.locator("li", { hasText: source });
    const targetItem = page.locator("li", { hasText: target });

    const targetBox = await targetItem.boundingBox();
    if (!targetBox) throw new Error(`Could not find target item "${target}"`);

    // Drag source to the top edge of target (above it)
    await sourceItem.dragTo(targetItem, {
      targetPosition: { x: targetBox.width / 2, y: 0 },
    });

    await page.waitForLoadState("networkidle");
  },
);

then(
  "{string} should appear before {string}",
  async ({ page }, first: string, second: string) => {
    const items = page.locator("ul").first().locator("li");
    const texts: string[] = [];
    for (let i = 0; i < (await items.count()); i++) {
      const text = await items.nth(i).innerText();
      texts.push(text);
    }

    const firstIndex = texts.findIndex((t) => t.includes(first));
    const secondIndex = texts.findIndex((t) => t.includes(second));

    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThanOrEqual(0);
    expect(firstIndex).toBeLessThan(secondIndex);
  },
);
