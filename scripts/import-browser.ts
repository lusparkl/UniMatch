import { chromium } from "playwright";
import { db } from "../lib/db";
import { contentHash, extractHtml, extractPdf } from "../lib/research/crawler";
// Owner-requested browser copies (2026-11-10). These official pages are disallowed for automated crawlers by
// robots.txt, so the guarded crawler never fetches them. At the owner's explicit request they were opened one
// at a time in a plain headless Chromium (no stealth, no CAPTCHA or bot-check handling, 2 s apart) and stored as
// page versions. The approved source records this with purpose "owner-browser-copy": the pipeline and
// recheck-sources skip such sources, so nothing re-crawls them automatically. Dry run lists; APPLY=1 writes.
const apply = process.env.APPLY === "1";
const PURPOSE = "owner-browser-copy";
export const universities = [
  {
    id: "yonsei-uic",
    name: "Yonsei University, Underwood International College",
    city: "Seoul",
    officialWebsite: "https://uic.yonsei.ac.kr/",
  },
  {
    id: "gist",
    name: "GIST (Gwangju Institute of Science and Technology)",
    city: "Gwangju",
    officialWebsite: "https://www.gist.ac.kr/",
  },
  {
    id: "skku",
    name: "Sungkyunkwan University (SKKU)",
    city: "Seoul",
    officialWebsite: "https://www.skku.edu/eng/",
  },
].map((u) => ({ ...u, country: "South Korea" }));
const uic = (mid: string, page = "admission") =>
  `https://uic.yonsei.ac.kr/${page}.php?mid=${mid}`;
export const pages: { universityId: string; url: string }[] = [
  ...[
    uic("m04_02_02"),
    uic("m04_03"),
    ...[
      "m02_01_02",
      "m02_01_03",
      "m02_01_04",
      "m02_02_06",
      "m02_03_01",
      "m02_02_03",
    ].map((m) => uic(m, "undergraduate")),
    ...["3920", "3921", "3923", "3936"].map(
      (fid) =>
        `https://uic.yonsei.ac.kr/downloadfile.php?mid=m04_02_02&fid=${fid}`,
    ),
  ].map((url) => ({ universityId: "yonsei-uic", url })),
  ...[
    "https://www.gist.ac.kr/iuadm/img/sub02/2027_Fall_Undergraduate_Admission_Guideline_Final.pdf",
    "https://www.gist.ac.kr/iuadm/html/sub03/0301.html",
    "https://www.gist.ac.kr/iuadm/html/sub02/0206.html",
  ].map((url) => ({ universityId: "gist", url })),
  ...[
    "https://admission-global.skku.edu/eng/undergraduate_view.html?idx=59072",
    "https://admission-global.skku.edu/common/download.php?fpath=board/20261104163812E4JXRE.pdf&fname=%5BEN%5D+Undergraduate+Freshmen+Admission+Guide_2027+Spring.pdf",
    "https://admission-global.skku.edu/common/download.php?fpath=board/2026110510192036SXXC.pdf&fname=%28ENG%29+SKKU+Global+Leader+Scholarship+Type+A_List+of+Eligible+Countries_2027.pdf",
  ].map((url) => ({ universityId: "skku", url })),
];
if (process.argv[1]?.endsWith("import-browser.ts")) {
  if (!apply) {
    for (const p of pages) console.log(`   ${p.universityId} ${p.url}`);
    console.log("Dry run. Set APPLY=1 to fetch and store.");
    process.exit(0);
  }
  for (const { id, ...u } of universities)
    await db.university.upsert({
      where: { id },
      create: { id, ...u },
      update: { country: u.country, city: u.city },
    });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  for (const { universityId, url } of pages) {
    await db.approvedSource.upsert({
      where: { universityId_startUrl: { universityId, startUrl: url } },
      create: {
        universityId,
        startUrl: url,
        hostname: new URL(url).hostname,
        purpose: PURPOSE,
        allowSubdomains: false,
      },
      update: { purpose: PURPOSE },
    });
    let doc: {
      title: string;
      text: string;
      documentType: "HTML" | "PDF";
      url: string;
    };
    try {
      const head = await context.request.get(url, {
        timeout: 45000,
        maxRedirects: 5,
      });
      if (!head.ok()) throw new Error("HTTP " + head.status());
      const type = head.headers()["content-type"] ?? "";
      const body = await head.body();
      if (body.subarray(0, 5).toString("latin1") === "%PDF-") {
        const name = decodeURIComponent(
          new URL(url).searchParams.get("fname") ??
            new URL(url).pathname.split("/").at(-1) ??
            "PDF",
        );
        doc = {
          url,
          title: name.replace(/\+/g, " "),
          text: await extractPdf(body),
          documentType: "PDF",
        };
      } else if (!type.includes("html")) {
        throw new Error("Unsupported content type " + type);
      } else {
        const page = await context.newPage();
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        if (!response?.ok()) throw new Error("HTTP " + response?.status());
        await page
          .waitForFunction(
            () => (document.body?.innerText.length ?? 0) > 400,
            undefined,
            { timeout: 10000 },
          )
          .catch(() => {});
        await page.waitForTimeout(1500);
        const parsed = extractHtml(await page.content(), url, [
          { hostname: new URL(url).hostname, allowSubdomains: false },
        ]);
        await page.close();
        if (
          /security verification|captcha|verify you are human/i.test(
            parsed.text.slice(0, 600),
          )
        )
          throw new Error("Bot check shown; not bypassed");
        doc = {
          url,
          title: parsed.title,
          text: parsed.text,
          documentType: "HTML",
        };
      }
    } catch (error) {
      console.log(`   FAILED ${url}: ${String(error).slice(0, 120)}`);
      continue;
    }
    if (doc.text.length < 80) {
      console.log(`   EMPTY ${url}`);
      continue;
    }
    doc.text = doc.text.replace(/\u0000/g, "");
    const hash = contentHash(doc.text);
    const before = await db.sourceDocument.findFirst({
      where: { universityId, url },
      orderBy: { retrievedAt: "desc" },
    });
    if (before?.contentHash === hash)
      await db.sourceDocument.update({
        where: { id: before.id },
        data: { lastCheckedAt: new Date() },
      });
    else
      await db.sourceDocument.create({
        data: {
          ...doc,
          universityId,
          contentHash: hash,
          previousVersionId: before?.id,
        },
      });
    console.log(
      `   stored ${universityId} ${doc.documentType} ${doc.text.length} ${doc.title.slice(0, 60)}`,
    );
    await new Promise((r) => setTimeout(r, 2000));
  }
  await browser.close();
  process.exit(0);
}
