import { getPrograms, loadSnapshot } from "@/lib/catalog";
import { catalogSource, demoMode } from "@/lib/config";
export const dynamic = "force-dynamic";
// Deployment check. In snapshot mode it reads only the bundled JSON, never the database.
export async function GET() {
  const programs = await getPrograms();
  const source = demoMode() ? "demo" : catalogSource();
  const lastVerified =
    programs
      .map((p) => p.lastResearched)
      .filter((d) => d !== null)
      .sort()
      .at(-1) ?? null;
  return Response.json({
    catalogSource: source,
    programmes: programs.length,
    institutions: new Set(programs.map((p) => p.universityId)).size,
    lastVerified,
    commit:
      (source === "snapshot" ? loadSnapshot().commit : null) ??
      process.env.GIT_COMMIT ??
      null,
  });
}
