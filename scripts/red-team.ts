import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { db } from "../lib/db";
import type { Program } from "../lib/domain";
import { AUTO_REVIEWER } from "../lib/research/auto-review";
import { crawlSources, extractHtml, extractPdf } from "../lib/research/crawler";
import { allowedUrl } from "../lib/research/security";
import { squash } from "./curation";
// Plan 3.3 red-team spot check (docs/hackathon/05-deploy-freeze-demo.md §5 at commit 9a198b0). Read-only: nothing is written to the
// database. A seeded RNG samples 8 Hong Kong programmes (at least 3 auto-approved and PASS for some persona) and
// 7 Korean ones. Every trusted rule, tuition figure and deadline is checked against its cited page fetched live:
// approved hosts go through the guarded crawler; owner-requested browser copies are opened one at a time in plain
// headless Chromium, as scripts/import-browser.ts does (no stealth, no bot-check handling). Two automatic checks
// per fact: the quotation is still verbatim on the live page, and the stored value appears in the quotation.
// Facts without a checkable value are listed for manual review. SEED=<n> repeats a sample; OUT=<path> writes JSON.
process.env.DEMO_MODE = "false";
process.env.FRESHNESS_DEADLINE_DAYS ??= "30";
const { getPrograms } = await import("../lib/catalog");
const { matchProgram } = await import("../lib/matching");
const { personas } = await import("../lib/personas");

const seed = Number(process.env.SEED ?? 20261111);
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);
const shuffle = <T>(items: T[]) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const programs = (await getPrograms(true)).sort((a, b) =>
  a.id.localeCompare(b.id),
);
// No demo persona gets an overall PASS (the stories rely on UNKNOWN/FAIL), so "shows PASS" means the academic or
// financial check passes for some persona: the places where wrong auto-approved data would produce a wrong PASS.
const passing = new Set(
  personas.flatMap((persona) =>
    programs
      .filter((p) => {
        const m = matchProgram(p, persona.profile);
        return m.academicState === "PASS" || m.financial === "PASS";
      })
      .map((p) => p.id),
  ),
);
const autoApproved = new Set(
  (
    await db.reviewRecord.findMany({
      where: { administratorIdentity: AUTO_REVIEWER },
      select: { candidate: { select: { programId: true } } },
    })
  ).flatMap((r) => (r.candidate.programId ? [r.candidate.programId] : [])),
);
const hk = shuffle(programs.filter((p) => p.country === "Hong Kong"));
const kr = shuffle(programs.filter((p) => p.country === "South Korea"));
const required = hk
  .filter(
    (p) =>
      p.requirementsComplete && autoApproved.has(p.id) && passing.has(p.id),
  )
  .slice(0, 3);
if (required.length < 3)
  throw new Error(
    `Only ${required.length} Hong Kong programmes are auto-approved and PASS for some persona`,
  );
const sample = [
  ...required,
  ...hk.filter((p) => !required.includes(p)).slice(0, 5),
  ...kr.slice(0, 7),
];
console.log(
  `Seed ${seed}. ${programs.length} published; ${passing.size} PASS for some persona; ${autoApproved.size} auto-approved.`,
);

type Fact = {
  programme: string;
  university: string;
  kind: "rule" | "deadline" | "cost";
  field: string;
  value: string;
  url: string;
  excerpt: string;
  status: string;
  valueInQuote: boolean | null;
  quoteLive?: boolean | null;
  liveError?: string;
};
const trusted = (s: string) => s === "SOURCE_BACKED" || s === "ADMIN_VERIFIED";
const digits = (text: string) =>
  text.replace(/(\d)[,\s](?=\d{3}(?!\d))/g, "$1");
const numberIn = (n: number, text: string) =>
  new RegExp(`(?<![\\d.])${String(n).replace(".", "\\.")}(?![\\d])`).test(
    digits(text),
  );
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
function dateIn(iso: string, timezone: string | null, text: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone ?? "UTC",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, Number(p.value)]),
  );
  const { year: y, month: m, day: d } = parts;
  const name = `(?:${MONTHS[m - 1]}|${MONTHS[m - 1].slice(0, 3)}\\.?|${MONTHS[m - 1].slice(0, 4)}\\.?)`;
  const dd = String(d).padStart(2, "0"),
    mm = String(m).padStart(2, "0");
  return [
    `(?<!\\d)0?${d}(?:st|nd|rd|th)?\\s*(?:of\\s+)?${name}(?![a-z])`,
    `${name}\\s*0?${d}(?!\\d)`,
    `${y}\\s*[-./]\\s*0?${m}\\s*[-./]\\s*0?${d}(?!\\d)`,
    `(?<!\\d)0?${d}\\s*[/.]\\s*0?${m}\\s*[/.]\\s*${y}`,
    `(?<!\\d)(?:${mm}|${m})/(?:${dd}|${d})(?!\\d)`,
    `${m}\\s*월\\s*${d}\\s*일`,
    `${m}\\s*月\\s*${d}\\s*日`,
  ].some((pattern) => new RegExp(pattern, "i").test(text));
}

function facts(p: Program): Fact[] {
  const base = { programme: p.title, university: p.university };
  const out: Fact[] = [];
  for (const r of p.requirements.filter((r) => trusted(r.status))) {
    if (!r.evidence) continue;
    const value =
      r.minimum !== null
        ? `${r.type} ≥ ${r.minimum}${r.scale ? ` (${r.scale})` : ""}`
        : r.allowed.length
          ? `${r.type}: ${r.allowed.join(" | ")}`
          : `${r.type}: ${r.label}`;
    out.push({
      ...base,
      kind: "rule",
      field: r.label,
      value,
      url: r.evidence.url,
      excerpt: r.evidence.excerpt,
      status: r.status,
      valueInQuote:
        r.minimum !== null ? numberIn(r.minimum, r.evidence.excerpt) : null,
    });
  }
  for (const i of p.intakes.filter((i) => trusted(i.status) && i.deadline)) {
    if (!i.evidence) continue;
    out.push({
      ...base,
      kind: "deadline",
      field: `${i.academicYear} ${i.term}: ${i.route}`,
      value: `${i.deadline} (${i.timezone ?? "no timezone"})`,
      url: i.evidence.url,
      excerpt: i.evidence.excerpt,
      status: i.status,
      valueInQuote: dateIn(i.deadline!, i.timezone, i.evidence.excerpt),
    });
  }
  for (const c of p.costs.filter((c) => trusted(c.status))) {
    if (!c.evidence) continue;
    for (const [part, amount] of [
      ["tuition", c.tuition],
      ["living", c.living],
      ["other", c.other],
    ] as const) {
      if (amount === null) continue;
      out.push({
        ...base,
        kind: "cost",
        field: `${part} (${c.period})`,
        value: `${c.currency} ${amount}`,
        url: c.evidence.url,
        excerpt: c.evidence.excerpt,
        status: c.status,
        valueInQuote: numberIn(amount, c.evidence.excerpt),
      });
    }
  }
  return out;
}

const all = sample.flatMap(facts);
const sources = await db.approvedSource.findMany();
const live = new Map<string, string>();
const errors = new Map<string, string>();
const byUniversity = new Map<string, Set<string>>();
for (const p of sample)
  for (const f of facts(p))
    byUniversity.set(
      p.universityId,
      (byUniversity.get(p.universityId) ?? new Set()).add(f.url),
    );
const browserUrls: string[] = [];
for (const [universityId, urls] of byUniversity) {
  const own = sources.filter((s) => s.universityId === universityId);
  const copies = new Set(
    own
      .filter((s) => s.purpose === "owner-browser-copy")
      .map((s) => s.startUrl),
  );
  const crawl = [...urls].filter((u) => !copies.has(u));
  browserUrls.push(...[...urls].filter((u) => copies.has(u)));
  for (const u of crawl.filter((u) => !allowedUrl(u, own)))
    errors.set(u, "not on an approved host");
  const policy = (url: string) =>
    own.find((s) => s.startUrl === url) ?? {
      ...own.find((s) => allowedUrl(url, [s]))!,
      startUrl: url,
    };
  const fetchable = crawl.filter((u) => allowedUrl(u, own));
  if (!fetchable.length) continue;
  await crawlSources(
    fetchable.map(policy),
    async (d) => {
      live.set(d.url, d.text);
    },
    async (message) => {
      if (message.startsWith("FAILED")) console.log("   " + message);
    },
    0,
  ).catch((error) => console.log("   " + String(error)));
}
if (browserUrls.length) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  for (const url of browserUrls) {
    try {
      const head = await context.request.get(url, {
        timeout: 45000,
        maxRedirects: 5,
      });
      if (!head.ok()) throw new Error("HTTP " + head.status());
      const body = await head.body();
      if (body.subarray(0, 5).toString("latin1") === "%PDF-")
        live.set(url, await extractPdf(body));
      else {
        const page = await context.newPage();
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        if (!response?.ok()) throw new Error("HTTP " + response?.status());
        await page.waitForTimeout(1500);
        const text = extractHtml(await page.content(), url, [
          { hostname: new URL(url).hostname, allowSubdomains: false },
        ]).text;
        await page.close();
        if (/security verification|captcha|verify you are human/i.test(text))
          throw new Error("Bot check shown; not bypassed");
        live.set(url, text);
      }
    } catch (error) {
      errors.set(url, String(error).slice(0, 160));
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  await browser.close();
}
for (const f of all) {
  const text = live.get(f.url);
  f.quoteLive =
    text === undefined ? null : squash(text).includes(squash(f.excerpt));
  if (text === undefined) f.liveError = errors.get(f.url) ?? "not returned";
}

for (const p of sample) {
  const list = all.filter(
    (f) => f.programme === p.title && f.university === p.university,
  );
  const tag = required.includes(p) ? " [auto-approved, PASS]" : "";
  console.log(`\n${p.university} | ${p.title}${tag}`);
  console.log(
    `   facts ${list.length}; quote live ${list.filter((f) => f.quoteLive).length}, quote gone ${list.filter((f) => f.quoteLive === false).length}, page not fetched ${list.filter((f) => f.quoteLive === null).length}; value in quote ${list.filter((f) => f.valueInQuote).length}, value NOT in quote ${list.filter((f) => f.valueInQuote === false).length}, manual ${list.filter((f) => f.valueInQuote === null).length}`,
  );
  for (const f of list.filter(
    (f) => f.quoteLive !== true || f.valueInQuote === false,
  ))
    console.log(
      `   CHECK ${f.kind} ${f.field} = ${f.value}; quoteLive=${f.quoteLive}${f.liveError ? ` (${f.liveError})` : ""}; valueInQuote=${f.valueInQuote}`,
    );
}
if (process.env.OUT)
  writeFileSync(
    process.env.OUT,
    JSON.stringify(
      { seed, sample: sample.map((p) => p.id), facts: all },
      null,
      2,
    ),
  );
await db.$disconnect();
process.exit(0);
