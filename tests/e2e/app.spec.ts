import { test, expect } from "@playwright/test";
test("landing, profile wizard, results filters and official detail layout", async ({
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
  await page.getByLabel("Nationality / citizenship").fill("Ukraine");
  await page.getByLabel("Country of education").fill("Ukraine");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("IELTS overall").fill("7");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Available annual budget").fill("40000");
  await page.getByRole("button", { name: "Show my matches" }).click();
  await expect(page).toHaveURL(/results/);
  await expect(page.locator(".program-card")).toHaveCount(5);
  await page.screenshot({
    path: "output/playwright/results.png",
    fullPage: true,
  });
  await page
    .getByRole("combobox", { name: "Destination", exact: true })
    .selectOption("Germany");
  await expect(page.locator(".program-card")).toHaveCount(1);
  await page.getByRole("link", { name: "View details" }).click();
  await expect(
    page.getByRole("heading", { name: "Your financial scenarios" }),
  ).toBeVisible();
  await expect(page.getByText("CONFLICTING", { exact: true })).toBeVisible();
  await page.goto("/profile");
  await expect(page.getByLabel("Nationality / citizenship")).toHaveValue(
    "Ukraine",
  );
  await page.getByRole("button", { name: "Delete my saved profile" }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("unimatch-profile-v1")),
  ).toBeNull();
});
test("master's profile and mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/profile");
  await page.getByLabel("Nationality / citizenship").fill("India");
  await page.getByLabel("Country of education").fill("India");
  await page.getByLabel("Intended degree").selectOption("MASTER");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Previous bachelor’s field")).toBeVisible();
  await page.getByLabel("Previous bachelor’s field").fill("Computer Science");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Show my matches" }).click();
  await expect(page.locator(".program-card")).toHaveCount(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("admin routes reject anonymous callers and cross-origin writes", async ({
  request,
}) => {
  expect((await request.get("/api/admin/dashboard")).status()).toBe(401);
  expect(
    (
      await request.post("/api/admin/research", {
        headers: { Origin: "http://localhost:3001" },
        data: { universityId: "hkust", targets: ["admissions"] },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/admin/login", {
        headers: { Origin: "https://evil.test" },
        data: {
          email: "test-admin@example.test",
          password: "test-only-password-123",
        },
      })
    ).status(),
  ).toBe(403);
});
test("admin authentication, polling and honest missing-key error", async ({
  page,
  request,
}) => {
  await page.goto("/admin");
  await page
    .getByLabel("Email", { exact: true })
    .fill("test-admin@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-only-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Good decisions start with good data." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Universities", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Approved institutions" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Approved university", exact: true })
    .selectOption("hkust");
  await expect(
    page.getByRole("button", { name: "Research / refresh" }),
  ).toBeDisabled();
  const response = await page.request.post("/api/admin/research", {
    headers: { Origin: "http://localhost:3001" },
    data: { universityId: "hkust", targets: ["admissions"] },
  });
  expect(response.status()).toBe(503);
  expect(await response.json()).toMatchObject({
    error: expect.stringContaining("disabled"),
  });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Administrator sign-in" }),
  ).toBeVisible();
  expect((await request.get("/api/admin/dashboard")).status()).toBe(401);
});
