import { test, expect } from "@playwright/test";

// Part 4 features on the fictional fixtures (PUBLIC_MODE=true). Northstar (demo-0-0) needs IELTS 6.5.
const stored = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("unimatch-profile-v2") ?? "null"),
  );

test("a sample student fills the profile and opens the results", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /IB student, strong English/ })
    .click();
  await expect(page).toHaveURL(/results/);
  await expect(page.locator(".profile-bar")).toContainText(
    "Business Administration",
  );
  expect((await stored(page)).nationality).toBe("India");
});

test("the drawer re-ranks live, saves, and the detail page explains what would change", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /IB student, strong English/ })
    .click();
  await page.getByRole("button", { name: "Adjust scores and budget" }).click();
  await page.getByLabel("IELTS overall").fill("6");
  await expect(
    page
      .locator(".program-card", { hasText: "Northstar" })
      .locator(".tag.FAIL"),
  ).toBeVisible();
  await expect.poll(async () => (await stored(page)).ielts).toBe(6);
  await page.keyboard.press("Escape");
  await page
    .locator(".program-card", { hasText: "Northstar" })
    .getByRole("link", { name: "View details" })
    .click();
  await expect(
    page.getByText(
      "If your IELTS were 6.5 (now 6), the English check would pass.",
    ),
  ).toBeVisible();
  await expect(page.locator(".ledger")).toContainText("Total per year");
});

test("compare two programmes from the results", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /IB student, strong English/ })
    .click();
  const cards = page.locator(".program-card");
  await cards
    .nth(0)
    .getByRole("button", { name: /^Compare / })
    .click();
  await cards
    .nth(1)
    .getByRole("button", { name: /^Compare / })
    .click();
  await page.getByRole("link", { name: "Compare now" }).click();
  await expect(page).toHaveURL(/compare\?ids=/);
  await expect(page.locator(".compare thead th")).toHaveCount(3);
  await expect(page.locator(".compare")).toContainText("Cost arithmetic");
});

test("a shared shortlist link shows its programmes and can be saved", async ({
  page,
}) => {
  await page.goto("/shortlist?ids=demo-0-0,demo-2-0");
  await expect(
    page.getByRole("heading", { name: "Shared shortlist" }),
  ).toBeVisible();
  await expect(page.locator("section.panel h2")).toHaveCount(2);
  await page.getByRole("button", { name: "Save to my shortlist" }).click();
  await expect(page).toHaveURL(/\/shortlist$/);
  expect(
    await page.evaluate(() => localStorage.getItem("unimatch-shortlist-v1")),
  ).toBe('["demo-0-0","demo-2-0"]');
});

test("a profile link opens the right step with the field focused", async ({
  page,
}) => {
  await page.goto("/profile#ielts");
  await expect(page.getByLabel("IELTS overall")).toBeFocused();
});

test("deadlines are grouped by month", async ({ page }) => {
  await page.goto("/deadlines");
  await expect(page.locator(".month-group h2").first()).toBeVisible();
});
