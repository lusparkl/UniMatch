import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import ipaddr from "ipaddr.js";
import robotsParser from "robots-parser";
import { limits } from "../config";
export type SourcePolicy = { hostname: string; allowSubdomains: boolean };
export const USER_AGENT = "UniMatchResearch/0.1";
export function canonicalUrl(raw: string) {
  const u = new URL(raw);
  u.hash = "";
  for (const key of [...u.searchParams.keys()])
    if (key.startsWith("utm_")) u.searchParams.delete(key);
  u.searchParams.sort();
  return u.toString();
}
export function allowedUrl(raw: string, policies: SourcePolicy[]): boolean {
  try {
    const u = new URL(raw);
    return (
      ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      (!u.port ||
        (u.port === "443" && u.protocol === "https:") ||
        (u.port === "80" && u.protocol === "http:")) &&
      policies.some(
        (p) =>
          u.hostname === p.hostname ||
          (p.allowSubdomains && u.hostname.endsWith("." + p.hostname)),
      )
    );
  } catch {
    return false;
  }
}
export function publicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
export async function resolvePublic(
  url: string,
  policies: SourcePolicy[],
  resolver = lookup,
) {
  if (!allowedUrl(url, policies))
    throw new Error("Blocked URL: unsupported or unapproved destination");
  const u = new URL(url);
  const addresses = await resolver(u.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error("Blocked private, internal or reserved IP destination");
  return addresses[0];
}
export type Download = {
  url: string;
  body: Buffer;
  type: string;
  status: number;
};
export class SafeFetcher {
  private active = 0;
  private waiting: Array<() => void> = [];
  private async acquire() {
    if (this.active >= limits().concurrency)
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.active++;
  }
  private release() {
    const next = this.waiting.shift();
    if (next) next();
    else this.active--;
  }
  private last = new Map<string, number>();
  private locks = new Map<string, Promise<unknown>>();
  private robots = new Map<string, ReturnType<typeof robotsParser>>();
  constructor(
    public policies: SourcePolicy[],
    private delay = limits().delay,
    private maxBytes = limits().bytes,
  ) {}
  private async throttle(host: string) {
    const previous = this.locks.get(host) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        const ms = this.delay - (Date.now() - (this.last.get(host) ?? 0));
        if (ms > 0) await new Promise((r) => setTimeout(r, ms));
        this.last.set(host, Date.now());
      });
    this.locks.set(host, next);
    await next;
  }
  async fetch(
    raw: string,
    checkRobots = true,
    redirects = 0,
  ): Promise<Download> {
    if (redirects > 5) throw new Error("Redirect limit exceeded");
    const url = canonicalUrl(raw),
      u = new URL(url);
    const destination = await resolvePublic(url, this.policies);
    if (checkRobots) {
      let parser = this.robots.get(u.origin);
      if (!parser) {
        const robots = await this.fetch(u.origin + "/robots.txt", false);
        if (robots.status !== 200 && robots.status !== 404)
          throw new Error(
            "robots.txt unavailable; research paused conservatively",
          );
        parser = robotsParser(
          u.origin + "/robots.txt",
          robots.status === 404 ? "" : robots.body.toString("utf8"),
        );
        this.robots.set(u.origin, parser);
      }
      if (parser.isAllowed(url, USER_AGENT) === false)
        throw new Error("robots.txt disallows this page");
      const crawlDelay = parser.getCrawlDelay(USER_AGENT);
      if (crawlDelay) this.delay = Math.max(this.delay, crawlDelay * 1000);
    }
    await this.acquire();
    await this.throttle(u.hostname);
    const result = await new Promise<Download & { location?: string }>(
      (resolve, reject) => {
        // Connect to the validated IP directly. Host/SNI remain original. DNS cannot rebind.
        const request = (u.protocol === "https:" ? httpsRequest : httpRequest)(
          {
            hostname: destination.address,
            family: destination.family,
            port: u.protocol === "https:" ? 443 : 80,
            path: u.pathname + u.search,
            method: "GET",
            servername: u.hostname,
            headers: {
              Host: u.host,
              "User-Agent": USER_AGENT,
              Accept:
                "text/html,application/pdf,application/javascript,text/plain;q=0.8",
              "Accept-Encoding": "identity",
            },
            timeout: 20000,
          },
          (response) => {
            const chunks: Buffer[] = [];
            let size = 0;
            response.on("data", (chunk: Buffer) => {
              size += chunk.length;
              if (size > this.maxBytes) {
                response.destroy();
                request.destroy(new Error("Content size limit exceeded"));
              } else chunks.push(chunk);
            });
            response.on("error", reject);
            response.on("end", () =>
              resolve({
                url,
                body: Buffer.concat(chunks),
                type: String(response.headers["content-type"] ?? ""),
                status: response.statusCode ?? 0,
                location: response.headers.location,
              }),
            );
          },
        );
        request.on("timeout", () =>
          request.destroy(new Error("Source request timed out")),
        );
        request.on("error", reject);
        request.end();
      },
    ).finally(() => this.release());
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      if (!result.location) throw new Error("Redirect without destination");
      return this.fetch(
        new URL(result.location, url).href,
        checkRobots,
        redirects + 1,
      );
    }
    if (result.status !== 200 && !(result.status === 404 && !checkRobots))
      throw new Error(
        "Source returned HTTP " +
          result.status +
          "; access restrictions are not bypassed",
      );
    return result;
  }
}
