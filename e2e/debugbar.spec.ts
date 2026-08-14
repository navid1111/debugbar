import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("inspects successful and failed API records", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Load success" }).click();
  await expect(page.getByText("Request completed")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Debugbar GET \/api\/success 200/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Debugbar GET \/api\/success 200/ })
    .click();
  await page.getByRole("tab", { name: "Messages" }).click();
  await expect(page.getByText("Loaded example data")).toBeVisible();
  await page.getByRole("button", { name: "Close debug toolbar" }).click();

  await page.getByRole("button", { name: "Load failure" }).click();
  await expect(page.getByText("Example failure")).toBeVisible();
  await page
    .getByRole("button", { name: /Debugbar GET \/api\/failure 500/ })
    .click();
  await page.getByRole("tab", { name: "Errors" }).click();
  await expect(
    page.getByRole("tabpanel").getByText("Example failure"),
  ).toBeVisible();
});

test("keeps discovery working through navigation and reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Load success" }).click();
  await expect(
    page.getByRole("button", { name: /Debugbar GET \/api\/success 200/ }),
  ).toBeVisible();
});

test("inspects successful and failed SQL operations", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load users SQL" }).click();
  await page
    .getByRole("button", { name: /Debugbar GET \/api\/users 200/ })
    .click();
  await page.getByRole("tab", { name: "Database" }).click();
  await expect(page.getByText(/all — Succeeded/)).toBeVisible();
  await page.getByText("SQL statement").click();
  await expect(page.getByText(/select id, name from users/)).toBeVisible();
  await page.getByRole("button", { name: "Close debug toolbar" }).click();

  await page.getByRole("button", { name: "Load SQL error" }).click();
  await page
    .getByRole("button", { name: /Debugbar GET \/api\/sql-error 500/ })
    .click();
  await page.getByRole("tab", { name: "Database" }).click();
  await expect(page.getByText(/all — Failed/)).toBeVisible();
  await expect(page.getByRole("tabpanel").getByRole("alert")).toContainText(
    "missing_table",
  );
});

test("shows a safe state when debug API access is denied", async ({
  context,
  page,
}) => {
  await context.addCookies([
    { name: "debugbar-denied", value: "1", domain: "127.0.0.1", path: "/" },
  ]);
  await page.goto("/");
  await page.getByRole("button", { name: "Load success" }).click();
  await expect(page.getByText("Request completed")).toBeVisible();
  await page.getByRole("button", { name: /Debugbar/ }).click();
  await expect(page.getByRole("tabpanel").getByRole("status")).toContainText(
    "no longer available",
  );
});

for (const width of [320, 768, 1440]) {
  test(`toolbar layout at ${width}px`, async ({ browserName, page }) => {
    test.skip(browserName !== "chromium", "One screenshot set is sufficient");
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Load success" }).click();
    await page
      .getByRole("button", { name: /Debugbar GET \/api\/success 200/ })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Application debug toolbar" }),
    ).toBeVisible();
    await mkdir("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: `test-results/screenshots/debugbar-${width}.png`,
      fullPage: true,
    });
  });
}
