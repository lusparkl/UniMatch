import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { PrioritiesList, type PriorityRow } from "@/components/priorities-list";
import { currentUser } from "@/lib/account";
import { getPrograms } from "@/lib/catalog";
import { demoMode } from "@/lib/config";
import { db } from "@/lib/db";
import { profileSchema } from "@/lib/domain";
import { readiness } from "@/lib/readiness";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await currentUser();
  if (!user) redirect("/account?next=/priorities");
  const profile = profileSchema.safeParse(user.profile);
  const [priorities, documents, programs] = await Promise.all([
    db.priority.findMany({
      where: { userId: user.id },
      orderBy: { rank: "asc" },
    }),
    db.userDocument.findMany({ where: { userId: user.id } }),
    getPrograms(),
  ]);
  const tracked = Object.fromEntries(documents.map((d) => [d.kind, d.status]));
  const rows = priorities.flatMap((priority): PriorityRow[] => {
    const program = programs.find((p) => p.id === priority.programId);
    if (!program) return [];
    const base = {
      programId: program.id,
      university: program.university,
      title: program.title,
      country: program.country,
      universityId: program.universityId,
    };
    if (!profile.success)
      return [
        { ...base, status: null, deadline: null, tests: [], documents: [] },
      ];
    const r = readiness(program, profile.data, tracked);
    return [
      {
        ...base,
        status: r.match.status,
        deadline: r.deadline,
        tests: r.tests.map((t) => ({
          label: t.label,
          state: t.state,
          reason: t.reason,
        })),
        documents: r.documents.map((d) => ({
          label: d.label,
          mandatory: d.mandatory,
          have: d.have,
          typical: d.typical,
        })),
      },
    ];
  });
  return (
    <Shell demo={demoMode()}>
      <main className="container">
        <PrioritiesList rows={rows} hasProfile={profile.success} />
      </main>
    </Shell>
  );
}
