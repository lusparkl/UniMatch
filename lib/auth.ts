import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function checkOrigin(request: Request) {
  const expected = new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ).origin;
  if (request.headers.get("origin") !== expected)
    throw new HttpError(403, "Request origin is not allowed");
}
export async function adminSession() {
  const token = (await cookies()).get("unimatch-admin")?.value;
  if (!token) return null;
  const session = await db.adminSession.findUnique({
    where: { id: hashToken(token) },
  });
  return session && session.expiresAt > new Date() ? session : null;
}
export async function requireAdmin() {
  const session = await adminSession();
  if (!session) throw new HttpError(401, "Administrator sign-in required");
  return session;
}
export async function createSession(email: string) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 8 * 3600000);
  await db.adminSession.create({
    data: {
      id: hashToken(token),
      administratorIdentity: email,
      expiresAt: expires,
    },
  });
  (await cookies()).set("unimatch-admin", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https:"),
    path: "/",
    expires,
  });
}
export async function deleteSession() {
  const token = (await cookies()).get("unimatch-admin")?.value;
  if (token)
    await db.adminSession.deleteMany({ where: { id: hashToken(token) } });
  (await cookies()).delete("unimatch-admin");
}
export function apiError(error: unknown) {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error(error instanceof Error ? error.message : "Request failed");
  return Response.json(
    { error: error instanceof Error ? error.message : "Request failed" },
    { status: 400 },
  );
}
export async function readJson(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 200000)
    throw new HttpError(413, "Request too large");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Empty request body");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 200000) {
      await reader.cancel();
      throw new HttpError(413, "Request too large");
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
