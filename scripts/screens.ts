import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { personaById } from "../lib/personas";
// Screenshots of the public pages at 390 px and 1440 px into output/screens/, with the "ib" sample student
// loaded. Also reports horizontal overflow and console errors. Usage: npm run screens -- <base url>
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const out = "output/screens";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const problems: string[] = [];
for (const width of [390, 1440]) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
  });
  await context.addInitScript(
    (profile) =>
      localStorage.setItem("unimatch-profile-v2", JSON.stringify(profile)),
    personaById("ib")!.profile,
  );
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`${width}px console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`${width}px page: ${e.message}`));
  await page.goto(base + "/results", { waitUntil: "networkidle" });
  const detail = await page
    .locator('a:has-text("View details")')
    .first()
    .getAttribute("href");
  for (const [name, path] of [
    ["home", "/"],
    ["profile", "/profile"],
    ["results", "/results"],
    ["detail", detail ?? "/results"],
    ["shortlist", "/shortlist"],
    ["deadlines", "/deadlines"],
  ] as const) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    // Profile-dependent content renders after hydration reads browser storage.
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    if (overflow > 0)
      problems.push(`${width}px ${path}: ${overflow}px horizontal overflow`);
    await page.screenshot({ path: `${out}/${name}-${width}.png` });
  }
  await context.close();
}
await browser.close();
console.log(problems.length ? problems.join("\n") : "No overflow or errors.");
process.exit(problems.length ? 1 : 0);
