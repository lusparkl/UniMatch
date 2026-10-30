import { test, expect } from "@playwright/test";

test("account: profile syncs, priorities show tests and documents, data is deletable", async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@example.test`;
  const password = "e2e-test-password-1";
  try {
    await run();
  } finally {
    // A failed run must not leave an account behind; harmless when the test already deleted it.
    await page.request.delete("/api/account/me", {
      data: { password },
      headers: { origin: "http://localhost:3001" },
    });
  }

  async function run() {
    // Anonymous visitors are sent to sign in when they open priorities.
    await page.goto("/priorities");
    await expect(page).toHaveURL(/\/account\?next=(%2F|\/)priorities/);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/priorities/);
    await expect(
      page.getByRole("heading", { name: "My priorities" }),
    ).toBeVisible();
    await expect(page.getByText("No priorities yet.")).toBeVisible();

    // Profile with a Duolingo result: saved to the account, not only this browser.
    await page.goto("/profile");
    await page.getByLabel("Nationality / citizenship").fill("Ukraine");
    await page.getByLabel("Country of education").fill("Ukraine");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Duolingo English Test").fill("130");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Available annual budget").fill("40000");
    await page.getByRole("button", { name: "Show my matches" }).click();
    await expect(page).toHaveURL(/results/);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator(".program-card").first()).toBeVisible();
    await expect(page.getByText("Profile needed")).toHaveCount(0);

    // Add the first program to priorities.
    await page
      .getByRole("button", { name: "Add to priorities" })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Remove from priorities" }),
    ).toHaveCount(1);

    await page.goto("/priorities");
    await expect(page.getByText("#1 ·")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Tests", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Documents", exact: true }),
    ).toBeVisible();

    // Documents marked on the account page show as held.
    await page.goto("/account");
    const saved = page.waitForResponse(
      (r) => r.url().includes("/api/account/documents/passport") && r.ok(),
    );
    await page
      .getByLabel("Status of Passport or national ID")
      .selectOption("HAVE");
    await saved;
    await page.reload();
    await expect(
      page.getByLabel("Status of Passport or national ID"),
    ).toHaveValue("HAVE");

    // Sign out blocks account pages; signing in again restores the data.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/priorities");
    await expect(page).toHaveURL(/\/account/);
    await page
      .getByRole("button", { name: "I already have an account" })
      .click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("wrong-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("p.error")).toHaveText(
      "Invalid email or password",
    );
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("heading", { name: "My priorities" }),
    ).toBeVisible();
    await expect(page.getByText("#1 ·")).toBeVisible();

    // Deleting the account removes everything.
    await page.goto("/account");
    await page.getByRole("button", { name: "Delete my account" }).click();
    await page.getByLabel("Confirm with your password").fill(password);
    await page.getByRole("button", { name: "Delete everything" }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/priorities");
    await expect(page).toHaveURL(/\/account/);
  }
});
