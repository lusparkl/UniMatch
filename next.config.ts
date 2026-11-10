import type { NextConfig } from "next";
const config: NextConfig = {
  // CATALOG_SOURCE=snapshot reads this file at run time.
  outputFileTracingIncludes: { "/**": ["./data/catalog-snapshot.json"] },
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "bullmq",
    "ioredis",
    "bcryptjs",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
