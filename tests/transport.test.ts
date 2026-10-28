import { it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  requests: [] as { hostname: string }[],
  responses: [] as {
    status: number;
    headers: Record<string, string>;
    body: string;
  }[],
}));
vi.mock("node:dns/promises", () => ({ lookup: mocks.resolve }));
vi.mock("node:https", async () => {
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  return {
    request: (
      options: { hostname: string },
      callback: (response: unknown) => void,
    ) => {
      mocks.requests.push(options);
      const req = new EventEmitter() as InstanceType<typeof EventEmitter> & {
        end: () => void;
        destroy: (error?: Error) => unknown;
      };
      req.destroy = (error?: Error) => {
        if (error) req.emit("error", error);
        return req;
      };
      req.end = () => {
        const entry = mocks.responses.shift();
        if (!entry) {
          req.emit("error", new Error("Unexpected test request"));
          return;
        }
        const response = Object.assign(new PassThrough(), {
          statusCode: entry.status,
          headers: entry.headers,
        });
        callback(response);
        queueMicrotask(() => response.end(entry.body));
      };
      return req;
    },
  };
});
import { SafeFetcher } from "../lib/research/security";
beforeEach(() => {
  mocks.requests.length = 0;
  mocks.responses.length = 0;
  mocks.resolve.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
});
it("pins the network socket to the validated public IP", async () => {
  mocks.responses.push({
    status: 200,
    headers: { "content-type": "text/html" },
    body: "public page",
  });
  await new SafeFetcher(
    [{ hostname: "university.edu", allowSubdomains: false }],
    0,
  ).fetch("https://university.edu", false);
  expect(mocks.requests[0].hostname).toBe("8.8.8.8");
});
it("blocks a redirect to metadata before issuing a second request", async () => {
  mocks.responses.push({
    status: 302,
    headers: { location: "http://169.254.169.254/latest/meta-data" },
    body: "",
  });
  await expect(
    new SafeFetcher(
      [{ hostname: "university.edu", allowSubdomains: false }],
      0,
    ).fetch("https://university.edu", false),
  ).rejects.toThrow("Blocked URL");
  expect(mocks.requests).toHaveLength(1);
});
it("revalidates DNS on an approved redirect and rejects rebinding", async () => {
  mocks.resolve
    .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
    .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
  mocks.responses.push({
    status: 302,
    headers: { location: "https://university.edu/private" },
    body: "",
  });
  await expect(
    new SafeFetcher(
      [{ hostname: "university.edu", allowSubdomains: false }],
      0,
    ).fetch("https://university.edu", false),
  ).rejects.toThrow("private");
  expect(mocks.requests).toHaveLength(1);
});
it("does not download robots-disallowed pages", async () => {
  mocks.responses.push({
    status: 200,
    headers: { "content-type": "text/plain" },
    body: "User-agent: *\nDisallow: /private",
  });
  await expect(
    new SafeFetcher(
      [{ hostname: "university.edu", allowSubdomains: false }],
      0,
    ).fetch("https://university.edu/private"),
  ).rejects.toThrow("robots.txt disallows");
  expect(mocks.requests).toHaveLength(1);
});
it("bounds response bytes during streaming", async () => {
  mocks.responses.push({
    status: 200,
    headers: { "content-type": "text/html" },
    body: "x".repeat(100),
  });
  await expect(
    new SafeFetcher(
      [{ hostname: "university.edu", allowSubdomains: false }],
      0,
      10,
    ).fetch("https://university.edu", false),
  ).rejects.toThrow("Content size");
});
