import { apiError, checkOrigin, deleteSession, requireAdmin } from "@/lib/auth";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await requireAdmin();
    await deleteSession();
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
