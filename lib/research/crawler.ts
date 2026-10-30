import { CheerioCrawler, Configuration, Request } from "crawlee";
import { chromium, type Browser } from "playwright";
import { load } from "cheerio";
import { createHash, randomUUID } from "node:crypto";
import { limits } from "../config";
import {
  allowedUrl,
  canonicalUrl,
  SafeFetcher,
  type SourcePolicy,
} from "./security";
import { linkScore } from "./relevance";
const SUBRESOURCE_DELAY_MS = 250;
export const relevant =
  /admission|international|undergraduate|graduate|scholarship|funding|fees|tuition|requirements|deadlines|financial.aid|entry.requirement|computer.science|engineering/i;
export function extractHtml(
  html: string,
  url: string,
  policies: SourcePolicy[],
) {
  const $ = load(html);
  const title = $("title").text().trim();
  const scored = new Map<string, number>();
  $("a[href]").each((_, el) => {
    try {
      const href = canonicalUrl(new URL($(el).attr("href")!, url).href);
      const anchor = $(el).text();
      if (allowedUrl(href, policies) && relevant.test(href + " " + anchor)) {
        const score = linkScore(href, anchor);
        if (score > 0) scored.set(href, Math.max(scored.get(href) ?? 0, score));
      }
    } catch {}
  });
  const links = [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([href]) => href);
  const strong = new Set(
    [...scored.entries()].filter(([, v]) => v >= 3).map(([h]) => h),
  );
  $("script,style,noscript,svg,iframe").remove();
  // Page-level chrome goes; a <header>, <nav> or <form> inside the main content (common in CMS
  // templates) can carry the real program facts, so it stays.
  const insideContent = (el: Parameters<typeof $>[0]) =>
    $(el).closest("main,article,[role=main]").length > 0;
  $("nav,footer,header").each((_, el) => {
    if (!insideContent(el)) $(el).remove();
  });
  $("form").each((_, el) => {
    if (!insideContent(el) || $(el).text().trim().length < 400) $(el).remove();
  });
  $("h1,h2,h3,h4,p,li,tr,br,dt,dd").before("\n");
  const clean = (value: string) =>
    value
      .replace(/[\u00a0\u2000-\u200b\u202f\u3000]/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n/g, "\n")
      .trim();
  const mainText = clean($("main").text());
  const bodyText = clean($("body").text());
  // A <main> that holds a sliver of the page is a template quirk, not the content.
  const text =
    mainText.length >= 300 || mainText.length >= bodyText.length * 0.5
      ? mainText
      : bodyText;
  return { title, text, links, strong };
}
export async function extractPdf(buffer: Buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}
export type CrawledDocument = {
  url: string;
  title: string;
  text: string;
  contentHash: string;
  documentType: "HTML" | "PDF";
};
export const contentHash = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export async function crawlSources(
  sources: (SourcePolicy & { startUrl: string; browserRendering: boolean })[],
  onDocument: (doc: CrawledDocument) => Promise<void>,
  log: (message: string) => Promise<void>,
) {
  const config = limits();
  const fetcher = new SafeFetcher(sources);
  let processed = 0;
  const seenHashes = new Set<string>(),
    seenUrls = new Set<string>();
  const crawleeConfig = new Configuration({
    persistStorage: false,
    purgeOnStart: false,
    defaultRequestQueueId: "html-" + randomUUID(),
  });
  // One shared Chromium per crawl; every page gets an isolated, guarded context.
  let browser: Browser | undefined;
  async function renderedText(url: string) {
    browser ??= await chromium.launch({
      headless: true,
      args: [
        "--disable-quic",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      ],
    });
    const context = await browser.newContext({ serviceWorkers: "block" });
    try {
      let requests = 0;
      await context.route("**/*", async (route) => {
        if (
          ++requests > 40 ||
          !["document", "script", "xhr", "fetch"].includes(
            route.request().resourceType(),
          )
        )
          return route.abort();
        try {
          const download = await fetcher.fetch(
            route.request().url(),
            true,
            0,
            SUBRESOURCE_DELAY_MS,
          );
          await route.fulfill({
            status: 200,
            body: download.body,
            contentType: download.type,
          });
        } catch {
          await route.abort();
        }
      });
      await context.routeWebSocket("**/*", (socket) => socket.close());
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      // Single-page apps fill the body after load; wait for real text, not a fixed pause.
      await page
        .waitForFunction(
          () => (document.body?.innerText.length ?? 0) > 400,
          undefined,
          { timeout: 10000 },
        )
        .catch(() => {});
      await page.waitForTimeout(500);
      const html = await page.content();
      if (!html) throw new Error("Browser rendering failed");
      return html;
    } finally {
      await context.close().catch(() => {});
    }
  }
  const crawler = new CheerioCrawler(
    {
      maxRequestsPerCrawl: config.pages,
      maxConcurrency: config.concurrency,
      maxRequestRetries: 1,
      useSessionPool: false,
      requestHandlerTimeoutSecs: 180,
      async requestHandler({ request, crawler }) {
        // Custom pinned-IP transport deliberately replaces Crawlee's unrestricted navigation.
        if (seenUrls.has(request.url)) return;
        const d = await fetcher.fetch(request.url);
        const pdf = d.type.includes("pdf");
        let parsed = pdf
          ? {
              title: new URL(d.url).pathname.split("/").at(-1) ?? "PDF",
              text: await extractPdf(d.body),
              links: [] as string[],
              strong: new Set<string>(),
            }
          : extractHtml(d.body.toString("utf8"), d.url, sources);
        if (
          /captcha|access denied|just a moment|attention required/i.test(
            parsed.title,
          ) ||
          (parsed.text.length < 800 &&
            /captcha|access denied|verify you are human/i.test(parsed.text))
        )
          throw new Error(
            "Access protection detected; skipping without evasion",
          );
        if (!pdf && !d.type.includes("html") && !d.type.includes("text/plain"))
          throw new Error("Unsupported source content type");
        if (
          !pdf &&
          parsed.text.length < 300 &&
          sources.some((s) => s.browserRendering && allowedUrl(d.url, [s]))
        ) {
          await log(
            "Sparse HTML; using approved browser rendering for " + d.url,
          );
          parsed = extractHtml(await renderedText(d.url), d.url, sources);
        }
        if (parsed.text.length < 80)
          throw new Error("Insufficient readable source content");
        const hash = contentHash(parsed.text);
        if (!seenHashes.has(hash)) {
          await onDocument({
            url: d.url,
            title: parsed.title,
            text: parsed.text,
            contentHash: hash,
            documentType: pdf ? "PDF" : "HTML",
          });
          seenHashes.add(hash);
          processed++;
        }
        seenUrls.add(request.url);
        seenUrls.add(d.url);
        const depth = Number(request.userData.depth ?? 0);
        if (depth < config.depth) {
          const next = parsed.links
            .slice(0, config.pages)
            .filter((url) => !seenUrls.has(url))
            .map(
              (url) =>
                new Request({
                  url,
                  skipNavigation: true,
                  userData: { depth: depth + 1 },
                }),
            );
          // Admission, fee and scholarship links jump the queue ahead of generic pages.
          await crawler.addRequests(
            next.filter((r) => parsed.strong.has(r.url)),
            { forefront: true },
          );
          await crawler.addRequests(
            next.filter((r) => !parsed.strong.has(r.url)),
          );
        }
      },
      async failedRequestHandler({ request }, error) {
        await log("FAILED " + request.url + ": " + error.message);
      },
    },
    crawleeConfig,
  );
  try {
    await crawler.run(
      sources.slice(0, config.pages).map(
        (s) =>
          new Request({
            url: s.startUrl,
            skipNavigation: true,
            userData: { depth: 0 },
          }),
      ),
    );
  } finally {
    await browser?.close().catch(() => {});
  }
  if (!processed)
    throw new Error("No accessible, permitted documents were retrieved");
  return processed;
}
