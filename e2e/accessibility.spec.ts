import { expect, test } from "@playwright/test";

async function openToolbar(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Load success" }).click();
  const toggle = page.getByRole("button", {
    name: /Debugbar GET \/api\/success 200/,
  });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tabpanel")).toBeVisible();
  return page
    .getByRole("complementary", { name: "Application debug toolbar" })
    .locator(":scope > button")
    .last();
}

test("operates all toolbar controls from the keyboard", async ({ page }) => {
  const toggle = await openToolbar(page);
  const panel = page.locator("[data-debugbar-panel]");
  await expect(panel).toBeFocused();

  const selector = page.getByLabel("Debug request");
  await selector.focus();
  await page.keyboard.press("ArrowDown");
  await expect(selector).toBeFocused();

  const height = page.getByLabel("Panel height");
  await height.focus();
  const originalHeight = await height.inputValue();
  await page.keyboard.press("ArrowUp");
  expect(Number(await height.inputValue())).toBeGreaterThan(
    Number(originalHeight),
  );

  const overview = page.getByRole("tab", { name: "Overview" });
  await overview.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Timeline" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Raw Data" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(overview).toBeFocused();

  const close = page.getByRole("button", { name: "Close debug toolbar" });
  await close.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toBeFocused();
});

test("exposes toolbar, selector, tabs, and panel semantics", async ({
  page,
}) => {
  await openToolbar(page);
  await expect(
    page.getByRole("complementary", {
      name: "Application debug toolbar",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("tablist", { name: "Debug information" }),
  ).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(7);
  await expect(page.getByRole("tab", { selected: true })).toHaveText(
    "Overview",
  );
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "aria-labelledby",
    "debugbar-tab-overview",
  );
  await expect(
    page.getByRole("combobox", { name: "Debug request" }),
  ).toBeVisible();
});

test("reflows at 200% zoom without page-level horizontal scrolling", async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== "chromium", "Chromium zoom evidence is sufficient");
  await page.setViewportSize({ width: 640, height: 900 });
  await openToolbar(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "200%";
  });
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(
    page.getByRole("button", { name: "Close debug toolbar" }),
  ).toBeVisible();
});

test("honors reduced motion and remains operable in forced colors", async ({
  browserName,
  page,
}) => {
  test.skip(
    browserName !== "chromium",
    "Media emulation is verified in Chromium",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openToolbar(page);
  await expect(page.locator("[data-debugbar-panel]")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close debug toolbar" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Panel height")).toBeEnabled();
});

test("toolbar text meets WCAG AA computed contrast", async ({ page }) => {
  await openToolbar(page);
  const ratios = await page.evaluate(() => {
    function rgb(value: string): [number, number, number] {
      const channels = value
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number);
      if (!channels || channels.length !== 3)
        throw new Error(`Unsupported color ${value}`);
      return channels as [number, number, number];
    }
    function luminance(color: string) {
      const values = rgb(color).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * values[0]! + 0.7152 * values[1]! + 0.0722 * values[2]!;
    }
    function ratio(element: Element, background: Element) {
      const foregroundValue = luminance(getComputedStyle(element).color);
      const backgroundValue = luminance(
        getComputedStyle(background).backgroundColor,
      );
      return (
        (Math.max(foregroundValue, backgroundValue) + 0.05) /
        (Math.min(foregroundValue, backgroundValue) + 0.05)
      );
    }
    const panel = document.querySelector("[data-debugbar-panel]")!;
    const toggle = document.querySelector("aside > button:last-child")!;
    const activeTab = document.querySelector(
      '[role="tab"][aria-selected="true"]',
    )!;
    const brand = toggle.querySelector("span")!;
    return {
      panel: ratio(panel.querySelector("strong")!, panel),
      toggle: ratio(toggle, toggle),
      brand: ratio(brand, toggle),
      activeTab: ratio(activeTab, activeTab),
    };
  });
  for (const ratio of Object.values(ratios))
    expect(ratio).toBeGreaterThanOrEqual(4.5);
});
