import { apiError, checkOrigin, HttpError, readJson } from "@/lib/auth";
import {
  createUserSession,
  credentialsSchema,
  currentUser,
  destroyUserSession,
  hashPassword,
  limitAttempts,
  verifyPassword,
} from "@/lib/account";
import { db } from "@/lib/db";
type Context = { params: Promise<{ action: string }> };
// Compared when the email is unknown so sign-in takes the same time either way.
const DUMMY_HASH =
  "$2b$12$AFKeNJjArTfHd0Ubt4FThuq1inrOWjvhdzR5w8nPJs0uErvdKCp0C";
export async function GET(_request: Request, { params }: Context) {
  try {
    if ((await params).action !== "me") throw new HttpError(404, "Not found");
    const user = await currentUser();
    return Response.json({ user: user ? { email: user.email } : null });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    checkOrigin(request);
    const action = (await params).action;
    if (action === "logout") {
      await destroyUserSession();
      return Response.json({ ok: true });
    }
    if (action !== "signup" && action !== "login")
      throw new HttpError(404, "Not found");
    const { email, password } = credentialsSchema.parse(
      await readJson(request),
    );
    await limitAttempts("auth:" + action + ":global", 300, 3600);
    await limitAttempts("auth:" + action + ":" + email, 10, 900);
    if (action === "signup") {
      if (await db.user.findUnique({ where: { email } }))
        throw new HttpError(409, "An account with this email already exists");
      const user = await db.user.create({
        data: { email, passwordHash: await hashPassword(password) },
      });
      await createUserSession(user.id);
      return Response.json({ ok: true });
    }
    const user = await db.user.findUnique({ where: { email } });
    const valid = await verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_HASH,
    );
    if (!user || !valid) throw new HttpError(401, "Invalid email or password");
    await createUserSession(user.id);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
