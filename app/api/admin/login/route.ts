import { compare } from "bcryptjs";
import { z } from "zod";
import {
  checkOrigin,
  createSession,
  apiError,
  HttpError,
  readJson,
} from "@/lib/auth";
import { redisConnection } from "@/lib/queue";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { email, password } = z
      .object({
        email: z.string().email().max(254),
        password: z.string().min(1).max(128),
      })
      .parse(await readJson(request));
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD_HASH)
      throw new HttpError(
        503,
        "Administrator credentials are not configured. Follow README setup.",
      );
    const redis = redisConnection();
    let attempts: number;
    try {
      attempts = Number(
        await redis.eval(
          "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],900) end; return n",
          1,
          "admin:login:global",
        ),
      );
    } finally {
      await redis.quit();
    }
    if (attempts > 10)
      throw new HttpError(
        429,
        "Too many sign-in attempts. Try again in 15 minutes.",
      );
    const configuredHash = process.env.ADMIN_PASSWORD_HASH;
    const passwordHash = configuredHash.startsWith("base64:")
      ? Buffer.from(configuredHash.slice(7), "base64").toString("utf8")
      : configuredHash;
    const passwordValid = await compare(password, passwordHash);
    if (
      email.toLowerCase() !== process.env.ADMIN_EMAIL.toLowerCase() ||
      !passwordValid
    )
      throw new HttpError(401, "Invalid email or password");
    await createSession(email.toLowerCase());
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
