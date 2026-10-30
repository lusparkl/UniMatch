import { it, expect, vi } from "vitest";
import { SafeFetcher } from "../../lib/research/security";
import { crawlSources, type CrawledDocument } from "../../lib/research/crawler";
it("renders sparse HTML through PlaywrightCrawler with every request intercepted", async () => {
  vi.stubEnv("MAX_CRAWL_PAGES", "1");
  const body = Buffer.from(
    '<html><title>Rendered official fixture</title><main id="content"></main><script>document.getElementById("content").textContent="Computer Science admission requirements: this text was rendered by JavaScript in the local test browser, with no real university requests.";</script></html>',
  );
  vi.spyOn(SafeFetcher.prototype, "fetch").mockResolvedValue({
    url: "https://university.edu/program",
    body,
    type: "text/html",
    status: 200,
  });
  const documents: CrawledDocument[] = [];
  await crawlSources(
    [
      {
        hostname: "university.edu",
        allowSubdomains: false,
        startUrl: "https://university.edu/program",
        browserRendering: true,
      },
    ],
    async (d) => {
      documents.push(d);
    },
    async () => {},
  );
  expect(documents[0].text).toContain("rendered by JavaScript");
  vi.unstubAllEnvs();
});

it("waits for scripts that fill the page late and ignores blocked third-party resources", async () => {
  vi.stubEnv("MAX_CRAWL_PAGES", "1");
  const requested: string[] = [];
  vi.spyOn(SafeFetcher.prototype, "fetch").mockImplementation(async (raw) => {
    requested.push(raw);
    if (raw.endsWith("/app.js"))
      return {
        url: raw,
        body: Buffer.from(
          'setTimeout(()=>{document.getElementById("c").textContent="Tuition is HK$ 180,000 per year. Application deadline 15 January 2027. "+"Applicants need IELTS 6.5 overall. ".repeat(20)},1500)',
        ),
        type: "text/javascript",
        status: 200,
      };
    if (raw.includes("tracker.example"))
      throw new Error("Blocked URL: unsupported or unapproved destination");
    return {
      url: raw,
      body: Buffer.from(
        '<html><title>Late app</title><body><main id="c"></main><script src="https://tracker.example/t.js"></script><script src="/app.js"></script></body></html>',
      ),
      type: "text/html",
      status: 200,
    };
  });
  const documents: CrawledDocument[] = [];
  await crawlSources(
    [
      {
        hostname: "university.edu",
        allowSubdomains: false,
        startUrl: "https://university.edu/late",
        browserRendering: true,
      },
    ],
    async (d) => {
      documents.push(d);
    },
    async () => {},
  );
  expect(documents[0].text).toContain("HK$ 180,000");
  expect(requested.some((u) => u.endsWith(".css"))).toBe(false);
  vi.unstubAllEnvs();
});
