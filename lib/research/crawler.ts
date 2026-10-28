import {
  CheerioCrawler,
  PlaywrightCrawler,
  Configuration,
  Request,
} from "crawlee";
import { load } from "cheerio";
import { createHash, randomUUID } from "node:crypto";
import { limits } from "../config";
import {
  allowedUrl,
  canonicalUrl,
  SafeFetcher,
  type SourcePolicy,
} from "./security";
export const relevant =
  /admission|international|undergraduate|graduate|scholarship|funding|fees|tuition|requirements|deadlines|financial.aid|entry.requirement|computer.science|engineering/i;
export function extractHtml(
  html: string,
  url: string,
  policies: SourcePolicy[],
) {
  const $ = load(html);
  const title = $("title").text().trim();
  const links: string[] = [];
  $("a[href]").each((_, el) => {
    try {
      const href = canonicalUrl(new URL($(el).attr("href")!, url).href);
      if (
        allowedUrl(href, policies) &&
        relevant.test(href + " " + $(el).text())
      )
        links.push(href);
    } catch {}
  });
  $("script,style,nav,footer,header,noscript,svg,form").remove();
  $("h1,h2,h3,h4,p,li,tr,br").before("\n");
  const text = ($("main").length ? $("main") : $("body"))
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
  return { title, text, links: [...new Set(links)] };
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
  async function renderedText(url: string) {
    let result = "";
    let requests = 0;
    const browser = new PlaywrightCrawler(
      {
        maxRequestsPerCrawl: 1,
        maxConcurrency: 1,
        maxRequestRetries: 0,
        useSessionPool: false,
        launchContext: {
          launchOptions: {
            headless: true,
            args: [
              "--disable-quic",
              "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
            ],
          },
        },
        async requestHandler({ page }) {
          await page.context().route("**/*", async (route) => {
            if (
              ++requests > 20 ||
              !["document", "script", "stylesheet", "xhr", "fetch"].includes(
                route.request().resourceType(),
              )
            )
              return route.abort();
            try {
              const download = await fetcher.fetch(route.request().url());
              await route.fulfill({
                status: 200,
                body: download.body,
                contentType: download.type,
              });
            } catch {
              await route.abort();
            }
          });
          await page
            .context()
            .routeWebSocket("**/*", (socket) => socket.close());
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
          await page.waitForTimeout(1200);
          result = await page.content();
        },
        browserPoolOptions: {
          prePageCreateHooks: [
            (_id, _controller, pageOptions) => {
              if (pageOptions) pageOptions.serviceWorkers = "block";
            },
          ],
        },
      },
      new Configuration({
        persistStorage: false,
        purgeOnStart: false,
        defaultRequestQueueId: "browser-" + randomUUID(),
      }),
    );
    await browser.run([new Request({ url, skipNavigation: true })]);
    if (!result) throw new Error("Browser rendering failed");
    return result;
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
        if (depth < config.depth)
          await crawler.addRequests(
            parsed.links
              .slice(0, config.pages)
              .filter((url) => !seenUrls.has(url))
              .map(
                (url) =>
                  new Request({
                    url,
                    skipNavigation: true,
                    userData: { depth: depth + 1 },
                  }),
              ),
          );
      },
      async failedRequestHandler({ request }, error) {
        await log("FAILED " + request.url + ": " + error.message);
      },
    },
    crawleeConfig,
  );
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
  if (!processed)
    throw new Error("No accessible, permitted documents were retrieved");
  return processed;
}
