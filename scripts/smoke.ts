import { chromium, type Page } from "playwright";
import { getPrograms } from "../lib/catalog";
import { compareMatches, matchProgram } from "../lib/matching";
import { personas } from "../lib/personas";
import { statusLabel } from "../components/results";
// Smoke test of a running site: npm run smoke -- <url>. Expectations come from the local catalog snapshot,
// which must be the one deployed (CATALOG_SOURCE=snapshot, same freshness settings as the host).
// Checks HTTP 200 and no console or page errors on every page, that each persona's story holds for the
// snapshot, and that the site shows each persona the same top result and status. Exits 1 on any failure.
const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!base) {
  console.error("Usage: npm run smoke -- <url>");
  process.exit(2);
}
const failures: string[] = [];
const fail = (message: string) => {
  failures.push(message);
  console.log("FAIL", message);
};
const programs = (await getPrograms()).filter(
  (p) => p.degreeLevel === "BACHELOR",
);
const health = await (await fetch(base + "/api/health")).json();
if (health.programmes !== programs.length)
  fail(
    `/api/health reports ${health.programmes} programmes; the local snapshot has ${programs.length}`,
  );
const browser = await chromium.launch();
async function visit(page: Page, path: string) {
  const response = await page.goto(base + path, { waitUntil: "networkidle" });
  if (response?.status() !== 200)
    fail(`${path} returned ${response?.status()}`);
  // Profile-dependent content renders after hydration reads browser storage.
  await page.waitForTimeout(1000);
}
for (const persona of personas) {
  const matches = programs
    .map((p) => matchProgram(p, persona.profile))
    .sort(compareMatches);
  for (const f of persona.check(matches)) fail(`${persona.id}: story: ${f}`);
  const context = await browser.newContext();
  await context.addInitScript(
    (profile) =>
      localStorage.setItem("unimatch-profile-v2", JSON.stringify(profile)),
    persona.profile,
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await visit(page, "/results");
  const card = page.locator(".program-card").first();
  const title = await card.locator(".program-title").innerText();
  const status = await card.locator(".card-top .tag").innerText();
  const top = matches[0];
  if (title.trim() !== top.program.title)
    fail(
      `${persona.id}: top result "${title}", expected "${top.program.title}"`,
    );
  if (status.trim() !== statusLabel[top.status])
    fail(
      `${persona.id}: top status "${status}", expected "${statusLabel[top.status]}"`,
    );
  await visit(
    page,
    `/universities/${top.program.universityId}?program=${top.program.id}`,
  );
  await visit(page, "/shortlist");
  await visit(
    page,
    "/compare?ids=" +
      matches
        .slice(0, 2)
        .map((m) => m.program.id)
        .join(","),
  );
  for (const e of errors) fail(`${persona.id}: browser error: ${e}`);
  await context.close();
  console.log(`ok ${persona.id}: ${top.program.title} (${top.status})`);
}
const page = await browser.newPage();
await visit(page, "/");
await visit(page, "/deadlines");
await browser.close();
console.log(
  failures.length ? `${failures.length} failures` : "Smoke test passed.",
);
process.exit(failures.length ? 1 : 0);
