import { test, expect, type Page } from "@playwright/test";

// Runs with PUBLIC_MODE=true and the fictional fixtures: 5 bachelor's programmes,
// 3 in Hong Kong and 2 in South Korea.
const publicPages = [
  "/",
  "/profile",
  "/results",
  "/shortlist",
  "/deadlines",
  "/compare?ids=demo-0-0,demo-2-0",
];

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function completeWizard(page: Page) {
  await page.goto("/profile");
  await page.getByLabel("Nationality / citizenship").fill("Ukraine");
  await page.getByLabel("Country of education").fill("Ukraine");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("IELTS overall").fill("7");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Available annual budget").fill("40000");
  await page.getByRole("button", { name: "Show my matches" }).click();
  await expect(page).toHaveURL(/results/);
}

test("wizard without destination or degree, results toggle, detail evidence", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Your next chapter/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "output/playwright/landing.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Find my universities" }).click();
  await expect(page.getByLabel("Intended degree")).toHaveCount(0);
  await expect(page.getByText("Preferred study destinations")).toHaveCount(0);
  await page.getByLabel("Nationality / citizenship").fill("Ukraine");
  await page.getByLabel("Country of education").fill("Ukraine");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("IELTS overall").fill("7");
  await page.getByRole("button", { name: "Continue" }).click();
  // The budget starts blank and is required.
  await expect(page.getByLabel("Available annual budget")).toHaveValue("");
  await page.getByRole("button", { name: "Show my matches" }).click();
  await expect(page).toHaveURL(/profile/);
  expect(
    await page
      .getByLabel("Available annual budget")
      .evaluate((el: HTMLInputElement) => el.validity.valueMissing),
  ).toBe(true);
  await page.getByLabel("Available annual budget").fill("40000");
  await page.getByRole("button", { name: "Show my matches" }).click();
  await expect(page).toHaveURL(/results/);
  await expect(page.locator(".program-card")).toHaveCount(5);
  await page.screenshot({
    path: "output/playwright/results.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "South Korea", exact: true }).click();
  await expect(page.locator(".program-card")).toHaveCount(2);
  await page
    .locator(".program-card", { hasText: "Linden" })
    .getByRole("link", { name: "View details" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your financial scenarios" }),
  ).toBeVisible();
  await expect(page.getByText("CONFLICTING", { exact: true })).toBeVisible();
  await page.goto("/profile");
  await expect(page.getByLabel("Nationality / citizenship")).toHaveValue(
    "Ukraine",
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("unimatch-profile-v2")!).budget,
    ),
  ).toBe(40000);
  await page.getByRole("button", { name: "Delete my saved profile" }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("unimatch-profile-v2")),
  ).toBeNull();
});

test("shortlist works without an account: add, reorder, remove, persist", async ({
  page,
}) => {
  await completeWizard(page);
  const cards = page.locator(".program-card");
  await cards.nth(0).getByRole("button", { name: "Add to shortlist" }).click();
  await cards.nth(1).getByRole("button", { name: "Add to shortlist" }).click();
  await expect(
    page.getByRole("button", { name: "Remove from shortlist" }),
  ).toHaveCount(2);
  const firstUni = await cards.nth(0).locator("h3").first().textContent();

  await page.goto("/shortlist");
  await expect(
    page.getByRole("heading", { name: "My shortlist" }),
  ).toBeVisible();
  const ranked = (n: number) =>
    page.locator("section.panel", { hasText: "#" + n + " ·" });
  await expect(ranked(1)).toContainText(firstUni!);
  await expect(ranked(2)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Tests", exact: true }).first(),
  ).toBeVisible();
  await ranked(1)
    .getByRole("button", { name: /^Move .* down$/ })
    .click();
  await page.reload();
  await expect(ranked(2)).toContainText(firstUni!);
  await ranked(2)
    .getByRole("button", { name: /^Remove / })
    .click();
  await expect(ranked(2)).toHaveCount(0);
  await page.reload();
  await expect(ranked(1)).toBeVisible();
  await expect(ranked(1)).not.toContainText(firstUni!);
  await expect(ranked(2)).toHaveCount(0);
});

test("a stored v1 profile is migrated without errors", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "unimatch-profile-v1",
      JSON.stringify({
        nationality: "India",
        educationCountry: "India",
        degreeLevel: "MASTER",
        fieldOfStudy: "Computer Science",
        preferredCountries: ["Germany", "Singapore"],
        budget: 20000,
        currency: "USD",
        intake: "2027-Fall",
        funding: "PARTIAL",
        qualification: "",
        grade: null,
        gradingScale: "",
        ielts: 7,
        toefl: null,
        sat: null,
        act: null,
        gre: null,
        gmat: null,
        bachelorField: "",
        bachelorGpa: null,
        otherCredentials: "",
      }),
    ),
  );
  await page.goto("/results");
  await expect(page.locator(".profile-bar")).toContainText("Bachelor’s");
  await expect(page.locator(".program-card")).toHaveCount(5);
  expect(
    await page.evaluate(() => localStorage.getItem("unimatch-profile-v1")),
  ).toBeNull();
  expect(errors).toEqual([]);
});

test("public pages: no console errors, only Hong Kong and South Korea, no admin or accounts", async ({
  page,
  request,
}) => {
  const errors = collectErrors(page);
  for (const path of publicPages) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const text = await page.locator("body").innerText();
    for (const hidden of ["United States", "Hungary", "Germany", "Singapore"])
      expect(text, path + " mentions " + hidden).not.toContain(hidden);
    await expect(page.getByRole("link", { name: "Account" })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Research administration" }),
    ).toHaveCount(0);
  }
  await page.goto("/results");
  await page.getByRole("link", { name: "View details" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Your financial scenarios" }),
  ).toBeVisible();
  expect(errors).toEqual([]);

  for (const path of ["/admin", "/account"])
    expect((await request.get(path)).status(), path).toBe(404);
  for (const path of [
    "/api/admin/dashboard",
    "/api/account/profile",
    "/api/auth/me",
  ])
    expect((await request.get(path)).status(), path).toBe(404);
  expect(
    (
      await request.post("/api/admin/login", {
        headers: { Origin: "http://localhost:3001" },
        data: { email: "a@example.test", password: "x" },
      })
    ).status(),
  ).toBe(404);
});

test("mobile layout has no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await completeWizard(page);
  for (const path of publicPages) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      path,
    ).toBe(true);
  }
});
