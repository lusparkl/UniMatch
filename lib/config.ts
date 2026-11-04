export const positive = (name: string, fallback: number, max = 1_000_000) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > max)
    throw new Error("Invalid configuration: " + name);
  return value;
};
export const demoMode = () =>
  process.env.DEMO_MODE === "DEMO_FIXTURES" ||
  (!process.env.DATABASE_URL && process.env.DEMO_MODE !== "false");
/** Countries whose programmes students see. Other seeded countries stay in the database but are never shown. */
export const enabledCountries = () =>
  (process.env.ENABLED_COUNTRIES ?? "Hong Kong,South Korea")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
/** Public deployment: no admin, accounts or Redis; student data stays in the browser. */
export const isPublicMode = () => process.env.PUBLIC_MODE === "true";
/** Where the student catalog is read from: the database, or a bundled JSON snapshot. */
export const catalogSource = () =>
  process.env.CATALOG_SOURCE === "snapshot" ? "snapshot" : "db";
export const limits = () => ({
  pages: positive("MAX_CRAWL_PAGES", 12, 500),
  depth: positive("MAX_CRAWL_DEPTH", 3, 10),
  concurrency: positive("MAX_CONCURRENT_CRAWLS", 2, 4),
  delay: Math.max(2000, positive("CRAWL_DELAY_MS", 2000)),
  bytes: positive("MAX_CONTENT_BYTES", 2_000_000, 10_000_000),
  calls: positive("MAX_AI_CALLS_PER_JOB", 6, 500),
  tokens: positive("DAILY_AI_TOKEN_LIMIT", 100000, 100_000_000),
  output: positive("MAX_AI_OUTPUT_TOKENS", 4000, 16000),
});
