import { Shell } from "@/components/shell";
import { Shortlist } from "@/components/shortlist";
import { listPrograms } from "@/lib/catalog";
import { demoMode } from "@/lib/config";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const ids = (await searchParams).ids
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 50);
  return (
    <Shell demo={demoMode()}>
      <main className="container">
        <Shortlist programs={await listPrograms()} sharedIds={ids} />
      </main>
    </Shell>
  );
}
