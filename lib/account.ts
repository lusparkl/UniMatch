import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { db } from "./db";
import { HttpError, hashToken } from "./auth";
import { redisConnection } from "./queue";

const COOKIE = "unimatch-user";
const SESSION_DAYS = 30;

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10, "Use at least 10 characters").max(128),
});

export const hashPassword = (password: string) => hash(password, 12);
export const verifyPassword = (password: string, passwordHash: string) =>
  compare(password, passwordHash);

/** Counts an attempt for a key and rejects once the window's limit is exceeded. */
export async function limitAttempts(key: string, max: number, seconds: number) {
  const redis = redisConnection();
  let attempts: number;
  try {
    attempts = Number(
      await redis.eval(
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
        1,
        key,
        seconds,
      ),
    );
  } finally {
    await redis.quit();
  }
  if (attempts > max)
    throw new HttpError(429, "Too many attempts. Try again later.");
}

export async function createUserSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600000);
  await db.userSession.create({
    data: { id: hashToken(token), userId, expiresAt: expires },
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https:"),
    path: "/",
    expires,
  });
}

export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.userSession.findUnique({
    where: { id: hashToken(token) },
    include: { user: { select: { id: true, email: true, profile: true } } },
  });
  return session && session.expiresAt > new Date() ? session.user : null;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Sign in required");
  return user;
}

export async function destroyUserSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token)
    await db.userSession.deleteMany({ where: { id: hashToken(token) } });
  (await cookies()).delete(COOKIE);
}
