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
