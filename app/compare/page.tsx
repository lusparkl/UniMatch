import { Shell } from "@/components/shell";
import { Compare } from "@/components/compare";
import { listPrograms } from "@/lib/catalog";
import { demoMode } from "@/lib/config";
export const dynamic = "force-dynamic";
// The URL carries programme IDs only; the profile stays in the browser.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const ids = ((await searchParams).ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 3);
  const programs = await listPrograms();
  return (
    <Shell demo={demoMode()}>
      <main className="container">
        <Compare
          programs={ids.flatMap((id) => programs.filter((p) => p.id === id))}
        />
      </main>
    </Shell>
  );
}
