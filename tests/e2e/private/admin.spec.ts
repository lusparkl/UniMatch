import { test, expect } from "@playwright/test";
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
