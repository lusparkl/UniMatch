import { test, expect } from "@playwright/test";

// Accounts exist only outside PUBLIC_MODE. Student pages keep their data in the browser; the account
// page keeps its own document list and can be deleted.
test("account: sign-up, documents persist, sign-in errors, deletion", async ({
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
    // The old priorities page now lives in the browser-stored shortlist.
    await page.goto("/priorities");
    await expect(page).toHaveURL(/\/shortlist/);

    await page.goto("/account");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: email })).toBeVisible();

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

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/account");
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
    await expect(page.getByRole("heading", { name: email })).toBeVisible();
    await expect(
      page.getByLabel("Status of Passport or national ID"),
    ).toHaveValue("HAVE");

    await page.getByRole("button", { name: "Delete my account" }).click();
    await page.getByLabel("Confirm with your password").fill(password);
    await page.getByRole("button", { name: "Delete everything" }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/account");
    await expect(
      page.getByRole("button", { name: "Create account" }),
    ).toBeVisible();
  }
});
